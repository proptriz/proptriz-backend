import logger from "../config/loggingConfig";
import { postcodeConfig as cfg } from "./config";

export class NipostError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "NipostError";
  }
}

// Per-process sliding window + circuit breaker. On serverless each instance has its own;
// the Mongo cache is what keeps total upstream traffic low.
const calls: number[] = [];
let failures = 0;
let openUntil = 0;

function takeSlot(): void {
  const now = Date.now();
  while (calls.length && calls[0] < now - 60_000) calls.shift();
  if (calls.length >= cfg.maxRpm) throw new NipostError("local_rate_limit", 429, "Postcode request budget exhausted");
  calls.push(now);
}

function trip(): void {
  if (++failures >= 5) {
    openUntil = Date.now() + 30_000;
    failures = 0;
  }
}

type Params = Record<string, string | number | undefined>;

/** Calls the NIPOST gateway and returns the `data` envelope. The secret key never leaves the server. */
export async function nipost<T>(path: string, params: Params = {}): Promise<T> {
  if (!cfg.enabled) throw new NipostError("not_configured", 503, "NIPOST_API_KEY is not set");
  if (Date.now() < openUntil) throw new NipostError("circuit_open", 503, "Postcode service temporarily unavailable");
  takeSlot();

  const url = new URL(cfg.baseUrl + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, { headers: { "X-API-Key": cfg.apiKey, Accept: "application/json" }, signal: ctrl.signal });
    console.log("nipost", {res});
    if (res.ok) {
      failures = 0;
      const body = (await res.json()) as { data?: T };
      logger.debug("nipost", { path, params, status: res.status, ok: res.ok, body });
      return (body.data ?? body) as T;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    logger.debug("nipost", { path, params, status: res.status, ok: res.ok, body });
    if (res.status >= 500) trip();
    logger.error("nipost error", { path, params, status: res.status, ok: res.ok, body });
    throw new NipostError(body.error?.code ?? `http_${res.status}`, res.status, body.error?.message ?? res.statusText);
  } catch (e) {
    if (e instanceof NipostError) throw e;
    trip();
    logger.error("nipost error", { path, params, error: e });
    throw new NipostError("upstream_unreachable", 502, "Postcode service unreachable");
  } finally {
    clearTimeout(timer);
  }
}

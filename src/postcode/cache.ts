import { postcodeConfig as cfg } from "./config";
import { PostcodeCache, PostcodeUsage } from "./models";
import type { Wrapped } from "./types";

export type CacheKind = "autocomplete" | "lookup1" | "autofill" | "nearby" | "reference" | "country";

// Concurrent identical requests in one process share one upstream call.
const inflight = new Map<string, Promise<unknown>>();

const stable = (params: Record<string, string | number>) => JSON.stringify(params, Object.keys(params).sort());

function bump(kind: CacheKind, field: "upstream" | "cacheHits" | "staleServed" | "failures"): void {
  const day = new Date().toISOString().slice(0, 10);
  PostcodeUsage.updateOne({ day, kind }, { $inc: { [field]: 1 } }, { upsert: true }).catch(() => undefined);
}

export interface CachedOptions<T> {
  kind: CacheKind;
  params: Record<string, string | number>;
  ttl: number; // seconds
  missTtl?: number; // seconds, for negative results
  isMiss?: (value: T) => boolean;
  load: () => Promise<T>;
}

/**
 * Read-through cache: fresh hit -> return; otherwise call upstream (coalesced), store,
 * and on upstream failure fall back to a stale copy if one exists.
 */
export async function cached<T>(opts: CachedOptions<T>): Promise<Wrapped<T>> {
  const key = `${opts.kind}:${stable(opts.params)}`;
  const doc = await PostcodeCache.findOne({ key }).lean();
  const now = Date.now();

  if (doc && doc.freshUntil.getTime() > now) {
    bump(opts.kind, "cacheHits");
    PostcodeCache.updateOne({ key }, { $inc: { hits: 1 } }).catch(() => undefined);
    return { value: doc.payload as T, cached: true, stale: false };
  }

  let leader = false;
  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    leader = true;
    pending = opts.load().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    const value = await pending;
    if (leader) {
      bump(opts.kind, "upstream");
      const miss = opts.isMiss ? opts.isMiss(value) : false;
      const ttl = miss ? opts.missTtl ?? 3600 : opts.ttl;
      const freshUntil = new Date(now + ttl * 1000);
      const expiresAt = new Date(freshUntil.getTime() + cfg.staleGraceSeconds * 1000);
      await PostcodeCache.updateOne(
        { key },
        { $set: { kind: opts.kind, payload: value, miss, freshUntil, expiresAt }, $setOnInsert: { hits: 0 } },
        { upsert: true }
      );
    }
    return { value, cached: false, stale: false };
  } catch (err) {
    if (leader) bump(opts.kind, "failures");
    if (doc) {
      bump(opts.kind, "staleServed");
      return { value: doc.payload as T, cached: true, stale: true };
    }
    throw err;
  }
}

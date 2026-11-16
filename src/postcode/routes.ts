import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import logger from "../config/loggingConfig";
import { verifyToken } from "../middlewares/verifyToken";
import { NipostError } from "./nipostClient";
import * as svc from "./service";
import type { Wrapped } from "./types";

/**
 * Mounted at /api/v1/postcode. Every call goes to NIPOST through the server-side cache;
 * the secret key never reaches the browser. Non-Nigerian coordinates/countries return 422.
 */

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, code, message });

const ok = <T>(res: Response, w: Wrapped<T>) =>
  res.status(200).json({ success: true, data: w.value, meta: { cached: w.cached, stale: w.stale } });

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function readLatLng(src: Record<string, unknown>): { lat: number; lng: number } | null {
  const lat = num(src.lat ?? src.latitude);
  const lng = num(src.lng ?? src.longitude);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Small per-user/IP limiter. Per process (fine on Vercel: the Mongo cache does the heavy lifting). */
function limit(max: number, windowMs = 60_000): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const key = req.currentUser?._id?.toString() ?? req.ip ?? "anon";
    const cur = hits.get(key);
    const h = cur && cur.reset > now ? cur : { n: 0, reset: now + windowMs };
    h.n += 1;
    hits.set(key, h);
    if (h.n > max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      return fail(res, 429, "rate_limited", "Too many requests");
    }
    next();
  };
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const postcodeRouter = Router();

// Typing UI: "LA 11 U" -> next-segment suggestions
postcodeRouter.get(
  "/autocomplete",
  limit(120),
  wrap(async (req, res) => {
    const q = str(req.query.q);
    if (!q || q.length < 2 || q.length > 20) return fail(res, 400, "invalid_request", "q must be 2-20 characters");
    res.setHeader("Cache-Control", "private, max-age=60");
    return ok(res, await svc.autocomplete(q));
  })
);

postcodeRouter.get(
  "/validate",
  limit(60),
  wrap(async (req, res) => {
    const code = str(req.query.code);
    if (!code) return fail(res, 400, "invalid_request", "code is required");
    return ok(res, await svc.validate(code));
  })
);

// Dropped pin -> nearest postcode (used by the Add Property location step)
postcodeRouter.post(
  "/resolve",
  verifyToken,
  limit(30),
  wrap(async (req, res) => {
    const ll = readLatLng(req.body ?? {});
    if (!ll) return fail(res, 400, "invalid_request", "lat and lng are required");
    return ok(res, await svc.resolveFromCoords(ll.lat, ll.lng, str(req.body.country)));
  })
);

// One call for the listing form: country, state / LGA / area names and (Nigeria) the nearest postcode.
// Works for any country; `supported: false` means "no postcode here", not an error.
postcodeRouter.post(
  "/locate",
  verifyToken,
  limit(40),
  wrap(async (req, res) => {
    const ll = readLatLng(req.body ?? {});
    if (!ll) return fail(res, 400, "invalid_request", "lat and lng are required");
    const data = await svc.locate(ll.lat, ll.lng, str(req.body.address));
    return res.status(200).json({ success: true, data });
  })
);

// Typed postcode vs dropped pin -> drives the "Postcode verified" badge
postcodeRouter.post(
  "/verify",
  verifyToken,
  limit(30),
  wrap(async (req, res) => {
    const ll = readLatLng(req.body ?? {});
    const code = str(req.body?.code);
    if (!ll || !code) return fail(res, 400, "invalid_request", "code, lat and lng are required");
    const w = await svc.verifyAgainstPin(code, ll.lat, ll.lng, str(req.body.country));
    const names = w.value.valid && w.value.segments ? await svc.adminNames(w.value.segments) : {};
    return ok(res, { ...w, value: { ...w.value, ...names } });
  })
);

// Paid (credits). Signed-in users only; cached 30 days per code.
postcodeRouter.get(
  "/autofill",
  verifyToken,
  limit(20),
  wrap(async (req, res) => {
    const code = str(req.query.code);
    if (!code) return fail(res, 400, "invalid_request", "code is required");
    return ok(res, await svc.autofill(code));
  })
);

postcodeRouter.get("/reference/states", limit(60), wrap(async (_req, res) => ok(res, await svc.listStates())));

postcodeRouter.get(
  "/reference/lgas",
  limit(60),
  wrap(async (req, res) => {
    const state = str(req.query.state)?.toUpperCase();
    if (!state || !/^[A-Z]{2}$/.test(state)) return fail(res, 400, "invalid_request", "state must be a 2-letter code");
    return ok(res, await svc.listLgas(state));
  })
);

postcodeRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof svc.PostcodeServiceError) return fail(res, err.status, err.code, err.message);
  if (err instanceof NipostError) {
    if (err.status === 402 || err.status === 403) {
      logger.error(`[postcode] ${err.code}: ${err.message}`); // credits or access level: our side
      return fail(res, 503, "postcode_feature_unavailable", "This postcode feature is unavailable right now");
    }
    if (err.status === 401) {
      logger.error("[postcode] NIPOST rejected our API key");
      return fail(res, 502, "upstream_auth", "Postcode service misconfigured");
    }
    if (err.status === 429) {
      res.setHeader("Retry-After", "5");
      return fail(res, 429, "busy", "Postcode service is busy, try again shortly");
    }
    return fail(res, 503, "postcode_unavailable", "Postcode service unavailable");
  }
  logger.error("[postcode] unexpected error:", err);
  return fail(res, 500, "internal_error", "Something went wrong");
});

export default postcodeRouter;

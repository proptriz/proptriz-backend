import { env } from "../utils/env";

const DAY = 86_400;
const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

export const postcodeConfig = {
  enabled: !!env.NGN_POSTCODE,
  baseUrl: (env.NGN_POSTCODE_BASE_URL || "https://api.postcode.gov.ng").replace(/\/$/, ""),
  apiKey: env.NGN_POSTCODE,
  timeoutMs: num(env.NIPOST_TIMEOUT_MS, 4000),
  // NIPOST allows 600 requests/min per key. Per-process budget; on Vercel each instance gets its own.
  maxRpm: num(env.NIPOST_MAX_RPM, 400),
  // Leading segments shown publicly (3 = LA-11-U34-••-••).
  publicSegments: Math.min(5, Math.max(1, num(env.POSTCODE_PUBLIC_SEGMENTS, 3))),
  // A pin within this distance of the postcode unit counts as "verified".
  verifyMaxMeters: num(env.POSTCODE_VERIFY_MAX_M, 100),
  staleGraceSeconds: DAY,
  ttl: {
    autocomplete: 6 * 3600,
    validTrue: 30 * DAY,
    validFalse: 3600,
    nearbyHit: 7 * DAY,
    nearbyMiss: 3600,
    autofill: 30 * DAY, // credits are spent on a miss
    reference: 30 * DAY,
    country: 90 * DAY,
  },
  // Cost guard only (over-approximates Nigeria). The resolved country is the authority.
  nigeriaBBox: { minLat: 4.2, maxLat: 13.9, minLng: 2.6, maxLng: 14.7 },
  nominatimUserAgent: env.NOMINATIM_USER_AGENT || "Proptriz/1.0 (contact: support@proptriz.com)",
};

if (postcodeConfig.apiKey.startsWith("nipost_pk_")) {
  throw new Error("NGN_POSTCODE must be a secret key (nipost_test_/nipost_live_), never a publishable key");
}

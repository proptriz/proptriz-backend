# NIPOST postcode integration (Nigeria only)

Server-side proxy + cache for https://docs.postcode.gov.ng. The secret key (`NGN_POSTCODE`) never
reaches the browser. Listings outside Nigeria never trigger a NIPOST call.

## Env (.env)
```
NGN_POSTCODE=nipost_test_...        # already present. Live key needs verified KYB.
NGN_POSTCODE_BASE_URL=              # optional, defaults to https://api.postcode.gov.ng
NIPOST_MAX_RPM=400                  # optional per-process budget (NIPOST allows 600/min per key)
POSTCODE_PUBLIC_SEGMENTS=3          # optional: LA-11-U34-••-••
POSTCODE_VERIFY_MAX_M=100           # optional: pin within this distance of the unit => "verified"
NOMINATIM_USER_AGENT=Proptriz/1.0 (contact: you@proptriz.com)   # Nominatim policy requires one
```
Leaving `NGN_POSTCODE` empty disables the feature: listings still save, with no postcode.

## What changed
| File | Change |
|---|---|
| `models/property.ts` | `country`, `postcode{...}` (full code + segments are `select:false`), `place{...}`, 4 indexes |
| `types.ts` | `country?`, `postcode?` on `IProperty` |
| `services/property.service.ts` | create/update resolve country (Nominatim, cached) + postcode; collocated uses same-area ladder for NG; `recordContact`, `getFullPostcode` |
| `controllers/propertyController.ts` | `?postcode=` filter on `/all`; `recordContact`, `getPostcode` |
| `routes/property.routes.ts` | `POST /:pid/contact`, `GET /:pid/postcode` |
| `utils/app.ts` | mounts `/api/v1/postcode` |
| `utils/env.ts` | new env names |
| `models/propertyContact.ts` | new: lead per (property, user, channel) |
| `scripts/backfillPostcodes.ts` | new: attach postcodes to existing listings |

## Endpoints (`/api/v1/postcode`), all `{ success, data, meta: { cached, stale } }`
| Route | Auth | NIPOST call | Cost |
|---|---|---|---|
| `GET /autocomplete?q=LA 11 U` | none (IP limit) | `/v1/search/autocomplete` | free |
| `GET /validate?code=` | none | `/v1/lookup` level 1 | free |
| `POST /locate {lat,lng,address?}` | user | Nominatim reverse + (Nigeria) `/v1/search/nearby` + reference lists | free |
| `POST /resolve {lat,lng,country?}` | user | `/v1/search/nearby` (100 m) | free |
| `POST /verify {code,lat,lng,country?}` | user | nearby (300 m), then lookup L1 | free |
| `GET /autofill?code=` | user | `/v1/lookup` level 2 | **credits** (cached 30 d) |
| `GET /reference/states`, `/reference/lgas?state=LA` | none | reference lists | free |

Property endpoints: `POST /api/v1/property/:pid/contact {channel: call|email|chat}` records the lead
and returns `{ postcode }` (full code, or null). `GET /api/v1/property/:pid/postcode` returns it for
the owner or anyone who has contacted; otherwise `403 contact_required`.
`GET /api/v1/property/all?postcode=LA-11-U34` filters by the most specific tier the prefix allows.

`POST /locate` is what the listing form calls: it works in any country and returns
`{ country, supported, place: { country_name, region, subregion, area, verified }, postcode }`.
`supported: true` means Nigeria. `place.region` / `place.subregion` are the State and LGA names in
Nigeria (NIPOST reference lists, falling back to OpenStreetMap names) and county / sub-county etc. elsewhere.

Search and nearby:
- `GET /api/v1/property/locations/suggest?q=` returns search-box rows with listing counts, built from
  live listings: postcode prefixes for `LA 11 U`-style input, place names otherwise.
- `GET /api/v1/property/all` accepts `postcode=LA-11-U34` **or**
  `place_country=KE&place_region=..&place_subregion=..&place_area=..`. Add `widen=1` to fall back to the
  next wider level when the first page is empty; the response then carries `match_tier`, `widened` and
  `applied` (send `applied` back as the filter for the next page). A chosen place replaces the map bounds.
- `GET /api/v1/property/collocated-prop/:pid?tier=auto|area|district|subregion|region|distance` returns
  `{ properties, match_tier, tiers }`. `auto` picks the most specific level with at least 2 listings.

Every listing now also stores `place` (public): `{ country_name, region, subregion, area, verified }`.
Outside Nigeria `verified` means the typed address mentions the area, sub-region or region the pin is in.

Create/update accept two optional form fields: `postcode_input` (typed by the agent) and `country`
(ISO-2, if the client already knows it). Without `country` the server reverse-geocodes the pin with
Nominatim once per ~1 km cell (cached 90 days), falling back to "NG" inside Nigeria's bounding box.

## Caching
`postcode_cache` (TTL index): autocomplete 6 h; valid code 30 d, invalid 1 h; nearby 7 d (coords
rounded to 4 dp), empty 1 h; autofill 30 d; reference 30 d; country 90 d. Entries are kept 24 h past
expiry and served `stale: true` if upstream fails. `postcode_usage` has daily counters.

## Before going live
1. **Nearby response shape** is documented only as "Units with distances". `normalizeNearby()` in
   `service.ts` guesses `postcode`/`code` and `distance_m`/`distance` (metres). Run one sandbox call
   (`FC-01-A01-KP-27` is in the FCT sandbox) and adjust that single function if needed.
2. The in-memory limiter/circuit breaker is per process (Vercel instance). Fine for now; the Mongo
   cache is what keeps upstream traffic low.
3. The state / LGA reference response shape is also undocumented: `adminNames()` in `service.ts` accepts
   `code`/`name` and a few variants, and falls back to OpenStreetMap names if it can't read them.
4. The search suggestions, tiered nearby lookup and widening are Mongo aggregations that were
   type-checked but not run against a database. Try them on a dev database first.
5. Run `npx ts-node scripts/backfillPostcodes.ts --dry-run`, then without the flag, once a live key is
   in place (the sandbox resolves public buildings in FCT only).

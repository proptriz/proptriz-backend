import { cached } from "./cache";
import { postcodeConfig as cfg } from "./config";
import { addressMatchesPlace, inNigeriaBBox, reversePlace, resolveCountry, type ReversePlace } from "./country";
import { maskPostcode, parsePostcode, parsePrefix } from "./format";
import { nipost } from "./nipostClient";
import type { Confidence, MatchTier, PropertyPlace, PropertyPostcode, Segments, Wrapped } from "./types";

export class PostcodeServiceError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "PostcodeServiceError";
  }
}

/** Postcodes exist for Nigeria only. Never spend NIPOST calls on other countries. */
export function assertNigeria(country?: string, lat?: number, lng?: number): void {
  if (country && country.toUpperCase() !== "NG") {
    throw new PostcodeServiceError("country_not_supported", 422, "Postcodes are only available for Nigeria");
  }
  if (lat !== undefined && lng !== undefined && !inNigeriaBBox(lat, lng)) {
    throw new PostcodeServiceError("country_not_supported", 422, "Location is outside Nigeria");
  }
}

export const publicPostcode = (code: string) => maskPostcode(code, cfg.publicSegments);

// ---------- autocomplete / validate / autofill ----------

export interface AutocompleteData {
  segment: "state" | "lga" | "district" | "area" | "unit";
  suggestions: { code: string; label: string }[];
}

export function autocomplete(q: string): Promise<Wrapped<AutocompleteData>> {
  const norm = q.trim().toUpperCase().replace(/\s+/g, " ");
  return cached<AutocompleteData>({
    kind: "autocomplete",
    params: { q: norm },
    ttl: cfg.ttl.autocomplete,
    load: () => nipost<AutocompleteData>("/v1/search/autocomplete", { q: norm }),
  });
}

export interface LookupData {
  postcode: string;
  valid: boolean;
  administrative_address?: Record<string, unknown>;
  recent_house_address?: Record<string, unknown>;
  building_use_status?: string;
}

/** Lookup level 1 (Postcode Validator): free. */
export async function validate(code: string): Promise<Wrapped<LookupData>> {
  const p = parsePostcode(code);
  if (!p) return { value: { postcode: code, valid: false }, cached: false, stale: false };
  return cached<LookupData>({
    kind: "lookup1",
    params: { code: p.postcode },
    ttl: cfg.ttl.validTrue,
    missTtl: cfg.ttl.validFalse,
    isMiss: (v) => !v.valid,
    load: () => nipost<LookupData>("/v1/lookup", { code: p.postcode, level: 1 }),
  });
}

/** Lookup level 2 (Postcode Autofill): costs credits on every cache miss. */
export async function autofill(code: string): Promise<Wrapped<LookupData>> {
  const p = parsePostcode(code);
  if (!p) throw new PostcodeServiceError("invalid_postcode", 400, "Not a valid postcode format");
  return cached<LookupData>({
    kind: "autofill",
    params: { code: p.postcode, level: 2 },
    ttl: cfg.ttl.autofill,
    missTtl: cfg.ttl.validFalse,
    isMiss: (v) => !v.valid,
    load: () => nipost<LookupData>("/v1/lookup", { code: p.postcode, level: 2 }),
  });
}

// ---------- reference lists (free) ----------

type NamedCode = { code: string; name?: string };

export const listStates = () =>
  cached<{ states: NamedCode[] }>({
    kind: "reference",
    params: { p: "states" },
    ttl: cfg.ttl.reference,
    load: () => nipost("/v1/reference/states"),
  });

export const listLgas = (state: string) =>
  cached<{ lgas: NamedCode[] }>({
    kind: "reference",
    params: { p: "lgas", state },
    ttl: cfg.ttl.reference,
    load: () => nipost("/v1/reference/lgas", { state }),
  });

// ---------- pin -> postcode (free nearby search) ----------

interface NearbyUnit {
  postcode: string;
  distanceM: number;
}

/**
 * The docs describe the nearby response only as "Units with distances".
 * Check one sandbox response and adjust the field names here; nothing else depends on them.
 * Assumes distances are in metres (the radius parameter is in metres).
 */
function normalizeNearby(raw: unknown): NearbyUnit[] {
  const r = raw as { units?: unknown[]; results?: unknown[] } | unknown[] | undefined;
  const arr = (Array.isArray(r) ? r : r?.units ?? r?.results ?? []) as Record<string, unknown>[];
  const out: NearbyUnit[] = [];
  for (const u of arr) {
    const parsed = parsePostcode(String(u.postcode ?? u.code ?? ""));
    const d = Number(u.distance_m ?? u.distance);
    if (parsed && Number.isFinite(d)) out.push({ postcode: parsed.postcode, distanceM: d });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4; // ~11 m grid: better cache hits, tiny error

function nearby(lat: number, lng: number, radius: number): Promise<Wrapped<unknown>> {
  return cached<unknown>({
    kind: "nearby",
    params: { lat: round4(lat), lng: round4(lng), radius },
    ttl: cfg.ttl.nearbyHit,
    missTtl: cfg.ttl.nearbyMiss,
    isMiss: (v) => normalizeNearby(v).length === 0,
    load: () => nipost<unknown>("/v1/search/nearby", { lat: round4(lat), lng: round4(lng), radius }),
  });
}

const confidenceFor = (m: number): Confidence => (m <= 25 ? "high" : m <= 75 ? "medium" : "low");

export interface ResolveResult {
  found: boolean;
  postcode?: string;
  segments?: Segments;
  distanceM?: number;
  confidence?: Confidence;
}

export async function resolveFromCoords(lat: number, lng: number, country?: string): Promise<Wrapped<ResolveResult>> {
  assertNigeria(country, lat, lng);
  const r = await nearby(lat, lng, 100);
  const best = normalizeNearby(r.value)[0];
  if (!best) return { value: { found: false }, cached: r.cached, stale: r.stale };
  const p = parsePostcode(best.postcode)!;
  return {
    value: { found: true, postcode: p.postcode, segments: p.segments, distanceM: best.distanceM, confidence: confidenceFor(best.distanceM) },
    cached: r.cached,
    stale: r.stale,
  };
}

export interface VerifyResult {
  postcode?: string;
  segments?: Segments;
  valid: boolean;
  matched: boolean; // the typed code is among the units around the pin
  verified: boolean; // ...and within verifyMaxMeters
  distanceM?: number;
}

/** For a typed postcode: does it sit where the agent dropped the pin? */
export async function verifyAgainstPin(code: string, lat: number, lng: number, country?: string): Promise<Wrapped<VerifyResult>> {
  assertNigeria(country, lat, lng);
  const p = parsePostcode(code);
  if (!p) return { value: { valid: false, matched: false, verified: false }, cached: false, stale: false };
  const r = await nearby(lat, lng, 300);
  const hit = normalizeNearby(r.value).find((u) => u.postcode === p.postcode);
  const valid = hit ? true : (await validate(p.postcode)).value.valid;
  return {
    value: {
      postcode: p.postcode,
      segments: p.segments,
      valid,
      matched: !!hit,
      verified: !!hit && hit.distanceM <= cfg.verifyMaxMeters,
      distanceM: hit?.distanceM,
    },
    cached: r.cached,
    stale: r.stale,
  };
}

// ---------- state / LGA names (free reference lists) ----------

type RefItem = Record<string, unknown>;
const refCode = (i: RefItem) => String(i.code ?? i.state_code ?? i.lga_code ?? i.id ?? "").toUpperCase();
const refName = (i: RefItem) => {
  const n = i.name ?? i.label ?? i.state_name ?? i.lga_name;
  return typeof n === "string" && n.trim() ? n.trim() : undefined;
};
const refList = (raw: unknown, key: string): RefItem[] => {
  const r = raw as Record<string, unknown> | unknown[] | undefined;
  return (Array.isArray(r) ? r : (r?.[key] as unknown[]) ?? []) as RefItem[];
};

/**
 * State and LGA names for a postcode's first two segments. The reference response shape is not
 * documented in detail, so this accepts `code`/`name` and a few likely variants, and returns
 * undefined names rather than failing (callers fall back to OpenStreetMap names).
 */
export async function adminNames(seg: Pick<Segments, "state" | "lga">): Promise<{ state_name?: string; lga_name?: string }> {
  try {
    const [states, lgas] = await Promise.all([listStates(), listLgas(seg.state)]);
    const state = refList(states.value, "states").find((i) => refCode(i) === seg.state);
    const lga = refList(lgas.value, "lgas").find((i) => {
      const c = refCode(i);
      return c === seg.lga || c === `${seg.state}-${seg.lga}` || c === `${seg.state}${seg.lga}`;
    });
    return { state_name: state && refName(state), lga_name: lga && refName(lga) };
  } catch {
    return {};
  }
}

// ---------- one call for the listing form: where is this pin? ----------

export interface LocateResult {
  country?: string; // ISO-2
  supported: boolean; // true = Nigeria, postcode features apply
  place: PropertyPlace;
  postcode: ResolveResult | null; // Nigeria only
}

const stripSuffix = (n?: string) => n?.replace(/\s+(State|LGA)$/i, "");

async function placeFor(
  country: string | undefined,
  rev: ReversePlace | null,
  segments: Pick<Segments, "state" | "lga"> | undefined
): Promise<Omit<PropertyPlace, "verified">> {
  const names = country === "NG" && segments ? await adminNames(segments) : {};
  return {
    country_name: rev?.country_name ?? (country === "NG" ? "Nigeria" : undefined),
    region: names.state_name ?? (country === "NG" ? stripSuffix(rev?.region) : rev?.region),
    subregion: names.lga_name ?? rev?.subregion,
    area: rev?.area,
  };
}

export async function locate(lat: number, lng: number, address?: string): Promise<LocateResult> {
  const rev = await reversePlace(lat, lng);
  const country = await resolveCountry(lat, lng, undefined, rev);

  if (country !== "NG" || !cfg.enabled) {
    const place = await placeFor(country, rev, undefined);
    return { country, supported: false, place: { ...place, verified: addressMatchesPlace(address, place) }, postcode: null };
  }

  let postcode: ResolveResult | null = null;
  try {
    postcode = (await resolveFromCoords(lat, lng, "NG")).value;
  } catch {
    postcode = null; // NIPOST down: the form still shows state / LGA from the map data
  }
  const place = await placeFor("NG", rev, postcode?.segments);
  const verified = !!postcode?.found && (postcode.distanceM ?? Infinity) <= cfg.verifyMaxMeters;
  return { country, supported: true, place: { ...place, verified }, postcode };
}

// ---------- used by PropertyService and the backfill ----------

export interface LocationInput {
  lat: number;
  lng: number;
  country?: string; // ISO-2 if the client already knows it
  address?: string;
  typedPostcode?: string;
}

export interface PropertyLocation {
  country?: string;
  postcode?: PropertyPostcode;
  place?: PropertyPlace;
}

/** NIPOST part only. Never throws for postcode problems: the listing publishes, just unverified. */
export async function buildPropertyPostcode(i: { country: string; lat: number; lng: number; typedPostcode?: string }): Promise<PropertyPostcode> {
  const unchecked: PropertyPostcode = { verified: false }; // checked_at unset => backfill retries
  if (i.country.toUpperCase() !== "NG" || !cfg.enabled) return unchecked;

  try {
    if (i.typedPostcode) {
      const v = (await verifyAgainstPin(i.typedPostcode, i.lat, i.lng, "NG")).value;
      if (v.valid && v.postcode) {
        return {
          code: v.postcode,
          public_code: publicPostcode(v.postcode),
          segments: v.segments,
          verified: v.verified,
          distance_m: v.distanceM,
          confidence: v.distanceM !== undefined ? confidenceFor(v.distanceM) : undefined,
          checked_at: new Date(),
        };
      }
    }
    const r = (await resolveFromCoords(i.lat, i.lng, "NG")).value;
    if (r.found && r.postcode) {
      return {
        code: r.postcode,
        public_code: publicPostcode(r.postcode),
        segments: r.segments,
        confidence: r.confidence,
        distance_m: r.distanceM,
        verified: (r.distanceM ?? Infinity) <= cfg.verifyMaxMeters,
        checked_at: new Date(),
      };
    }
    return { verified: false, checked_at: new Date() }; // checked, nothing found (land, new build, coverage gap)
  } catch {
    return unchecked; // service down: leave for the backfill
  }
}

/**
 * Everything the Property document stores about where the pin is: country, postcode (Nigeria only)
 * and state / LGA / area names. Never throws.
 */
export async function buildPropertyLocation(i: LocationInput): Promise<PropertyLocation> {
  const rev = await reversePlace(i.lat, i.lng);
  const country = await resolveCountry(i.lat, i.lng, i.country, rev);
  if (!country) return {};

  const postcode =
    country === "NG" ? await buildPropertyPostcode({ country, lat: i.lat, lng: i.lng, typedPostcode: i.typedPostcode }) : undefined;
  const names = await placeFor(country, rev, postcode?.segments);
  const verified = country === "NG" ? !!postcode?.verified : addressMatchesPlace(i.address, names);
  return { country, postcode, place: { ...names, verified } };
}

// ---------- search tiers ----------

export interface TierFilter {
  tier: Exclude<MatchTier, "distance">;
  filter: Record<string, string>;
}

/**
 * Nigeria: same area -> district -> LGA -> state from a postcode or prefix ("LA-11-U34").
 * Run each tier in order until you have enough results.
 */
export function ladderFilters(code: string): TierFilter[] {
  const parts: Partial<Segments> | null = parsePostcode(code)?.segments ?? parsePrefix(code);
  if (!parts) return [];
  const tiers = [
    ["area", ["state", "lga", "district", "area"]],
    ["district", ["state", "lga", "district"]],
    ["subregion", ["state", "lga"]],
    ["region", ["state"]],
  ] as const;
  return tiers
    .filter(([, keys]) => keys.every((k) => parts[k]))
    .map(([tier, keys]) => ({
      tier,
      filter: { country: "NG", ...Object.fromEntries(keys.map((k) => [`postcode.segments.${k}`, parts[k]!])) },
    }));
}

/** Any country: same neighbourhood -> sub-region -> region, from stored place names. */
export function placeLadderFilters(p: { country?: string; region?: string; subregion?: string; area?: string }): TierFilter[] {
  if (!p.country) return [];
  const base = { country: p.country.toUpperCase() };
  const out: TierFilter[] = [];
  if (p.region && p.subregion && p.area) {
    out.push({ tier: "area", filter: { ...base, "place.region": p.region, "place.subregion": p.subregion, "place.area": p.area } });
  }
  if (p.region && p.subregion) out.push({ tier: "subregion", filter: { ...base, "place.region": p.region, "place.subregion": p.subregion } });
  if (p.region) out.push({ tier: "region", filter: { ...base, "place.region": p.region } });
  return out;
}

/**
 * Splits whatever the user typed in the search box into complete postcode segments plus a partial
 * one ("LA11U" -> complete {state: LA, lga: 11}, partial "U" on district). Null if it isn't postcode-like.
 */
export function parseTypedPrefix(input: string): { complete: Partial<Segments>; partialKey?: keyof Segments; partial?: string } | null {
  const raw = String(input).toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{2}(\d|$)/.test(raw)) return null; // "LA" or "LA1…"; plain words like "Lekki" are names
  const shapes: [keyof Segments, RegExp, RegExp][] = [
    ["state", /^[A-Z]{2}/, /^[A-Z]{1,2}$/],
    ["lga", /^\d{2}/, /^\d{1,2}$/],
    ["district", /^[A-Z]\d{2}/, /^[A-Z]\d{0,2}$/],
    ["area", /^[A-Z]{2}/, /^[A-Z]{1,2}$/],
    ["unit", /^\d{2}/, /^\d{1,2}$/],
  ];
  const complete: Partial<Segments> = {};
  let rest = raw;
  for (const [key, full, part] of shapes) {
    if (!rest) break;
    const m = full.exec(rest);
    if (m) {
      complete[key] = m[0];
      rest = rest.slice(m[0].length);
      continue;
    }
    if (part.test(rest)) return { complete, partialKey: key, partial: rest };
    return null;
  }
  return rest ? null : { complete };
}

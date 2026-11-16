import logger from "../config/loggingConfig";
import { cached } from "./cache";
import { postcodeConfig as cfg } from "./config";
import type { PropertyPlace } from "./types";

const ISO2 = /^[A-Za-z]{2}$/;
const round3 = (n: number) => Math.round(n * 1000) / 1000; // ~110 m grid

export interface ReversePlace {
  country: string | null; // ISO-3166 alpha-2
  country_name?: string;
  region?: string; // state / county / province
  subregion?: string; // LGA / sub-county / commune
  area?: string; // neighbourhood / suburb / village
}

const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

/** The frontend already uses Nominatim; the same `address` fields are read here. */
async function nominatimReverse(lat: number, lng: number): Promise<ReversePlace> {
  const url =
    "https://nominatim.openstreetmap.org/reverse?" +
    new URLSearchParams({ lat: String(lat), lon: String(lng), format: "json", zoom: "16", addressdetails: "1" });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": cfg.nominatimUserAgent, "Accept-Language": "en" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    const cc = a.country_code;
    const region = clean(a.state ?? a.region ?? a.province);
    const subregion = clean(a.county ?? a.state_district ?? a.city ?? a.town ?? a.municipality);
    const area = clean(a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.village ?? a.hamlet);
    return {
      country: cc && ISO2.test(cc) ? cc.toUpperCase() : null,
      country_name: clean(a.country),
      region,
      subregion: subregion && subregion !== region ? subregion : undefined,
      area: area && area !== subregion ? area : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function inNigeriaBBox(lat: number, lng: number): boolean {
  const b = cfg.nigeriaBBox;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Country + administrative names for a pin (Nominatim, cached per ~110 m cell). Null when unavailable. */
export async function reversePlace(lat: number, lng: number): Promise<ReversePlace | null> {
  try {
    const r = await cached<ReversePlace>({
      kind: "country",
      params: { lat: round3(lat), lng: round3(lng), v: 2 },
      ttl: cfg.ttl.country,
      missTtl: 3600,
      isMiss: (v) => !v.country,
      load: () => nominatimReverse(lat, lng),
    });
    return r.value;
  } catch (e: any) {
    logger.warn("Reverse geocoding failed:", e?.message);
    return null;
  }
}

/**
 * ISO-3166 alpha-2 for a pin. Order: value the client sent -> Nominatim reverse ->
 * "NG" if inside Nigeria's bounding box -> undefined.
 */
export async function resolveCountry(lat: number, lng: number, provided?: string, place?: ReversePlace | null): Promise<string | undefined> {
  if (provided && ISO2.test(provided)) return provided.toUpperCase();
  const p = place === undefined ? await reversePlace(lat, lng) : place;
  if (p?.country) return p.country;
  return inNigeriaBBox(lat, lng) ? "NG" : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True when the typed address mentions the area, sub-region or region the pin sits in. */
export function addressMatchesPlace(address: string | undefined, place: Pick<PropertyPlace, "region" | "subregion" | "area">): boolean {
  if (!address) return false;
  const hay = ` ${norm(address)} `;
  return [place.area, place.subregion, place.region]
    .filter((n): n is string => !!n)
    .map((n) => norm(n).replace(/ (state|county|province|lga)$/, ""))
    .some((n) => n.length >= 3 && hay.includes(` ${n} `));
}

import type { Segments } from "./types";

const SEG = [/^[A-Z]{2}$/, /^\d{2}$/, /^[A-Z]\d{2}$/, /^[A-Z]{2}$/, /^\d{2}$/];
const KEYS = ["state", "lga", "district", "area", "unit"] as const;
const COMPACT = /^([A-Z]{2})(\d{2})([A-Z]\d{2})([A-Z]{2})(\d{2})$/;

/** Local format check for cache keys and cheap rejection. NIPOST's lookup is the authority. */
export function parsePostcode(input: string): { postcode: string; segments: Segments } | null {
  const m = COMPACT.exec(String(input).toUpperCase().replace(/[\s-]/g, ""));
  if (!m) return null;
  const [, state, lga, district, area, unit] = m;
  return { postcode: [state, lga, district, area, unit].join("-"), segments: { state, lga, district, area, unit } };
}

/** Parses 1 to 5 complete segments, e.g. "LA-11-U34" or "LA 11". */
export function parsePrefix(input: string): Partial<Segments> | null {
  const parts = String(input).trim().toUpperCase().split(/[\s-]+/).filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  const out: Partial<Segments> = {};
  for (let i = 0; i < parts.length; i++) {
    if (!SEG[i].test(parts[i])) return null;
    out[KEYS[i]] = parts[i];
  }
  return out;
}

/** LA-11-U34-ZR-63 -> LA-11-U34-••-•• (keep = leading segments shown). */
export function maskPostcode(code: string, keep: number): string {
  return code
    .split("-")
    .map((s, i) => (i < keep ? s : "••"))
    .join("-");
}

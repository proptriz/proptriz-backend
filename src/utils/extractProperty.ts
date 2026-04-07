// src/utils/runExtractProperty.ts
//
// Cloudflare Workers AI wrapper for property data extraction.
//
// All normalisation happens HERE — the controller and the frontend client
// receive a clean, enum-correct NormalisedProperty and never need to
// massage LLM output themselves.
//
// Normalisation rules:
//   currency   : "NGN" → CurrencyEnum.naira  |  "USD" → CurrencyEnum.dollar  | …
//   listedFor  : "rental"/"rented" → ListForEnum.rent  |  "sell"/"purchase" → ListForEnum.sale
//   category   : "apartment"/"flat"/"duplex" → CategoryEnum.house  |  "plot" → CategoryEnum.land
//   status     : maps to PropertyStatusEnum values (available / sold / rented / unavailable / expired)
//   renewPeriod: "annual" → RenewalEnum.yearly  |  "daily"/"nightly" → RenewalEnum.daily
//   negotiable : "non-negotiable"/"fixed"/"firm" → "non-negotiable"  else "negotiable"
//   price      : strip all non-numeric chars, return numeric string
//   features   : string[] of amenity names (plain strings, no quantity objects)
//   coordinates: [0,0] or null/invalid → omitted (frontend uses its pinned location)
//   duration   : clamped 1–52 weeks
//   description: ALL input content (including unclassified details) is preserved
//                and formatted as a clean, readable paragraph

import { env }                 from "./env";
import { ListForEnum }         from "../models/enums/ListForEnum";
import { CurrencyEnum }        from "../models/enums/CurrencyEnum";
import { CategoryEnum }        from "../models/enums/CategoryEnum";
import { PropertyStatusEnum }  from "../models/enums/PropertyStatusEnum";
import { RenewalEnum }         from "../models/enums/RenewalEnum";

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPE
// Uses the actual backend enums so the controller can pass this directly
// to the property schema without any further mapping.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalisedProperty {
  title:        string;
  description:  string;    // clean, formatted paragraph — ALL input details preserved
  address:      string;
  price:        string;    // numeric string only, e.g. "4500000"
  currency:     CurrencyEnum;
  listedFor:    ListForEnum;
  category:     CategoryEnum;
  status:       PropertyStatusEnum;
  renewPeriod:  RenewalEnum;
  negotiable:   "negotiable" | "non-negotiable";
  duration:     number;    // 1–52 weeks
  features:     string[];  // plain amenity strings, e.g. ["garage", "wifi"]
  /**
   * Only present when the LLM extracted real coordinates (non-zero, in-bounds).
   * Omitted when unknown so the frontend keeps its pinned map location.
   */
  coordinates?: [number, number];
}

// ─────────────────────────────────────────────────────────────────────────────
// RAW LLM OUTPUT TYPE  (untrusted — normalise everything before use)
// ─────────────────────────────────────────────────────────────────────────────

interface RawLlmProperty {
  title?:        string | null;
  description?:  string | null;
  address?:      string | null;
  price?:        string | number | null;
  currency?:     string | null;
  listedFor?:    string | null;
  category?:     string | null;
  status?:       string | null;
  renewPeriod?:  string | null;
  negotiable?:   string | null;
  duration?:     number | string | null;
  features?:     string[] | null;
  coordinates?:  unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY_MAP: Record<string, CurrencyEnum> = {
  // Symbol inputs → ISO code enum values
  "₦": CurrencyEnum.naira,   NGN: CurrencyEnum.naira,   NAIRA: CurrencyEnum.naira,
  "$": CurrencyEnum.dollar,  USD: CurrencyEnum.dollar,  DOLLAR: CurrencyEnum.dollar,
  "£": CurrencyEnum.pound,   GBP: CurrencyEnum.pound,   POUND: CurrencyEnum.pound,
  "€": CurrencyEnum.euro,    EUR: CurrencyEnum.euro,    EURO: CurrencyEnum.euro,
};

function normCurrency(raw: string | null | undefined): CurrencyEnum {
  if (!raw) return CurrencyEnum.naira;
  return CURRENCY_MAP[raw.trim().toUpperCase()] ?? CurrencyEnum.naira;
}

// ─────────────────────────────────────────────────────────────────────────────

const LISTED_FOR_MAP: Record<string, ListForEnum> = {
  rent:     ListForEnum.rent,  rental:   ListForEnum.rent,
  renting:  ListForEnum.rent,  rented:   ListForEnum.rent,
  sale:     ListForEnum.sale,  sell:     ListForEnum.sale,
  selling:  ListForEnum.sale,  sold:     ListForEnum.sale,
  buy:      ListForEnum.sale,  purchase: ListForEnum.sale,
};

function normListedFor(raw: string | null | undefined): ListForEnum {
  if (!raw) return ListForEnum.rent;
  return LISTED_FOR_MAP[raw.trim().toLowerCase()] ?? ListForEnum.rent;
}

// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, CategoryEnum> = {
  // House variants
  house:       CategoryEnum.house,    home:        CategoryEnum.house,
  residential: CategoryEnum.house,    apartment:   CategoryEnum.house,
  flat:        CategoryEnum.house,    duplex:      CategoryEnum.house,
  bungalow:    CategoryEnum.house,    mansion:     CategoryEnum.house,
  terrace:     CategoryEnum.house,    villa:       CategoryEnum.house,
  // Shortlet / hotel
  shortlet:    CategoryEnum.shortlet, guesthouse:  CategoryEnum.shortlet,
  bnb:         CategoryEnum.shortlet, airbnb:      CategoryEnum.shortlet,
  "b&b":       CategoryEnum.shortlet,
  hotel:       CategoryEnum.hotel,
  // Office
  office:      CategoryEnum.office,
  // Commercial / shop
  commercial:  CategoryEnum.shop,     shop:        CategoryEnum.shop,
  store:       CategoryEnum.shop,     warehouse:   CategoryEnum.shop,
  // Land
  land:        CategoryEnum.land,     plot:        CategoryEnum.land,
  farmland:    CategoryEnum.land,
  // Others
  factory:     CategoryEnum.others,   others:      CategoryEnum.others,
  other:       CategoryEnum.others,   miscellaneous: CategoryEnum.others,
};

function normCategory(raw: string | null | undefined): CategoryEnum {
  if (!raw) return CategoryEnum.house;
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? CategoryEnum.house;
}

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, PropertyStatusEnum> = {
  available:   PropertyStatusEnum.available,
  sold:        PropertyStatusEnum.sold,
  rented:      PropertyStatusEnum.rented,
  taken:       PropertyStatusEnum.unavailable,
  occupied:    PropertyStatusEnum.unavailable,
  unavailable: PropertyStatusEnum.unavailable,
  reserved:    PropertyStatusEnum.unavailable,
  pending:     PropertyStatusEnum.unavailable,
  expired:     PropertyStatusEnum.expired,
};

function normStatus(raw: string | null | undefined): PropertyStatusEnum {
  if (!raw) return PropertyStatusEnum.available;
  return STATUS_MAP[raw.trim().toLowerCase()] ?? PropertyStatusEnum.available;
}

// ─────────────────────────────────────────────────────────────────────────────
// RenewalEnum now includes "daily" — no typo

const RENEWAL_MAP: Record<string, RenewalEnum> = {
  daily:      RenewalEnum.daily,    nightly:   RenewalEnum.daily,
  weekly:     RenewalEnum.weekely,
  monthly:    RenewalEnum.monthly,
  yearly:     RenewalEnum.yearly,   annual:    RenewalEnum.yearly,
  annually:   RenewalEnum.yearly,   "per year": RenewalEnum.yearly,
};

function normRenewal(raw: string | null | undefined): RenewalEnum {
  if (!raw) return RenewalEnum.yearly;
  return RENEWAL_MAP[raw.trim().toLowerCase()] ?? RenewalEnum.yearly;
}

// ─────────────────────────────────────────────────────────────────────────────

function normNegotiable(raw: string | null | undefined): "negotiable" | "non-negotiable" {
  if (!raw) return "negotiable";
  const lower = raw.trim().toLowerCase();
  return lower === "non-negotiable" || lower === "fixed" || lower === "firm"
    ? "non-negotiable"
    : "negotiable";
}

// ─────────────────────────────────────────────────────────────────────────────
//
// normPrice — handle shorthand multipliers BEFORE stripping non-numerics.
//
// The LLM (and users) often write prices like:
//   "4.5M", "4.5m", "1.2B", "500K", "₦4.5M/yr", "4,500k"
//
// Multiplier table:
//   k / K  → × 1,000        (thousands)
//   m / M  → × 1,000,000    (millions)
//   b / B  → × 1,000,000,000 (billions)
//
// Strategy:
//   1. Strip currency symbols and whitespace
//   2. Detect a trailing multiplier letter (k/m/b, case-insensitive)
//   3. Parse the numeric prefix (may include commas and a decimal point)
//   4. Multiply and return as a whole-number string
//   5. If no multiplier, fall back to stripping all non-numerics as before

function normPrice(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "0";

  const str = String(raw)
    .trim()
    // Remove currency symbols and common suffixes that are not multipliers
    .replace(/[₦$£€]/g, "")
    // Remove everything after a slash (e.g. "/yr", "/month")
    .replace(/\/.*$/, "")
    .trim();

  // Match: optional leading digits/commas/dots, then a multiplier letter at the end
  // e.g. "4.5M", "4,500k", "1.2b", "500 K"
  const multiplierMatch = str.match(/^([\d,.\s]+)\s*([kmb])$/i);

  if (multiplierMatch) {
    const numericPart = multiplierMatch[1].replace(/[,\s]/g, ""); // "4.5"
    const multiplierChar = multiplierMatch[2].toLowerCase();       // "m"

    const base = parseFloat(numericPart);
    if (!isNaN(base)) {
      const multipliers: Record<string, number> = {
        k: 1_000,
        m: 1_000_000,
        b: 1_000_000_000,
      };
      const value = Math.round(base * multipliers[multiplierChar]);
      return value > 0 ? String(value) : "0";
    }
  }

  // No multiplier — strip everything except digits and a single decimal point
  const cleaned = str.replace(/[^0-9.]/g, "");
  if (!cleaned) return "0";

  // Convert to integer string (prices are always whole numbers in practice)
  const asNumber = parseFloat(cleaned);
  return isNaN(asNumber) ? "0" : String(Math.round(asNumber));
}

// ─────────────────────────────────────────────────────────────────────────────
// normFeatures — plain string[] (no quantity objects)

function normFeatures(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : null))
    .filter((f): f is string => Boolean(f));
}

// ─────────────────────────────────────────────────────────────────────────────

function normCoordinates(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const lat = Number(raw[0]);
  const lng = Number(raw[1]);
  if (isNaN(lat) || isNaN(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;   // LLM sentinel for "unknown"
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lat, lng];
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISE — applies all helpers to produce a NormalisedProperty
// ─────────────────────────────────────────────────────────────────────────────

function normalise(raw: RawLlmProperty, originalDescription: string): NormalisedProperty {
  const coords = normCoordinates(raw.coordinates);

  const out: NormalisedProperty = {
    title:       raw.title?.trim()       || "",
    // description must contain ALL original detail — the LLM is instructed to
    // preserve every piece of information from the input and format it cleanly.
    // Fall back to the original text only if the model returned nothing at all.
    description: raw.description?.trim() || originalDescription.trim(),
    address:     raw.address?.trim()     || "",
    price:       normPrice(raw.price),
    currency:    normCurrency(raw.currency),
    listedFor:   normListedFor(raw.listedFor),
    category:    normCategory(raw.category),
    status:      normStatus(raw.status),
    renewPeriod: normRenewal(raw.renewPeriod),
    negotiable:  normNegotiable(raw.negotiable),
    duration:    Math.max(1, Math.min(52, Number(raw.duration) || 4)),
    features:    normFeatures(raw.features),
  };

  if (coords) out.coordinates = coords;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUDFLARE WORKERS AI CALL
// ─────────────────────────────────────────────────────────────────────────────

async function callCloudflareAI(model: string, messages: object[]): Promise<string> {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${env.CLOUDFLARE_AI_WORKERS_ACCOUNT_ID}/ai/run/${model}`;

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_WORKERS_TOKEN}` },
    body:    JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloudflare AI returned HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();

  const response: unknown = json?.result?.response;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("Cloudflare AI returned an empty or unexpected response shape.");
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXTRACTION
// LLMs frequently wrap output in markdown fences or add prose before the JSON.
// ─────────────────────────────────────────────────────────────────────────────

function extractJson(text: string): RawLlmProperty {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate  = fenceMatch ? fenceMatch[1].trim() : text.trim();

  const start = candidate.indexOf("{");
  const end   = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `LLM response does not contain a JSON object. Raw: ${text.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as RawLlmProperty;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM JSON: ${(err as Error).message}. Slice: ${candidate.slice(start, start + 300)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and normalise property data from a natural-language description.
 *
 * Returns a NormalisedProperty ready to be saved to the DB — every field
 * uses the actual backend enum values. No further coercion is needed by the
 * controller or the frontend client.
 *
 * Throws on network failure, empty AI response, or JSON parse error.
 */
async function runExtractProperty(description: string): Promise<NormalisedProperty> {
  const rawText = await callCloudflareAI("@cf/meta/llama-3-8b-instruct", [
    // ── SYSTEM ──────────────────────────────────────────────────────────────
    {
      role: "system",
      content: `
You are a strict real estate data extraction engine for Nigerian and international properties.

Your ONLY task:
- Extract structured property data from user descriptions
- Return ONLY a single raw JSON object — no markdown fences, no explanation, no preamble
- Every field must match the exact schema and allowed enum values provided

Critical rules:
- price: return ONLY the full integer value in digits — expand shorthand multipliers
  (k/K = ×1,000 | m/M = ×1,000,000 | b/B = ×1,000,000,000) then strip all
  currency symbols, commas, and suffixes. Example: "₦4.5M" → "4500000"
- features: extract amenity and facility names as plain strings only
- coordinates: [latitude, longitude] if reliably known; [0, 0] if uncertain
- status: default to "available" unless the description explicitly states otherwise
- description: rewrite the entire input as structured English paragraphs — overview,
  features, location, terms. Preserve ALL facts. Fix grammar. Do not omit anything.
      `.trim(),
    },

    // ── USER ────────────────────────────────────────────────────────────────
    {
      role: "user",
      content: `
Extract property data from the description below and return a single JSON object.

SCHEMA (return exactly this structure — no extra fields, no missing fields):
{
  "title":       string,
  "description": string,
  "address":     string,
  "price":       string,
  "currency":    "NGN" | "USD" | "GBP" | "EUR",
  "listedFor":   "rent" | "sale",
  "category":    "house" | "shortlet" | "hotel" | "office" | "land" | "shop" | "others",
  "status":      "available" | "sold" | "rented" | "unavailable" | "expired",
  "renewPeriod": "monthly" | "yearly" | "daily" | "weekly",
  "negotiable":  "negotiable" | "non-negotiable",
  "duration":    number,
  "features":    string[],
  "coordinates": [number, number]
}

FIELD-BY-FIELD RULES:

title
  → A short, clean listing headline (max ~10 words)
  → Include bedroom count, property type, and area if present
  → Example: "3 Bedroom Duplex for Rent in Lekki Phase 1"

description  ← MOST IMPORTANT FIELD
  → Rewrite the input as a clean, professional property listing description
  → Structure it in clear paragraphs using proper English sentences:
      Paragraph 1 — Overview: property type, bedroom/bathroom count, listing type (rent/sale), price, general location
      Paragraph 2 — Features & Facilities: every amenity mentioned (electricity, water, parking, BQ, pool, gym, security, etc.)
      Paragraph 3 — Location & Access: estate name, street, area, landmarks, road type, transport links
      Paragraph 4 — Terms & Contact: rent period, payment terms, agent name, phone number, inspection instructions, any other terms
  → PRESERVE EVERY detail from the input — nothing may be omitted even if informal, incomplete, or repetitive
  → Fix spelling, grammar, and punctuation — but do NOT change facts or invent details
  → If a section has no information, skip that paragraph rather than writing a placeholder

address
  → Full location string (street, area, city, state) if determinable
  → Empty string "" if location cannot be inferred

price
  → Return ONLY digits representing the full numeric value — no symbols, commas, or spaces
  → Expand shorthand multipliers BEFORE stripping:
      k or K → thousands   : "4.5k"  → "4500",  "500K"  → "500000"
      m or M → millions    : "4.5M"  → "4500000", "1.2m" → "1200000"
      b or B → billions    : "1.5B"  → "1500000000"
  → Strip all currency symbols (₦ $ £ €), commas, spaces, and suffixes (/yr /month)
  → Examples: "₦4,500,000" → "4500000" | "₦4.5M" → "4500000" | "$1.2B" → "1200000000"
  → "0" if no price is mentioned

currency
  → Detect from symbol: ₦ → "NGN", $ → "USD", £ → "GBP", € → "EUR"
  → Default "NGN" if no currency symbol or country is stated

listedFor
  → "rent" if: rent, let, per year, per month, per annum, monthly, shortlet
  → "sale" if: outright sale, for sale, buy, purchase, asking price

category
  → "house"    : house, apartment, flat, duplex, bungalow, terrace, semi-detached, mansion
  → "shortlet" : shortlet, short stay, Airbnb, serviced apartment, holiday home
  → "hotel"    : hotel, motel, lodge
  → "office"   : office, co-working, workspace
  → "land"     : land, plot, plots, acre, hectare, farmland
  → "shop"     : shop, store, retail, warehouse, supermarket, mall space
  → "others"   : anything that doesn't fit the above

status
  → "available" (default unless explicitly stated otherwise)
  → "sold" / "rented" / "unavailable" / "expired" — only if explicitly stated

renewPeriod
  → "yearly"  (default for rent)
  → "monthly" if "per month" / "monthly" is specified
  → "weekly"  if "per week" / "weekly" / "daily" / "nightly" is specified

negotiable
  → "negotiable" if the word "negotiable" appears or price is described as flexible
  → "non-negotiable" otherwise

duration
  → Number of weeks this listing should stay active on the platform
  → Use the tenancy/lease duration if stated, converted to weeks
  → Default: 4

features
  → Array of plain strings naming amenities, facilities, and property attributes
  → Include ALL of: bedrooms, bathrooms, toilets, parking, generator, water supply,
    electricity provider, security type, gym, pool, garden, BQ (boys quarter), etc.
  → Write each as a short clean label: "3 Bedrooms", "2 Bathrooms", "Boys Quarter",
    "24hr Electricity", "Swimming Pool", "CCTV Security", "2 Parking Spaces"
  → Do NOT include price, address, or terms in features

coordinates
  → [latitude, longitude] as decimal numbers if the location is well-known
  → [0, 0] if the exact location cannot be confidently determined

DESCRIPTION TO EXTRACT FROM:
"""
${description}
"""

Return JSON only. No prose before or after. No markdown fences. Start with { end with }.
      `.trim(),
    },
  ]);

  const raw        = extractJson(rawText);
  const normalised = normalise(raw, description);
  return normalised;
}

export default runExtractProperty;

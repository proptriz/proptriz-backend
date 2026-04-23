// src/utils/runExtractProperty.ts
//
// Cloudflare Workers AI wrapper for property data extraction.
//
// All normalisation happens HERE — the controller and the frontend client
// receive a clean, enum-correct PropertyData object and never need to
// massage LLM output themselves.
//
// Normalisation rules (mirrors the frontend PropertyFormData type):
//   currency   : "NGN" → "₦"  |  "USD" → "$"  |  "GBP" → "£"  |  "EUR" → "€"
//   listedFor  : "rental"/"rented" → "rent"  |  "sell"/"purchase" → "sale"
//   category   : "apartment"/"flat"/"duplex" → "house"  |  "plot" → "land"  |  etc.
//   status     : "sold"/"rented" → "taken"  |  "unavailable" → "reserved"
//   renewPeriod: "annual" → "yearly"  |  "daily" → "weekly" (no daily enum)
//   negotiable : "non-negotiable"/"fixed" → "non-negotiable"  else "negotiable"
//   price      : strip all non-numeric chars, return numeric string
//   features   : string[] → { name, quantity }[]  (quantity defaults to 1)
//   coordinates: [0,0] or null → omitted (frontend uses its pinned location)
//   duration   : clamp 1–52

import { env } from "./env";
import { ListForEnum } from "../models/enums/ListForEnum";
import { CurrencyEnum } from "../models/enums/CurrencyEnum";
import { CategoryEnum } from "../models/enums/CategoryEnum";
import { PropertyStatusEnum } from "../models/enums/PropertyStatusEnum";
import { RenewalEnum } from "../models/enums/RenewalEnum";

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPE
// Matches PropertyFormData on the frontend exactly so no client coercion needed.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalisedProperty {
  title:       string;
  description: string;
  address:     string;
  price:       string;                 // numeric string, e.g. "4500000"
  currency:    CurrencyEnum;
  listedFor:   ListForEnum;
  category:    CategoryEnum;
  status:      PropertyStatusEnum;
  renewPeriod: RenewalEnum;
  negotiable:  "negotiable" | "non-negotiable";
  duration:    number;                 // 1–52 weeks
  features:    string[];
  /**
   * Only present when the LLM extracted real coordinates (not [0,0]).
   * Omitted when unknown so the frontend keeps its pinned map location.
   */
  coordinates?: [number, number];
}

// ─────────────────────────────────────────────────────────────────────────────
// RAW LLM OUTPUT TYPE  (what the model actually returns — untrusted)
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

const CURRENCY_MAP: Record<string, NormalisedProperty["currency"]> = {
  NGN: CurrencyEnum.ngn, NAIRA: CurrencyEnum.ngn, "₦": CurrencyEnum.ngn,
  USD: CurrencyEnum.usd,  DOLLAR: CurrencyEnum.usd, "$": CurrencyEnum.usd,
  GBP: CurrencyEnum.kes,  POUND: CurrencyEnum.kes,  "KSh": CurrencyEnum.kes,
  EUR: CurrencyEnum.cda,  EURO: CurrencyEnum.cda,   "CDA": CurrencyEnum.cda,
};

function normCurrency(raw: string | null | undefined): NormalisedProperty["currency"] {
  if (!raw) return CurrencyEnum.ngn;
  return CURRENCY_MAP[raw.trim().toUpperCase()] ?? CurrencyEnum.ngn;
}

// ─────────────────────────────────────────────────────────────────────────────

const LISTED_FOR_MAP: Record<string, NormalisedProperty["listedFor"]> = {
  rent: ListForEnum.rent, rental: ListForEnum.rent, renting: ListForEnum.rent, rented: ListForEnum.rent,
  sale: ListForEnum.sale, sell: ListForEnum.sale,   selling: ListForEnum.sale,  sold: ListForEnum.sale,
  buy: ListForEnum.sale,  purchase: ListForEnum.sale,
};

function normListedFor(raw: string | null | undefined): NormalisedProperty["listedFor"] {
  if (!raw) return ListForEnum.rent;
  return LISTED_FOR_MAP[raw.trim().toLowerCase()] ?? ListForEnum.rent;
}

// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, NormalisedProperty["category"]> = {
  house: CategoryEnum.house,     home: CategoryEnum.house,       residential: CategoryEnum.house,
  apartment: CategoryEnum.house, flat: CategoryEnum.house,        duplex: CategoryEnum.house,
  bungalow: CategoryEnum.house,  mansion: CategoryEnum.house,     terrace: CategoryEnum.house,
  villa: CategoryEnum.house,
  hotel: CategoryEnum.hotel,     shortlet: CategoryEnum.shortlet,    guesthouse: CategoryEnum.shortlet,
  bnb: CategoryEnum.shortlet,       airbnb: CategoryEnum.shortlet,      "b&b": CategoryEnum.shortlet,
  office: CategoryEnum.office, commercial: CategoryEnum.shop, shop: CategoryEnum.shop,
  store: CategoryEnum.shop,  warehouse: CategoryEnum.shop,  factory: CategoryEnum.others,
  land: CategoryEnum.land,       plot: CategoryEnum.land,         farmland: CategoryEnum.land,
  others: CategoryEnum.others,    other: CategoryEnum.others,      miscellaneous: CategoryEnum.others,
};

function normCategory(raw: string | null | undefined): NormalisedProperty["category"] {
  if (!raw) return CategoryEnum.house;
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? CategoryEnum.house;
}

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, NormalisedProperty["status"]> = {
  available: PropertyStatusEnum.available,
  sold: PropertyStatusEnum.sold,
  rented: PropertyStatusEnum.rented,
  taken: PropertyStatusEnum.unavailable,
  occupied: PropertyStatusEnum.unavailable,
  unavailable: PropertyStatusEnum.unavailable,
  reserved: PropertyStatusEnum.unavailable,
  pending: PropertyStatusEnum.unavailable,
  expired: PropertyStatusEnum.expired,
};

function normStatus(raw: string | null | undefined): NormalisedProperty["status"] {
  if (!raw) return PropertyStatusEnum.available;
  return STATUS_MAP[raw.trim().toLowerCase()] ?? PropertyStatusEnum.available;
}

// ─────────────────────────────────────────────────────────────────────────────

const RENEWAL_MAP: Record<string, NormalisedProperty["renewPeriod"]> = {
  daily: RenewalEnum.weekely,    weekly: RenewalEnum.weekely,
  monthly: RenewalEnum.monthly,
  yearly: RenewalEnum.yearly,   annual: RenewalEnum.yearly,   annually: RenewalEnum.yearly, "per year": RenewalEnum.yearly,
};

function normRenewal(raw: string | null | undefined): NormalisedProperty["renewPeriod"] {
  if (!raw) return RenewalEnum.yearly;
  return RENEWAL_MAP[raw.trim().toLowerCase()] ?? RenewalEnum.yearly;
}

// ─────────────────────────────────────────────────────────────────────────────

function normNegotiable(raw: string | null | undefined): NormalisedProperty["negotiable"] {
  if (!raw) return "negotiable";
  const lower = raw.trim().toLowerCase();
  return lower === "non-negotiable" || lower === "fixed" || lower === "firm"
    ? "non-negotiable"
    : "negotiable";
}

// ─────────────────────────────────────────────────────────────────────────────

function normPrice(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "0";
  // Strip everything except digits and a single decimal point
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  return cleaned || "0";
}

// ─────────────────────────────────────────────────────────────────────────────

function normFeatures(
  raw: string[] | null | undefined,
): NormalisedProperty["features"] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? name : null;
      }
      return null;
    })
    .filter((f): f is string => f !== null);
}

// ─────────────────────────────────────────────────────────────────────────────

function normCoordinates(
  raw: unknown,
): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const lat = Number(raw[0]);
  const lng = Number(raw[1]);
  if (isNaN(lat) || isNaN(lng)) return undefined;
  // [0,0] is the LLM's sentinel for "unknown" — omit so frontend keeps its pin
  if (lat === 0 && lng === 0) return undefined;
  // Sanity-check WGS-84 bounds
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lat, lng];
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISE: applies all helpers to a raw LLM object
// ─────────────────────────────────────────────────────────────────────────────

function normalise(raw: RawLlmProperty, originalDescription: string): NormalisedProperty {
  const coords = normCoordinates(raw.coordinates);

  const out: NormalisedProperty = {
    title:       raw.title?.trim()                              || "",
    description: raw.description?.trim()                       || originalDescription.trim(),
    address:     raw.address?.trim()                           || "",
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

  // result.response is the LLM text output
  const response: unknown = json?.result?.response;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("Cloudflare AI returned an empty or unexpected response shape.");
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXTRACTION
// LLMs sometimes wrap their JSON in markdown fences or add prose before/after.
// We extract the first valid JSON object from the response text.
// ─────────────────────────────────────────────────────────────────────────────

function extractJson(text: string): RawLlmProperty {
  // 1. Try to strip ```json … ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate  = fenceMatch ? fenceMatch[1].trim() : text.trim();

  // 2. Find the first '{' and last '}' to isolate the JSON object
  const start = candidate.indexOf("{");
  const end   = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `LLM response does not contain a JSON object. Raw: ${text.slice(0, 300)}`
    );
  }

  const jsonStr = candidate.slice(start, end + 1);

  try {
    return JSON.parse(jsonStr) as RawLlmProperty;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM JSON: ${(err as Error).message}. Slice: ${jsonStr.slice(0, 300)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and normalise property data from a natural-language description.
 *
 * Returns a NormalisedProperty whose fields match PropertyFormData exactly —
 * no further coercion needed on the client.
 *
 * Throws on network failure, empty AI response, or JSON parse error.
 */
async function runExtractProperty(description: string): Promise<NormalisedProperty> {
  const rawText = await callCloudflareAI("@cf/meta/llama-3-8b-instruct", [
    {
      role: "system",
      content: `
You are a strict real estate data extraction engine.

Your ONLY task:
- Extract structured property data from user descriptions
- Return ONLY a single raw JSON object — no markdown fences, no explanation, no preamble
- Every field must match the exact schema and enum values provided

Rules:
- Use ONLY the allowed enum values listed in the schema
- If a field cannot be determined, use the specified default
- price: numeric digits only — strip all commas, currency symbols, and spaces
- features: array of plain strings (amenity names)
- coordinates: [latitude, longitude] as numbers, or [0, 0] if unknown
- status defaults to "available" unless explicitly stated otherwise
      `.trim(),
    },
    {
      role: "user",
      content: `
Extract property data from the description below and return a single JSON object.

SCHEMA (return exactly this structure):
{
  "title":       string,
  "description": string,
  "address":     string,
  "price":       string (digits only, e.g. "4500000"),
  "currency":    "NGN" | "USD" | "GBP" | "EUR",
  "listedFor":   "rent" | "sale",
  "category":    "house" | "shortlet" | "hotel" | "office" | "land" | "shop" | "others",
  "status":      "available" | "sold" | "rented" | "unavailable" | "expired",
  "renewPeriod": "monthly" | "yearly" | "daily" | "weekly",
  "negotiable":  "negotiable" | "non-negotiable",
  "duration":    number (weeks, default 4),
  "features":    string[],
  "coordinates": [number, number]
}

FIELD RULES:
title      → short clean listing title
description→ cleaned, readable version of input text
address    → full location string if present, else ""
price      → strip ₦ / , / spaces — return digits only
currency   → detect from ₦ → NGN, $ → USD, £ → GBP, € → EUR; default NGN
listedFor  → "rent" if renting/per year/monthly; "sale" if buying/outright
category   → house/apartment/flat/duplex → "house"; airbnb/shortlet → "shortlet";
             hotel → "hotel"; office → "office"; land/plot → "land";
             shop/store → "shop"; else "others"
renewPeriod→ "yearly" default for rent; override if monthly/weekly/daily specified
negotiable → "negotiable" if mentioned; else "non-negotiable"
duration   → number of weeks listing is active; default 4
features   → amenity strings e.g. ["garage","garden","wifi","24hr electricity"]
coordinates→ [lat, lng] if location is known; [0, 0] if unknown

DESCRIPTION:
"""
${description}
"""

Return JSON only. No prose. No fences. Start with { and end with }.
      `.trim(),
    },
  ]);

  const raw         = extractJson(rawText);
  const normalised  = normalise(raw, description);
  return normalised;
}

export default runExtractProperty;
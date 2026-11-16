export interface Segments {
  state: string; // e.g. LA
  lga: string; // e.g. 11
  district: string; // e.g. U34
  area: string; // e.g. ZR
  unit: string; // e.g. 63
}

export type Confidence = "high" | "medium" | "low";

/** Stored under Property.postcode. `code` and `segments.*` are select:false in the model. */
export interface PropertyPostcode {
  code?: string; // LA-11-U34-ZR-63 (full, private)
  public_code?: string; // LA-11-U34-••-•• (masked, public)
  segments?: Segments;
  confidence?: Confidence;
  distance_m?: number;
  verified: boolean;
  building_use?: string;
  checked_at?: Date; // unset = never checked (or NIPOST was down), so the backfill retries
}

/** Administrative names for a pin, stored under Property.place (public, any country). */
export interface PropertyPlace {
  country_name?: string;
  region?: string; // NG: state. KE: county. CD: province.
  subregion?: string; // NG: LGA. Elsewhere: sub-county / commune / city.
  area?: string; // neighbourhood / suburb
  verified: boolean; // NG: pin matches the postcode unit. Elsewhere: address text matches the pin's area.
}

export type MatchTier = "area" | "district" | "subregion" | "region" | "distance";

export interface Wrapped<T> {
  value: T;
  cached: boolean;
  stale: boolean;
}

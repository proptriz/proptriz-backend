import { Schema, model } from "mongoose";

/** Response cache for NIPOST and Nominatim calls. One document per request key. */
const cacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: ["autocomplete", "lookup1", "autofill", "nearby", "reference", "country"] },
    payload: { type: Schema.Types.Mixed },
    miss: { type: Boolean, default: false },
    hits: { type: Number, default: 0 },
    freshUntil: { type: Date, required: true }, // serve without an upstream call until then
    expiresAt: { type: Date, required: true }, // = freshUntil + stale grace; Mongo deletes after this
  },
  { timestamps: true, collection: "postcode_cache" }
);
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PostcodeCache = model("PostcodeCache", cacheSchema);

/** Daily counters per kind, to watch rate limit and credit exposure. */
const usageSchema = new Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    kind: { type: String, required: true },
    upstream: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    staleServed: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
  },
  { collection: "postcode_usage" }
);
usageSchema.index({ day: 1, kind: 1 }, { unique: true });

export const PostcodeUsage = model("PostcodeUsage", usageSchema);

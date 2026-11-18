import mongoose, { Schema, SchemaTypes, Document, Model } from "mongoose";
import { IProperty } from "../types";
import { ListForEnum } from "./enums/ListForEnum";
import { CategoryEnum } from "./enums/CategoryEnum";
import { RenewalEnum } from "./enums/RenewalEnum";
import { PropertyStatusEnum } from "./enums/PropertyStatusEnum";
import { generateUniqueSlug } from "../helpers/generateUniqueSlug";
import { CurrencyEnum } from "./enums/CurrencyEnum";

const propertySchema = new Schema<IProperty>(
  {
    banner: { type: String, default: "" },
    title: { type: String, required: true, index: true },
    slug: {
      type: String,
      lowercase: true,
      unique: true,
      index: true,
    },
    address: { type: String, required: true, default: "", index: true },
    price: { type: Number, required: true },
    currency: { type: String, enum: CurrencyEnum, required: true, default: CurrencyEnum.ngn }, 
    listed_for: {
      type: String,
      enum: ListForEnum,
      required: true,
      default: ListForEnum.rent,
    },
    category: {
      type: String,
      enum: CategoryEnum,
      required: true,
      default: CategoryEnum.house,
    },
    period: {
      type: String,
      enum: RenewalEnum,
      required: false,
      default: null,
    },
    description: {
      type: String,
      required: false,
      default: ""
    },
     duration: {
      type: Number,
      default: 1,
      min: 1,
      max: 52        
    },
    expired_by: {
      type: Date,
      required: true,
    },
    average_rating: {
      type: Number,
      required: false,
      default: 5.0,
    },
    review_count: {
      type: Number,
      required: false,
      default: 0,
    },
    negotiable: { type: Boolean, default: true, required: true },
    images: { type: [String], default: [] },
    user: { type: SchemaTypes.ObjectId, ref: "User", required: true },
    username: {type: String, required: true},
    map_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], required: true, default: [0, 0] },
    },
    // ISO 3166-1 alpha-2 of the pin (resolved server-side). Postcode features run only when "NG".
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    // NIPOST postcode (Nigeria only). The full code and its segments are select:false so no
    // existing endpoint can leak them by returning the whole document; public_code is masked.
    postcode: {
      code: { type: String, select: false },          // LA-11-U34-ZR-63
      public_code: { type: String },                  // LA-11-U34-••-••
      segments: {
        state: { type: String, select: false },
        lga: { type: String, select: false },
        district: { type: String, select: false },
        area: { type: String, select: false },
        unit: { type: String, select: false },
      },
      confidence: { type: String, enum: ["high", "medium", "low"] },
      distance_m: { type: Number },
      verified: { type: Boolean, default: false },
      building_use: { type: String },
      checked_at: { type: Date },                     // unset = never checked; the backfill retries
    },
    // Administrative names for the pin (any country). Public. NG: region = state, subregion = LGA.
    place: {
      country_name: { type: String },
      region: { type: String },
      subregion: { type: String },
      area: { type: String },
      verified: { type: Boolean, default: false },
    },
    features: { type: [String] },
    status: {
      type: String,
      enum: PropertyStatusEnum,
      required: true,
      default: PropertyStatusEnum.available,
    },
  },
  { timestamps: true }
);

// 🔹 1. User properties + cursor pagination (KEEP)
propertySchema.index(
  { user: 1, createdAt: -1, _id: -1 },
  { name: "user_cursor_idx" }
);

// 🔹 2. Main listing filters + sort
propertySchema.index(
  {
    status: 1,
    listed_for: 1,
    category: 1,
    price: 1,
    createdAt: -1,
    _id: -1
  },
  { name: "listing_filter_sort_idx" }
);

// 🔹 3. Geo search + core filters
propertySchema.index(
  {
    map_location: "2dsphere",
    status: 1,
    listed_for: 1,
    category: 1
  },
  { name: "geo_filter_idx" }
);

// 🔹 4. Text search (ONLY ONE text index)
propertySchema.index(
  {
    title: "text",
    address: "text",
    description: "text"
  },
  {
    weights: {
      title: 5,
      address: 3,
      description: 1
    },
    name: "property_text_search_idx"
  }
);

// 🔹 5. Postcode ladder: same area -> district -> LGA, newest first (cursor pagination)
propertySchema.index(
  {
    status: 1,
    country: 1,
    "postcode.segments.state": 1,
    "postcode.segments.lga": 1,
    "postcode.segments.district": 1,
    "postcode.segments.area": 1,
    createdAt: -1,
    _id: -1
  },
  { name: "postcode_ladder_idx" }
);

// 🔹 5b. Place ladder (any country): same neighbourhood -> sub-region -> region
propertySchema.index(
  { status: 1, country: 1, "place.region": 1, "place.subregion": 1, "place.area": 1, createdAt: -1, _id: -1 },
  { name: "place_ladder_idx" }
);

// 🔹 6. Exact postcode lookups
propertySchema.index({ "postcode.code": 1 }, { name: "postcode_code_idx", sparse: true });

// 🔹 7. Backfill: Nigerian listings still needing a postcode check
propertySchema.index({ country: 1, "postcode.checked_at": 1 }, { name: "postcode_backfill_idx" });

// 🌀 Pre-save hook for unique slug
propertySchema.pre<IProperty & Document>("save", async function (next) {
  if (!this.isModified("title")) return next();

  const Property = this.constructor as Model<IProperty>;
  this.slug = await generateUniqueSlug(Property, this.title, this._id);

  next();
});

const Property = mongoose.model<IProperty>("Property", propertySchema);

export default Property;

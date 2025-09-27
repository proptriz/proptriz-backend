import mongoose, { Schema, SchemaTypes, Document, Model } from "mongoose";
import { IProperty } from "../types";
import { ListForEnum } from "./enums/ListForEnum";
import { CategoryEnum } from "./enums/CategoryEnum";
import { RenewalEnum } from "./enums/RenewalEnum";
import { PropertyStatusEnum } from "./enums/PropertyStatusEnum";
import { generateUniqueSlug } from "../helpers/generateUniqueSlug";

const propertySchema = new Schema<IProperty>(
  {
    banner: { type: String, default: "" },
    title: { type: String, required: true },
    slug: {
      type: String,
      lowercase: true,
      unique: true, // ensure DB-level uniqueness
      index: true,
    },
    address: { type: String, required: true, default: "" },
    price: { type: Number, required: true },
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
      default: RenewalEnum.yearly,
    },
    negotiable: { type: Boolean, default: true, required: true },
    property_terms: { type: String },
    images: { type: [String], default: [] },
    user: { type: SchemaTypes.ObjectId, ref: "User", required: true },
    map_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], required: true, default: [0, 0] },
    },
    features: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    env_facilities: { type: [String] },
    status: {
      type: String,
      enum: PropertyStatusEnum,
      required: true,
      default: PropertyStatusEnum.available,
    },
  },
  { timestamps: true }
);

// Pre-save hook to generate unique slug
propertySchema.pre<IProperty & Document>("save", async function (next) {
  if (!this.isModified("title")) return next();

  const Property = this.constructor as Model<IProperty>;
  this.slug = await generateUniqueSlug(Property, this.title, this._id);

  next();
});

const Property = mongoose.model<IProperty>("Property", propertySchema);

export default Property;

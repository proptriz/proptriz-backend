import mongoose, { Schema, SchemaTypes, Document, Model } from "mongoose";
import { IProperty } from "../types";
import { ListForType } from "./enums/listFor";
import { Category } from "./enums/Category";
import { PaymentPeriod } from "./enums/paymentPeriod";
import { PropertyStatus } from "./enums/propertyStatus";
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
      enum: ListForType,
      required: true,
      default: ListForType.rent,
    },
    category: {
      type: String,
      enum: Category,
      required: true,
      default: Category.house,
    },
    period: {
      type: String,
      enum: PaymentPeriod,
      default: PaymentPeriod.yearly,
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
      enum: PropertyStatus,
      required: true,
      default: PropertyStatus.available,
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

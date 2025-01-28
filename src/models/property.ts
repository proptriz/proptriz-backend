import mongoose, { Schema, SchemaTypes } from "mongoose";
import slugify from "slugify";
import { IProperty } from "../types";
import { ListingType } from "./enums/listingType";
import { Category } from "./enums/Category";
import { PaymentPeriod } from "./enums/paymentPeriod";
import User from "./user";
import { PropertyStatus } from "./enums/propertyStatus";

const propertySchema = new Schema<IProperty>(
  {
    banner: {
      type: String,
      required: true,
      default: ""
    },
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
    },
    address: {
      type: String,
      required: true,
      default: ""
    },
    price: {
      type: Number,
      required: true,
    },
    listed_for: {
      type: String,
      enum: ListingType,
      required: true,
      default: ListingType.rent
    },
    category: {
      type: String,
      enum: Category,
      required: true,
      default: Category.house
    },
    period: {
      type: String,
      enum: PaymentPeriod,
      default: PaymentPeriod.yearly
    },
    negotiable: {
      type: Boolean,
      default: true,
      required: true
    },
    images: {
      type: [String],
      default: [""],
      required: false
    },
    agent: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    map_location: {
      type: {
        type: String,
        enum: ['Point'],
        required: false,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        default: [0, 0]
      },
    },
    features: {
      type: [{
        name: {
          type: String,
          required: true
        },
        quantity: {
          type: Number,
          required: true
        }
      }],
      required: false,
      null: true
    },
    env_falities: {
      type: [String],
      required: false,
      null: true
    },
    status: {
      type: String,
      enum: PropertyStatus,
      required: true,
      default: PropertyStatus.available
    },
    created_at: {
      type: Date,
      immutable: true,
      required: true,
      default: () => Date.now(),
    },
    updated_at: {
      type: Date,
      required: true,
      default: () => Date.now(),
    }
  }
);

// Pre-save hook to auto-populate the slug field
propertySchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

const Property = mongoose.model<IProperty>("Property", propertySchema);

export default Property;

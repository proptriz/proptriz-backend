import mongoose, { Schema, SchemaTypes } from "mongoose";
import slugify from "slugify";
import { IProperty } from "../types";
import { ListForType } from "./enums/listFor";
import { Category } from "./enums/Category";
import { PaymentPeriod } from "./enums/paymentPeriod";
import { PropertyStatus } from "./enums/propertyStatus";

const propertySchema = new Schema<IProperty>(
  {
    banner: {
      type: String,
      required: false,
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
      enum: ListForType,
      required: true,
      default: ListForType.rent
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
    property_terms: {
      type:String,
      required: false
    },
    images: {
      type: [String],
      default: [""],
      required: false
    },
    agent: {
      type: SchemaTypes.ObjectId,
      ref: "Agent",
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
    env_facilities: {
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
  }, { timestamps: true }
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

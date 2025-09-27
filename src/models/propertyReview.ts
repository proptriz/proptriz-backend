import mongoose, { Schema, SchemaTypes } from "mongoose";
import { IPropertyReview } from "../types";
import User from "./user";
import Property from "./property";
import { RatingScaleEnum } from "./enums/RatingScaleEnum";

const propertyReviewSchema = new Schema<IPropertyReview>(
  {
    review_giver: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    property: {
      type: SchemaTypes.ObjectId,
      ref: Property,
      required: true
    },
    images: {
      type: [String],
      default: [""],
      required: false
    },
    rating: {
      type: Number,
      enum: Object.values(RatingScaleEnum).filter(value => typeof value === 'number'),
      required: true,
    },
    comment: {
      type: String,
      required: false,
      default: ""
    },
    reply_review_id: {
      type: SchemaTypes.ObjectId,
      required: false,
      default: ""
    }
  }, { timestamps: true }
);

const PropertyReview = mongoose.model<IPropertyReview>("PropertyReview", propertyReviewSchema);

export default PropertyReview;

import mongoose, { InferSchemaType, Schema, SchemaTypes } from "mongoose";
import Property from "./property";
import { RatingScaleEnum } from "./enums/RatingScaleEnum";
import UserSettings from "./userSettings";

const propertyReviewSchema = new Schema(
  {
    sender: { type: SchemaTypes.ObjectId, ref: "User-Settings", required: true },
    property: { type: SchemaTypes.ObjectId, ref: "Property", required: true },

    image: { type: String, default: "" },

    rating: {
      type: Number,
      enum: Object.values(RatingScaleEnum).filter(v => typeof v === "number"),
      required: true
    },

    comment: { type: String, default: "" },

    reply_count: { type: Number, default: 0 } 
  },
  { timestamps: true }
);

propertyReviewSchema.index({ sender: 1, createdAt: -1, _id: -1 });
propertyReviewSchema.index({ property: 1, createdAt: -1, _id: -1 });

export type PropertyReviewType = InferSchemaType<typeof propertyReviewSchema>
const PropertyReview = mongoose.model("Property-Review", propertyReviewSchema);

export default PropertyReview;

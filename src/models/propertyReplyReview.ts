import mongoose, { InferSchemaType, Schema, SchemaTypes } from "mongoose";
import User from "./user";
import UserSettings from "./userSettings";
import PropertyReview from "./propertyReview";

const PropertyReviewReplySchema = new Schema(
  {
    review: {
      type: SchemaTypes.ObjectId,
      ref: PropertyReview,
      index: true,
      required: true
    },

    comment: {
      type: String,
      required: true
    },

    reply_from: {
      type: SchemaTypes.ObjectId,
      ref: UserSettings,
      required: true
    },

    seen_by: {
      type: [
        {
          user: { type: SchemaTypes.ObjectId, ref: UserSettings },
          seen_at: { type: Date, default: Date.now }
        }
      ],
      default: [],
      required: false
    }
  },
  { timestamps: true }
);

PropertyReviewReplySchema.index(
  { review: 1, createdAt: -1, _id: -1 }
);


export type PropertyReplyReviewType = InferSchemaType<typeof PropertyReviewReplySchema>;
const PropertyReviewReply = mongoose.model("Property-Review-Reply", PropertyReviewReplySchema);

export default PropertyReviewReply;
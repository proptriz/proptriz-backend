import mongoose, { InferSchemaType, Schema, SchemaTypes } from "mongoose";
import User from "./user";

const userInboxSchema = new Schema(
  {
    sender: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    receiver: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    message: {
      type: String,
      required: true,
      default: ""
    },
    seen: {
      type: Boolean, default: false
    },
  }, { timestamps: true }
);

export type UserInboxType = InferSchemaType<typeof userInboxSchema>
const PropertyReview = mongoose.model("User-Inbox", userInboxSchema);

export default PropertyReview;

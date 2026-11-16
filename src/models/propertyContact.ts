import mongoose, { Schema, SchemaTypes, Document, Types } from "mongoose";

export interface IPropertyContact extends Document {
  property: Types.ObjectId;
  user: Types.ObjectId;
  channel: "call" | "email" | "chat";
  createdAt: Date;
}

/** One row per (property, user, channel): written the first time a user taps Call / Email / Chat. */
const propertyContactSchema = new Schema<IPropertyContact>(
  {
    property: { type: SchemaTypes.ObjectId, ref: "Property", required: true },
    user: { type: SchemaTypes.ObjectId, ref: "User", required: true },
    channel: { type: String, enum: ["call", "email", "chat"], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

propertyContactSchema.index({ property: 1, user: 1, channel: 1 }, { unique: true, name: "contact_unique_idx" });
propertyContactSchema.index({ property: 1, createdAt: -1 }, { name: "contact_property_idx" });

const PropertyContact = mongoose.model<IPropertyContact>("PropertyContact", propertyContactSchema);

export default PropertyContact;

import mongoose, { InferSchemaType, Schema } from "mongoose";
import { UserTypeEnum } from "./enums/UserType";

const userSettingsSchema = new Schema (
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    user_type: {
      type: String,
      enum: UserTypeEnum,
      required: true,
      default: UserTypeEnum.Individual
    },
    image: {
      type: String,
      required: false,
      default: ""
    },
    brand: {
      type: String,
      null: true,
      required: false,
    },
    email: {
      type: String,
      unique:true,
      required: false,
      lowercase: true
    },
    phone: {
      type: Number,
      maxlength: 15,
      required: false,
      null: true
    },
    whatsapp: {
      type: Number,
      maxlength: 15,
      required: false,
      null: true
    },
    social_handles: {
      type: Map,
      of: String,
      required:false
    }
  }, { timestamps: true }
);

export type UserSettingsType = InferSchemaType<typeof userSettingsSchema>;
const UserSettings = mongoose.model("User-Settings", userSettingsSchema);

export default UserSettings;

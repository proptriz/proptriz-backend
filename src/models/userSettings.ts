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
      unique: false,
    },
    user_type: {
      type: String,
      enum: UserTypeEnum,
      required: false,
      default: UserTypeEnum.Individual
    },
    image: {
      type: String,
      required: false,
      default: ""
    },
    brand: {
      type: String,
      default: "",
      required: false,
    },
    email: {
      type: String,
      lowercase: true,
      required: false
    },
    phone: {
      type: String,
      maxlength: 15,
      required: false,
      default: ""
    },
    whatsapp: {
      type: String,
      maxlength: 15,
      required: false,
      default: ""
    },
    social_handles: {
      type: Map,
      of: String,
      required:false
    }
  }, { timestamps: true }
);

userSettingsSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" }
    }
  }
);


export type UserSettingsType = InferSchemaType<typeof userSettingsSchema>;
const UserSettings = mongoose.model("User-Settings", userSettingsSchema);

export default UserSettings;

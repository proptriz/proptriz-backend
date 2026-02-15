import mongoose, { InferSchemaType, Schema } from "mongoose";
import { AuthProvider } from "./enums/AuthProvider";
import User from "./user";

const authIdentitySchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: User,
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: Object.values(AuthProvider),
      required: true,
    },

    provider_user_id: {
      type: String,
      required: true,
    },

    username: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },

    email_verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/**
 * One provider identity must be unique
 * e.g. google + sub
 *      pi + pi_uid
 */
authIdentitySchema.index(
  { provider: 1, provider_user_id: 1 },
  { unique: true }
);

/**
 * Optional index to help account linking by email
 */
authIdentitySchema.index(
  { email: 1 },
  { sparse: true }
);

export type AuthIdentityType = InferSchemaType<typeof authIdentitySchema>;

const AuthIdentity = mongoose.model<AuthIdentityType>(
  "Auth-Identity",
  authIdentitySchema
);

export default AuthIdentity;

import mongoose, { InferSchemaType, Schema } from "mongoose";

const userSchema = new Schema(
  {
    primary_email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    display_name: {
      type: String,
      required: true,
      trim: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    onboarding_completed: {
      type: Boolean,
      default: false,
    },

    onboarding_version: {
      type: Number,
      default: 0,
    },

    last_login_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export type UserType = InferSchemaType<typeof userSchema>;

const User = mongoose.model<UserType>("User", userSchema);

export default User;

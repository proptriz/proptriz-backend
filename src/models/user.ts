import mongoose, { Schema, trusted } from "mongoose";

import { IUser } from "../types";

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      null: true,
    },
    email: {
      type: String,
      required: false,
      lowercase: true
    },
    phone: {
      type: Number,
      maxlength: 15,
      required: false,
      null: true
    },
    created_at: {
      type: Date,
      default: () => Date.now(),
      immutable: true,
      required: true
    },
    image: {
      type: String,
      required: false,
      default: ""
    }
  }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;

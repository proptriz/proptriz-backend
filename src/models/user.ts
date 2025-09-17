import mongoose, { Schema, trusted } from "mongoose";

import { IUser } from "../types";

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    pi_uid: {
      type: String,
      required: true,
      unique: true,
    },
    fullname: {
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
    image: {
      type: String,
      required: false,
      default: ""
    }
  }, { timestamps: true }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;

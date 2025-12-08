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
    }
  }, { timestamps: true }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;

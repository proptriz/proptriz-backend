import jwt from "jsonwebtoken";

import { IUser } from "../types";
// import User from "../models/User";
import { env } from "../utils/env";

// import console from '../config/loggingConfig';

export const generateUserToken = (user: IUser) => {
  try {
    console.info(`Generating token for user: ${user.username}`);
    const token = jwt.sign({ userId: user.username, _id: user._id, password: user.password }, env.JWT_SECRET, {
      expiresIn: "1d", // 1 day
    });
    console.info(`Successfully generated token for user: ${user.username}`);
    return token;
  } catch (error) {
    console.error(`Failed to generate user token for piUID ${ user.username }:`, error);
    throw new Error('Failed to generate user token; please try again');
  }
};

export const decodeUserToken = async (token: string) => {
  try {
    console.info(`Decoding token.`);
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    if (!decoded.userId) {
      console.warn(`Invalid token: Missing userID.`);
      throw new Error("Invalid token: Missing userID.");
    }
    console.info(`Finding user associated with token: ${decoded.userId}`);
    const associatedUser = await User.findOne({uid: decoded.userId});
    if (!associatedUser) {
      console.warn(`User not found for token: ${decoded.userId}`);
      throw new Error("User not found.");
    }
    console.info(`Successfully decoded token and found user: ${associatedUser.pi_uid}`);
    return associatedUser;
  } catch (error) {
    console.error('Failed to decode user token:', error);
    throw new Error('Failed to decode user token; please try again');
  }
};

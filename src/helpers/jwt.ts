import jwt from "jsonwebtoken";

import { IUser } from "../types";
import User from "../models/user";
import { env } from "../utils/env";

// import console from '../config/loggingConfig';

export const generateUserToken = (user: IUser) => {
  try {
    console.info(`Generating token for user: ${user.username}`);
    const token = jwt.sign({ username: user.username, _id: user._id, password: user.password }, env.JWT_SECRET, {
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
    const decoded = jwt.verify(token, env.JWT_SECRET) as { _id: string };
    if (!decoded._id) {
      console.warn(`Invalid token: Missing userID.`);
      throw new Error("Invalid token: Missing userID.");
    }
    console.info(`Finding user associated with token: ${decoded._id}`);
    const associatedUser = await User.findById(decoded._id);
    if (!associatedUser) {
      console.warn(`User not found for token: ${decoded._id}`);
      throw new Error("User not found.");
    }
    console.info(`Successfully decoded token and found user: ${associatedUser._id}`);
    return associatedUser;
  } catch (error) {
    console.error('Failed to decode user token:', error);
    throw new Error('Failed to decode user token; please try again');
  }
};


export const generateFourDigitCode = () => Math.floor(1000 + Math.random() * 9000);

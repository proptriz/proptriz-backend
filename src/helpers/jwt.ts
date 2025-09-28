import jwt from "jsonwebtoken";

import { IUser } from "../types";
import User from "../models/user";
import { env } from "../utils/env";
import logger from "../config/loggingConfig";

export const generateUserToken = (user: IUser) => {
  try {
    logger.info(`Generating token for user: ${user.username}`);
    const token = jwt.sign({ username: user.username, _id: user._id, userId: user.pi_uid }, env.JWT_SECRET, {
      expiresIn: "1d", // 1 day
    });
    logger.info(`Successfully generated token for user: ${user.username}`);
    return token;
  } catch (error) {
    logger.error(`Failed to generate user token for piUID ${ user.username }:`, error);
    throw new Error('Failed to generate user token; please try again');
  }
};

export const decodeUserToken = async (token: string) => {
  try {
    logger.info(`Decoding token.`);
    const decoded = jwt.verify(token, env.JWT_SECRET) as { _id: string };
    if (!decoded._id) {
      logger.warn(`Invalid token: Missing userID.`);
      throw new Error("Invalid token: Missing userID.");
    }
    logger.info(`Finding user associated with token: ${decoded._id}`);
    const associatedUser = await User.findById(decoded._id);
    if (!associatedUser) {
      logger.warn(`User not found for token: ${decoded._id}`);
      throw new Error("User not found.");
    }
    logger.info(`Successfully decoded token and found user: ${associatedUser._id}`);
    return associatedUser;
  } catch (error) {
    logger.error('Failed to decode user token:', error);
    throw new Error('Failed to decode user token; please try again');
  }
};

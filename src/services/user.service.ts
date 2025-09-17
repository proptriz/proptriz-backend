import User from "../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import logger from "../config/loggingConfig";
import { IUser } from "../types";
import dotenv from "dotenv";
import { generateUserToken } from "../helpers/jwt";

dotenv.config();

const findOrCreateUser = async (currentUser: IUser): Promise<IUser> => {
  logger.info(`Finding or creating user: ${currentUser.pi_uid} - ${currentUser.username}`);
  const existingUser = await User.findOne({
    pi_uid: currentUser.pi_uid,
    username: currentUser.username
  }).setOptions({ 
    readPreference: 'primary' 
  }).exec();

  if (existingUser) return existingUser;

  return User.create({
    pi_uid: currentUser.pi_uid,
    username: currentUser.username
  });
};

export const authenticate = async (
  currentUser: IUser
): Promise<IUser> => {
  try {
    const user = await findOrCreateUser(currentUser);
    return user
  } catch (error) {
    logger.error(`Failed to authenticate user: ${ error }`);
    throw error;
  }
};

export const getUser = async (pi_uid: string): Promise<IUser | null> => {
  try {
    const user = await User.findOne({ pi_uid }).exec();
    return user ? user as IUser : null;
  } catch (error) {
    logger.error(`Failed to retrieve user for piUID ${ pi_uid }: ${ error }`);
    throw error;
  }
};

export const deleteUser = async (pi_uid: string | undefined): Promise<{ user: IUser | null }> => {
  try {
    // delete the user
    const deletedUser = await User.findOneAndDelete({ pi_uid }).exec();
    return {
      user: deletedUser ? deletedUser as IUser : null
    }
  } catch (error) {
    logger.error(`Failed to delete user or user association for piUID ${ pi_uid }: ${ error }`);
    throw error;
  }
};

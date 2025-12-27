import User from "../models/user";
import logger from "../config/loggingConfig";
import { IUser } from "../types";
import dotenv from "dotenv";

dotenv.config();

const findOrCreateUser = async (currentUser: IUser): Promise<IUser> => {
  const { pi_uid, username } = currentUser;

  logger.info(`Authenticating user: pi_uid=${pi_uid}, username=${username}`);

  return User.findOneAndUpdate(
    { pi_uid }, // identity key
    {
      $setOnInsert: {
        pi_uid,
        username
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  ).exec();
};

export const authenticate = async (currentUser: IUser): Promise<IUser> => {
  try {
    return await findOrCreateUser(currentUser);
  } catch (error) {
    logger.error(
      `Authentication failed for pi_uid=${currentUser.pi_uid}: ${String(error)}`
    );
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

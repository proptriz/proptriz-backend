import mongoose from "mongoose";

import User from "../models/user";
import logger from "../config/loggingConfig";
import dotenv from "dotenv";
import UserSettings from "../models/userSettings";
import { AuthProvider } from "../models/enums/AuthProvider";
import AuthIdentity from "../models/authIdentity";

dotenv.config();

const REQUIRED_ONBOARDING_VERSION = 1;

interface AuthProfile {
  email?: string | null;
  email_verified?: boolean;
  name?: string;
  username?: string;
  picture?: string;
}

export async function resolveUser(
  provider: AuthProvider,
  providerUserId: string,
  profile: AuthProfile
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let isNewUser = false;

    // 1️⃣ Check if identity already exists
    const existingIdentity = await AuthIdentity.findOne(
      { provider, provider_user_id: providerUserId },
      null,
      { session }
    );

    let user;

    if (existingIdentity) {
      user = await User.findById(existingIdentity.user_id, null, {
        session,
      });

      if (!user) {
        throw new Error("AuthIdentity exists but User missing");
      }

      user.last_login_at = new Date();
      await user.save({ session });
    } else {
      // Normalize verified email
      const email =
        profile.email && profile.email_verified
          ? profile.email.toLowerCase()
          : null;

      // 2️⃣ Attempt account linking by verified email
      if (email) {
        user = await User.findOne(
          { primary_email: email },
          null,
          { session }
        );
      }

      // 3️⃣ Create new user if not found
      if (!user) {
        user = await User.create(
          [
            {
              primary_email: email,
              display_name:
                profile.name || profile.username || "User",
              avatar: profile.picture || null,
              onboarding_completed: false,
              onboarding_version: 0,
              last_login_at: new Date(),
            },
          ],
          { session }
        ).then(res => res[0]);

        isNewUser = true;
      }

      // 4️⃣ Create auth identity
      await AuthIdentity.create(
        [
          {
            user_id: user._id,
            provider,
            provider_user_id: providerUserId,
            username: profile.username || null,
            email,
            email_verified: Boolean(email),
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    // 🔎 Determine onboarding requirement
    const requiresOnboarding =
      isNewUser ||
      !user.onboarding_completed ||
      user.onboarding_version < REQUIRED_ONBOARDING_VERSION;

    return {
      user,
      isNewUser,
      requiresOnboarding,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}




// const findOrCreateUser = async (currentUser: IUser): Promise<IUser> => {
//   const { pi_uid, username } = currentUser;

//   return User.findOneAndUpdate(
//     { pi_uid }, // identity key
//     {
//       $setOnInsert: {
//         pi_uid,
//         username
//       }
//     },
//     {
//       new: true,
//       upsert: true,
//       runValidators: true
//     }
//   ).lean().exec();
// };

// export const authenticate = async (currentUser: IUser): Promise<IUser | null> => {
//   try {
//     const authUser = await findOrCreateUser(currentUser);

//     if (!authUser._id) {
//       return null
//     }

//     // const existingSettings = await UserSettings.exists({username: authUser.username}).exec();

//     // if (!existingSettings?._id) {
//     //   await UserSettings.create({
//     //     username: authUser.username,
//     //     user: authUser._id
//     //   })
//     // }

//     await UserSettings.findOneAndUpdate(
//       { user: authUser._id },
//       {
//         username: authUser.username,
//         user: authUser._id
//       },
//       {
//         upsert: true,
//         new: false
//       }
//     );

//     return authUser
//   } catch (error) {
//     logger.error(
//       `Authentication failed for pi_uid=${currentUser.pi_uid}: ${String(error)}`
//     );
//     throw error;
//   }
// };


// export const getUser = async (pi_uid: string): Promise<IUser | null> => {
//   try {
//     const user = await User.findOne({ pi_uid }).exec();
//     return user ? user as IUser : null;
//   } catch (error) {
//     logger.error(`Failed to retrieve user for piUID ${ pi_uid }: ${ error }`);
//     throw error;
//   }
// };

// export const deleteUser = async (pi_uid: string | undefined): Promise<{ user: IUser | null }> => {
//   try {
//     // delete the user
//     const deletedUser = await User.findOneAndDelete({ pi_uid }).exec();
//     return {
//       user: deletedUser ? deletedUser as IUser : null
//     }
//   } catch (error) {
//     logger.error(`Failed to delete user or user association for piUID ${ pi_uid }: ${ error }`);
//     throw error;
//   }
// };

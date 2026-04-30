
import mongoose from "mongoose";
import User from "../models/user";
import UserSettings, { UserSettingsType } from '../models/userSettings';
import logger from '../config/loggingConfig';
import AppError from '../utils/errors';
import { deleteFromCloudinary, uploadToCloudinary } from './misc/image.service';
import { IUser } from '../types';

export async function getUserSettings(userId: string): Promise<UserSettingsType | null> {
  try {
    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    const settings = await UserSettings.findOne({ user: userId }).lean();
    return settings as UserSettingsType | null;
  } catch (error) {
    logger.error('Error fetching user settings', { userId, error });
    throw error;
  }
}

export async function deleteUserSettings(userId: string): Promise<boolean> {
  try {
    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    const result = await UserSettings.deleteOne({ user: userId });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error deleting user settings', { userId, error });
    throw error;
  }
}

// export async function addOrUpdateUserSettings(
//   authUser: IUser,
//   settingsData: Partial<UserSettingsType>,
//   file?: Express.Multer.File
// ): Promise<UserSettingsType> {
//   try {
//     if (!settingsData || Object.keys(settingsData).length === 0) {
//       throw new AppError('No updates provided', 400);
//     }

//     if (file) {
//       // Fetch existing settings to get old image
//       const existingSettings = await UserSettings.findOne({ user: authUser._id });
      
//       // Delete old image if it exists
//       if (existingSettings?.image) {
//         await deleteFromCloudinary([existingSettings.image]);
//       }

//       // Upload new image
//       const url = await uploadToCloudinary(
//         file.buffer,
//         `propTriz/user`,
//         `${authUser.display_name}`
//       );
//       settingsData.image = url;
//     }

//     const settings = await UserSettings.findOneAndUpdate(
//       { user: authUser._id },
//       { $set: settingsData, updatedAt: new Date() },
//       { new: true, upsert: true, runValidators: true }
//     );

//     return settings;

//   } catch (error) {
//     logger.error('Error creating user settings', { authUser, error });
//     throw error;
//   }
// }

const REQUIRED_ONBOARDING_VERSION = 1;

interface UpdateUserSettingsInput {
  user_type?: string;
  brand?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  social_handles?: Record<string, string>;
}

export async function addOrUpdateUserSettings(
  userId: string,
  payload: UpdateUserSettingsInput,
  file?: Express.Multer.File
) {
  let newImageUrl: string | null = null;
  let oldImageToDelete: string | null = null;

  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // 1️⃣ Upload image first (no DB lock held)
    if (file) {
      newImageUrl = await uploadToCloudinary(
        file.buffer,
        "propTriz/user",
        `${userId}-${Date.now()}`
      );
    }

    // 2️⃣ Fetch existing settings (lean for performance)
    const existingSettings = await UserSettings
      .findOne({ user: user._id })
      .lean();

    if (file && existingSettings?.image) {
      oldImageToDelete = existingSettings.image;
    }

    // 3️⃣ Compute final values safely

    const finalImage =
      newImageUrl ||
      existingSettings?.image ||
      user.avatar ||
      "";

    const finalEmail =
      payload.email !== undefined
        ? payload.email?.toLowerCase().trim() || null
        : existingSettings?.email || user.primary_email || null;

    const finalBrand =
      payload.brand !== undefined
        ? payload.brand?.trim() || ""
        : existingSettings?.brand || user.display_name || "";

    const updateDoc: any = {
      image: finalImage,
      brand: finalBrand,
      email: finalEmail,
      updatedAt: new Date(),
    };

    if (payload.user_type !== undefined)
      updateDoc.user_type = payload.user_type;

    if (payload.phone !== undefined)
      updateDoc.phone = payload.phone;

    if (payload.whatsapp !== undefined)
      updateDoc.whatsapp = payload.whatsapp;

    if (payload.social_handles !== undefined)
      updateDoc.social_handles = payload.social_handles;

    // 4️⃣ Atomic upsert
    const settings = await UserSettings.findOneAndUpdate(
      { user: user._id },
      { $set: updateDoc },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    // 5️⃣ Sync minimal user fields (avoid heavy writes)

    const userUpdate: any = {
      onboarding_completed: true,
      onboarding_version: REQUIRED_ONBOARDING_VERSION,
    };

    if (!user.avatar && finalImage) {
      userUpdate.avatar = finalImage;
    }

    if (finalEmail && user.primary_email !== finalEmail) {
      userUpdate.primary_email = finalEmail;
    }

    await User.updateOne({ _id: user._id }, { $set: userUpdate });

    // 6️⃣ Cleanup old image AFTER success
    if (oldImageToDelete) {
      await deleteFromCloudinary([oldImageToDelete]);
    }

    return settings;

  } catch (error: any) {

    // Rollback newly uploaded image if DB failed
    logger.error('Error in addOrUpdateUserSettings', { userId, payload, error });
    if (newImageUrl) {
      await deleteFromCloudinary([newImageUrl]);
    }

    if (error?.code === 11000) {
      throw new Error("Email already in use");
    }

    throw error;
  }
}


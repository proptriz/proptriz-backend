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

export async function addOrUpdateUserSettings(
  authUser: IUser,
  settingsData: Partial<UserSettingsType>,
  file?: Express.Multer.File
): Promise<UserSettingsType> {
  try {
    if (!settingsData || Object.keys(settingsData).length === 0) {
      throw new AppError('No updates provided', 400);
    }

    if (file) {
      // Fetch existing settings to get old image
      const existingSettings = await UserSettings.findOne({ user: authUser._id });
      
      // Delete old image if it exists
      if (existingSettings?.image) {
        await deleteFromCloudinary([existingSettings.image]);
      }

      // Upload new image
      const url = await uploadToCloudinary(
        file.buffer,
        `propTriz/user`,
        `${authUser.display_name}`
      );
      settingsData.image = url;
    }

    const settings = await UserSettings.findOneAndUpdate(
      { user: authUser._id },
      { $set: settingsData, updatedAt: new Date() },
      { new: true, upsert: true, runValidators: true }
    );

    return settings;

  } catch (error) {
    logger.error('Error creating user settings', { authUser, error });
    throw error;
  }
}
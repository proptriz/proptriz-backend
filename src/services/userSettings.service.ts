import UserSettings, { UserSettingsType } from '../models/userSettings';
import logger from '../config/loggingConfig';
import AppError from '../utils/errors';
import User from '../models/user';
import { uploadToCloudinary } from './misc/image.service';
import { IUser } from '../types';

export class UserSettingsService {
  async getUserSettings(userId: string): Promise<UserSettingsType | null> {
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

  async updateUserSettings(
    userId: string,
    updates: Partial<UserSettingsType>
  ): Promise<UserSettingsType> {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400);
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new AppError('No updates provided', 400);
      }

      const settings = await UserSettings.findOneAndUpdate(
        { user: userId },
        { $set: updates, updatedAt: new Date() },
        { new: true, upsert: true, runValidators: true }
      );

      return settings;
    } catch (error) {
      logger.error('Error updating user settings', { userId, error });
      throw error;
    }
  }

  async deleteUserSettings(userId: string): Promise<boolean> {
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

  async addOrUpdateUserSettings(
    authUser: IUser,
    settingsData: Partial<UserSettingsType>,
    file?: Express.Multer.File
  ): Promise<UserSettingsType> {
    try {

      if (!settingsData || Object.keys(settingsData).length === 0) {
        throw new AppError('No updates provided', 400);
      }

      if (file) {
        const url = await uploadToCloudinary(
          file.buffer,
          `propTriz/user`,
          `${authUser.username}`
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
}

export default new UserSettingsService();
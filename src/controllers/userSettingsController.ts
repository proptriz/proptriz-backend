import { Request, Response } from 'express';
import * as userSettingsService from '../services/userSettings.service';
import logger from '../config/loggingConfig';
import { IUser } from '../types';

export class UserSettingsController {

  getSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.currentUser?._id.toString() as string;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const settings = await userSettingsService.getUserSettings(userId);
      res.status(200).json(settings);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  addOrUpdateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = req.currentUser as IUser;

      const file = req.file as Express.Multer.File | undefined;
      const formData = req.body;
      logger.info('Received addOrUpdateSettings request', { userId: currentUser._id, formData });

      const settings = await userSettingsService.addOrUpdateUserSettings(
        currentUser._id.toString(),
        formData,
        file
      );

      res.status(200).json(settings);      
    } catch (error) {
      logger.error('addOrUpdateSettings error:', { error });
      this.handleError(error, res);
    }
  };

  private handleError(error: unknown, res: Response): void {
    logger.error('UserSettingsController error:', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}


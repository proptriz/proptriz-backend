import { Request, Response } from 'express';
import { UserSettingsService } from '../services/userSettings.service';
import logger from '../config/loggingConfig';
import { IUser } from '../types';

export class UserSettingsController {
  private userSettingsService: UserSettingsService;

  constructor() {
    this.userSettingsService = new UserSettingsService();
  }

  getSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.currentUser?._id as string;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const settings = await this.userSettingsService.getUserSettings(userId);
      res.status(200).json(settings);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  addOrUpdateSettings = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.currentUser as IUser;

      const file = req.file as Express.Multer.File | undefined;

      const settings = await this.userSettingsService.addOrUpdateUserSettings(
        userId,
        req.body,
        file
      );

      res.status(200).json(settings);
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private handleError(error: unknown, res: Response): void {
    logger.error('UserSettingsController error:', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}


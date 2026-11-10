import { verifyToken } from "../middlewares/verifyToken";
import { Request, Response } from 'express';
import { getNotificationSettings, NotificationSettingsValidationError, updateNotificationSettings } from "../services/notificationSettings.service";
import logger from "../config/loggingConfig";
import { notifyCustom } from "../services/notification.service";

export const getUsersSettings = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const settings = await getNotificationSettings(userId);
    return res.json({ settings });
  } catch (err) {
    logger.error('[NotificationSettings] GET failed:', err);
    return res.status(500).json({ message: 'Failed to load notification settings' });
  }
}

export const updateSettings =  async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { emailEnabled, email, whatsappEnabled, whatsappNumber, pushEnabled } = req.body;

  // Basic type guarding — reject obviously malformed payloads before hitting the service
  if (
    (emailEnabled !== undefined && typeof emailEnabled !== 'boolean') ||
    (whatsappEnabled !== undefined && typeof whatsappEnabled !== 'boolean') ||
    (pushEnabled !== undefined && typeof pushEnabled !== 'boolean') ||
    (email !== undefined && typeof email !== 'string') ||
    (whatsappNumber !== undefined && typeof whatsappNumber !== 'string')
  ) {
    return res.status(400).json({ message: 'Invalid field types in request body' });
  }

  try {
    const settings = await updateNotificationSettings(userId, {
      emailEnabled,
      email,
      whatsappEnabled,
      whatsappNumber,
      pushEnabled,
    });
    return res.json({ settings, message: 'Notification preferences saved' });
  } catch (err) {
    if (err instanceof NotificationSettingsValidationError) {
      return res.status(422).json({ message: err.message });
    }
    logger.error('[NotificationSettings] PATCH failed:', err);
    return res.status(500).json({ message: 'Failed to save notification settings' });
  }
}

export const customNotification = async (req: Request, res: Response) => {
  const user = req.currentUser;
  const { subject, title, body, ctaText, ctaUrl } = req.body;
  logger.info('was here ..............', {user});
  if (!user || !subject || !title || !body) {
    return res.status(400).json({ error: 'unauthorized' });
  }
  try {
    await notifyCustom({ userId: user._id.toString(), username: user.display_name, subject, title, body, ctaText, ctaUrl });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Notification failed' });
  }
}
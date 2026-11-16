import { Request, Response } from 'express';
import { getNotificationSettings, NotificationSettingsValidationError, updateNotificationSettings } from "../services/notificationSettings.service";
import logger from "../config/loggingConfig";
import { getTokensForUser, pruneStaleTokens, removeTokenForUser, upsertToken } from "../models/deviceToken";
import { PushPayload, sendToTokens, sendToTopic } from "../services/pushNotification.service";
import { alertSettingsUrl } from "../services/notificationCopy";

const PLATFORMS = ['web', 'android', 'ios'] as const;
type Platform = typeof PLATFORMS[number];

const MAX_FCM_TOKEN_LENGTH = 4096;
const TOPIC_RE = /^[a-zA-Z0-9-_.~%]{1,200}$/;

function isValidFcmToken(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_FCM_TOKEN_LENGTH;
}

/** Validates an admin-supplied push payload; returns null when it is malformed. */
function parsePushPayload(body: any): PushPayload | null {
  if (!body || typeof body.title !== 'string' || typeof body.body !== 'string') return null;
  if (!body.title.trim() || !body.body.trim()) return null;

  const payload: PushPayload = { title: body.title, body: body.body };

  if (body.imageUrl !== undefined) {
    if (typeof body.imageUrl !== 'string') return null;
    payload.imageUrl = body.imageUrl;
  }

  if (body.data !== undefined) {
    if (typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) return null;
    // FCM only accepts string values in the data map
    payload.data = Object.fromEntries(
      Object.entries(body.data).map(([key, value]) => [key, String(value)])
    );
  }

  return payload;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

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

// ─── Device tokens (signed-in user) ───────────────────────────────────────────

export const registerDeviceToken = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { fcmToken, platform } = req.body ?? {};

  if (!isValidFcmToken(fcmToken)) {
    return res.status(400).json({ message: 'fcmToken is required' });
  }
  if (platform !== undefined && !PLATFORMS.includes(platform)) {
    return res.status(400).json({ message: 'platform must be one of web, android, ios' });
  }

  try {
    const isNew = await upsertToken(userId, fcmToken, (platform as Platform | undefined) ?? 'web');
    return res.json({ success: true, isNew });
  } catch (err) {
    logger.error('[Notifications] Token register failed:', err);
    return res.status(500).json({ message: 'Failed to save token' });
  }
}

export const removeDeviceToken = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { fcmToken } = req.body ?? {};
  if (!isValidFcmToken(fcmToken)) {
    return res.status(400).json({ message: 'fcmToken is required' });
  }

  try {
    // Scoped to the signed-in user: nobody can remove another person's device.
    await removeTokenForUser(userId, fcmToken);
    return res.json({ success: true });
  } catch (err) {
    logger.error('[Notifications] Token remove failed:', err);
    return res.status(500).json({ message: 'Failed to remove token' });
  }
}

/**
 * Sends a fixed test push to the signed-in user's own devices.
 * The wording is set here, never by the caller, so this cannot be used to
 * push or email arbitrary content.
 */
export const sendTestNotification = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const tokens = await getTokensForUser(userId);
    if (!tokens.length) {
      return res.json({ sent: 0, message: 'No registered devices' });
    }

    const result = await sendToTokens(tokens, {
      title: 'Proptriz',
      body: 'Test notification: alerts are working on this device.',
      data: { type: 'test', url: alertSettingsUrl() },
    });
    if (result.failedTokens.length) await pruneStaleTokens(result.failedTokens);

    return res.json({ sent: result.successCount, failed: result.failureCount });
  } catch (err) {
    logger.error('[Notifications] Test push failed:', err);
    return res.status(500).json({ message: 'Notification failed' });
  }
}

// ─── Admin sends ──────────────────────────────────────────────────────────────

export const adminNotifyUser = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const payload = parsePushPayload(req.body);
  if (!payload) return res.status(400).json({ message: 'title and body are required' });

  try {
    const tokens = await getTokensForUser(userId);
    if (!tokens.length) return res.json({ sent: 0, message: 'No registered devices' });

    const result = await sendToTokens(tokens, payload);
    if (result.failedTokens.length) await pruneStaleTokens(result.failedTokens);

    return res.json({ sent: result.successCount, failed: result.failureCount });
  } catch (err) {
    logger.error('[Notifications] Admin user push failed:', err);
    return res.status(500).json({ message: 'Notification failed' });
  }
}

export const adminNotifyTopic = async (req: Request, res: Response) => {
  const { topic } = req.params;
  if (!TOPIC_RE.test(topic)) return res.status(400).json({ message: 'Invalid topic name' });

  const payload = parsePushPayload(req.body);
  if (!payload) return res.status(400).json({ message: 'title and body are required' });

  try {
    const messageId = await sendToTopic(topic, payload);
    return res.json({ success: true, messageId });
  } catch (err) {
    logger.error('[Notifications] Topic broadcast failed:', err);
    return res.status(500).json({ message: 'Broadcast failed' });
  }
}

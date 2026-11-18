import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { getNotificationSettings, NotificationSettingsValidationError, updateNotificationSettings } from "../services/notificationSettings.service";
import logger from "../config/loggingConfig";
import { DevicePlatform, getTokensForUser, pruneStaleTokens, removeTokenForUser, upsertToken } from "../models/deviceToken";
import { PushPayload, sendToTokens, sendToTopic } from "../services/pushNotification.service";
import { notifyTest } from "../services/notification.service";
import * as store from "../services/alertStore";
import { appUrl } from "../services/notificationCopy";

const PLATFORMS: DevicePlatform[] = ['web', 'android', 'ios'];

const MAX_FCM_TOKEN_LENGTH = 4096;
const TOPIC_RE = /^[a-zA-Z0-9-_.~%]{1,200}$/;
const APP_VERSION_RE = /^[\w.+-]{1,40}$/;
const LANGUAGE_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;

const INBOX_PAGE_DEFAULT = 20;
const INBOX_PAGE_MAX = 50;
const TEST_ALERTS_PER_HOUR = 3;

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

function toInboxItem(n: store.StoredNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    imageUrl: n.imageUrl ?? null,
    propertyId: n.propertyId ?? null,
    read: !!n.readAt,
    createdAt: n.createdAt,
  };
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

  const {
    emailEnabled, email, whatsappEnabled, whatsappNumber, pushEnabled,
    timezone, language, quietHours, digestHour, types,
  } = req.body ?? {};

  // Basic type guarding — reject obviously malformed payloads before hitting the service
  if (
    (emailEnabled !== undefined && typeof emailEnabled !== 'boolean') ||
    (whatsappEnabled !== undefined && typeof whatsappEnabled !== 'boolean') ||
    (pushEnabled !== undefined && typeof pushEnabled !== 'boolean') ||
    (email !== undefined && typeof email !== 'string') ||
    (whatsappNumber !== undefined && typeof whatsappNumber !== 'string') ||
    (timezone !== undefined && typeof timezone !== 'string') ||
    (language !== undefined && typeof language !== 'string') ||
    (digestHour !== undefined && typeof digestHour !== 'number') ||
    (quietHours !== undefined && (typeof quietHours !== 'object' || quietHours === null || Array.isArray(quietHours))) ||
    (types !== undefined && (typeof types !== 'object' || types === null || Array.isArray(types)))
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
      timezone,
      language,
      quietHours,
      digestHour,
      types,
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

// ─── Inbox ────────────────────────────────────────────────────────────────────

export const listNotifications = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, INBOX_PAGE_MAX) : INBOX_PAGE_DEFAULT;

  const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : undefined;
  if (cursor && !Types.ObjectId.isValid(cursor)) {
    return res.status(400).json({ message: 'Invalid cursor' });
  }

  try {
    const [page, unreadCount] = await Promise.all([
      store.listInbox(userId, { limit, cursor }),
      store.countUnread(userId),
    ]);
    return res.json({ items: page.items.map(toInboxItem), nextCursor: page.nextCursor, unreadCount });
  } catch (err) {
    logger.error('[Notifications] Inbox failed:', err);
    return res.status(500).json({ message: 'Failed to load notifications' });
  }
}

export const getUnreadCount = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    return res.json({ unreadCount: await store.countUnread(userId) });
  } catch (err) {
    logger.error('[Notifications] Unread count failed:', err);
    return res.status(500).json({ message: 'Failed to load unread count' });
  }
}

/** Body: { ids: string[] } to mark some as read, or { all: true } for everything. */
export const markNotificationsRead = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { ids, all } = req.body ?? {};
  let targetIds: string[] | undefined;

  if (all === true) {
    targetIds = undefined;
  } else if (Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every((i) => typeof i === 'string' && Types.ObjectId.isValid(i))) {
    targetIds = ids;
  } else {
    return res.status(400).json({ message: 'Send { ids: [...] } (up to 100) or { all: true }' });
  }

  try {
    const updated = await store.markRead(userId, targetIds, new Date());
    return res.json({ updated, unreadCount: await store.countUnread(userId) });
  } catch (err) {
    logger.error('[Notifications] Mark read failed:', err);
    return res.status(500).json({ message: 'Failed to update notifications' });
  }
}

/** The person tapped one of their own alerts in the inbox: record the open, return where it leads. */
export const openNotification = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const opened = await store.recordOpen(req.params.id, 'inbox', new Date(), userId);
    if (!opened) return res.status(404).json({ message: 'Notification not found' });
    return res.json({ url: opened.url });
  } catch (err) {
    logger.error('[Notifications] Open failed:', err);
    return res.status(500).json({ message: 'Failed to open notification' });
  }
}

/**
 * Tracked link (GET /n/:id?c=push|email). No sign-in: it is followed from a
 * push or an email. Records the open, then forwards to the alert's own link,
 * which was stored by the server, so it cannot be used to redirect elsewhere.
 * With ?format=json it returns the link instead (used by the web app's /n/:id route).
 */
export const followTrackedLink = async (req: Request, res: Response) => {
  const wantsJson = req.query.format === 'json';
  const channel = req.query.c === 'email' ? 'email' : 'push';

  try {
    const opened = await store.recordOpen(req.params.id, channel, new Date());
    const url = opened?.url ?? appUrl('/');
    if (wantsJson) return res.status(opened ? 200 : 404).json({ url });
    return res.redirect(302, url);
  } catch (err) {
    logger.error('[Notifications] Tracked link failed:', err);
    if (wantsJson) return res.status(500).json({ url: appUrl('/') });
    return res.redirect(302, appUrl('/'));
  }
}

// ─── Device tokens (signed-in user) ───────────────────────────────────────────

/** Body: { fcmToken, platform?: "web"|"android"|"ios", appVersion?, language? } */
export const registerDeviceToken = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { fcmToken, platform, appVersion, language } = req.body ?? {};

  if (!isValidFcmToken(fcmToken)) {
    return res.status(400).json({ message: 'fcmToken is required' });
  }
  if (platform !== undefined && !PLATFORMS.includes(platform)) {
    return res.status(400).json({ message: 'platform must be one of web, android, ios' });
  }
  if (appVersion !== undefined && (typeof appVersion !== 'string' || !APP_VERSION_RE.test(appVersion))) {
    return res.status(400).json({ message: 'Invalid appVersion' });
  }
  if (language !== undefined && (typeof language !== 'string' || !LANGUAGE_RE.test(language))) {
    return res.status(400).json({ message: 'Invalid language' });
  }

  try {
    const isNew = await upsertToken(userId, fcmToken, { platform, appVersion, language });
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
 * Sends a test alert to the signed-in user through the same path real alerts
 * take: inbox, push to their devices, and email if they switched it on.
 * The wording is fixed, and it is limited to a few an hour, so it cannot be
 * used to send arbitrary content or to flood an inbox.
 */
export const sendTestNotification = async (req: Request, res: Response) => {
  const userId = req.currentUser?._id.toString();
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const now = new Date();
    const recent = await store.countByTypeSince(userId, 'system', new Date(now.getTime() - 60 * 60 * 1000));
    if (recent >= TEST_ALERTS_PER_HOUR) {
      return res.status(429).json({ message: 'Too many test alerts. Try again in an hour.' });
    }

    const outcome = await notifyTest(userId, now);
    return res.json({ inbox: outcome.status === 'created', push: outcome.push ?? 'off', email: outcome.email ?? 'none' });
  } catch (err) {
    logger.error('[Notifications] Test alert failed:', err);
    return res.status(500).json({ message: 'Notification failed' });
  }
}

// ─── Admin sends ──────────────────────────────────────────────────────────────

export const adminNotifyUser = async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid user id' });

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

// src/services/alertRouter.service.ts
// The one path every alert takes: write it to the person's inbox, then decide
// per person how else to reach them (push now, push after quiet hours, email
// digest) from their settings and their devices.

import logger from '../config/loggingConfig';
import { AlertType, EmailStatus, PushStatus } from '../models/notification';
import { getTokensForUser, pruneStaleTokens } from '../models/deviceToken';
import { sendToTokens } from './pushNotification.service';
import { emailDigest, emailSingleAlert } from './email.service';
import { AlertLocale, isAppUrl, trackedUrl } from './notificationCopy';
import { NotificationPreferencesDTO } from './notificationSettings.service';
import * as store from './alertStore';
import { inQuietHours, localDayStart, localHour, quietHoursEnd } from '../utils/alertTime';

/** Instant pushes per person per day; alerts beyond this wait for the digest. */
export const DAILY_INSTANT_CAP = 10;
/** Alerts shown in one digest email; the rest are counted and stay in the inbox. */
export const DIGEST_MAX_ITEMS = 10;

export type EmailMode = 'digest' | 'now' | 'none';

export interface AlertRequest {
  userId: string;
  type: AlertType;
  /** Wording in the person's language (their settings decide which). */
  content: (locale: AlertLocale) => { title: string; body: string };
  /** Where the alert leads. Must be a link on the public site. */
  url: string;
  propertyId?: string;
  savedSearchId?: string;
  imageUrl?: string;
  /** One alert per person per key. Defaults to `${type}:${propertyId}`. */
  dedupeKey?: string;
  /** 'digest' (default): daily digest as a fallback. 'now': its own email straight away. */
  email?: EmailMode;
  /** Custom template for email 'now'; the generic alert email is used otherwise. */
  emailNow?: (ctx: { to: string; locale: AlertLocale; url: string }) => Promise<void>;
  /** For messages the person just asked for (e.g. a test): skip quiet hours and the daily cap. */
  immediate?: boolean;
}

export interface AlertOutcome {
  status: 'created' | 'duplicate' | 'disabled';
  notificationId?: string;
  push?: PushStatus;
  email?: EmailStatus;
}

// ─── Decisions (pure, so the rules are easy to test) ──────────────────────────

export function decidePush(input: {
  settings: Pick<NotificationPreferencesDTO, 'pushEnabled' | 'timezone' | 'quietHours'>;
  liveDevices: number;
  sentToday: number;
  now: Date;
  immediate?: boolean;
}): { action: 'send' } | { action: 'hold'; holdUntil: Date } | { action: 'skip'; status: 'off' | 'no_device' | 'capped' } {
  const { settings, now } = input;
  if (!settings.pushEnabled) return { action: 'skip', status: 'off' };
  if (input.liveDevices === 0) return { action: 'skip', status: 'no_device' };
  if (input.immediate) return { action: 'send' };
  if (input.sentToday >= DAILY_INSTANT_CAP) return { action: 'skip', status: 'capped' };

  const quiet = settings.quietHours;
  if (quiet.enabled && inQuietHours(now, settings.timezone, quiet.start, quiet.end)) {
    return { action: 'hold', holdUntil: quietHoursEnd(now, settings.timezone, quiet.end) };
  }
  return { action: 'send' };
}

/**
 * Email is the fallback: straight into the next digest when no push went out,
 * and into a later digest only if a pushed alert is still unopened after 24 hours.
 */
export function decideDigestStatus(hasEmail: boolean, push: PushStatus): EmailStatus {
  if (!hasEmail) return 'none';
  return push === 'sent' || push === 'held' ? 'after_24h' : 'pending';
}

// ─── Route one alert ──────────────────────────────────────────────────────────

export async function routeAlert(request: AlertRequest, now: Date = new Date()): Promise<AlertOutcome> {
  if (!isAppUrl(request.url)) {
    throw new Error('Alert links must point to the public site');
  }
  const dedupeKey = request.dedupeKey ?? (request.propertyId ? `${request.type}:${request.propertyId}` : undefined);
  if (!dedupeKey) throw new Error('An alert needs a propertyId or a dedupeKey');

  const settings = await store.loadSettings(request.userId);
  if (request.type !== 'system' && settings.types[request.type] === false) {
    return { status: 'disabled' };
  }

  const locale = settings.language;
  const { title, body } = request.content(locale);

  // 1. Inbox: always, and first. It works everywhere, including the Pi Browser.
  const notification = await store.insertNotification({
    userId: request.userId,
    type: request.type,
    title,
    body,
    url: request.url,
    imageUrl: request.imageUrl,
    propertyId: request.propertyId,
    savedSearchId: request.savedSearchId,
    dedupeKey,
  });
  if (!notification) return { status: 'duplicate' };

  // 2. Push
  const push = await deliverPush(notification, settings, now, request.immediate);

  // 3. Email
  const hasEmail = settings.emailEnabled && !!settings.email;
  const mode = request.email ?? 'digest';
  let email: EmailStatus = 'none';

  if (mode === 'digest') {
    email = decideDigestStatus(hasEmail, push);
    if (email !== 'none') await store.setEmailResult([notification.id], email);
  } else if (mode === 'now' && hasEmail) {
    const url = trackedUrl(notification.id, 'email');
    try {
      if (request.emailNow) await request.emailNow({ to: settings.email!, locale, url });
      else await emailSingleAlert({ to: settings.email!, title, body, url, locale });
      email = 'sent';
      await store.setEmailResult([notification.id], 'sent', { at: new Date() });
    } catch (err: any) {
      logger.error('[Alerts] Email failed:', err);
      email = 'failed';
      await store.setEmailResult([notification.id], 'failed', { error: String(err?.message ?? err) });
    }
  }

  return { status: 'created', notificationId: notification.id, push, email };
}

/** Decide and, if allowed, send the push for one stored alert. Never throws. */
async function deliverPush(
  notification: store.StoredNotification,
  settings: NotificationPreferencesDTO,
  now: Date,
  immediate?: boolean,
): Promise<PushStatus> {
  try {
    const tokens = settings.pushEnabled ? await getTokensForUser(notification.userId, now) : [];
    const sentToday = tokens.length && !immediate
      ? await store.countPushesSince(notification.userId, localDayStart(now, settings.timezone))
      : 0;

    const decision = decidePush({ settings, liveDevices: tokens.length, sentToday, now, immediate });

    if (decision.action === 'skip') {
      await store.setPushResult(notification.id, decision.status);
      return decision.status;
    }
    if (decision.action === 'hold') {
      await store.setPushResult(notification.id, 'held', { holdUntil: decision.holdUntil });
      return 'held';
    }

    return await sendPush(notification, tokens);
  } catch (err: any) {
    logger.error('[Alerts] Push failed:', err);
    await store.setPushResult(notification.id, 'failed', { error: String(err?.message ?? err) }).catch(() => undefined);
    return 'failed';
  }
}

async function sendPush(notification: store.StoredNotification, tokens: string[]): Promise<PushStatus> {
  const result = await sendToTokens(tokens, {
    title: notification.title,
    body: notification.body,
    imageUrl: notification.imageUrl,
    // Both a visible notification and data fields, so Android and iOS can show
    // the alert with the app closed and still route the tap.
    data: {
      type: notification.type,
      notificationId: notification.id,
      url: trackedUrl(notification.id, 'push'),
      ...(notification.propertyId ? { listingId: notification.propertyId } : {}),
    },
  });
  if (result.failedTokens.length) await pruneStaleTokens(result.failedTokens);

  const status: PushStatus = result.successCount > 0 ? 'sent' : 'failed';
  await store.setPushResult(notification.id, status, {
    at: new Date(),
    error: status === 'failed' ? 'No device accepted the message' : undefined,
  });
  return status;
}

// ─── Scheduled work ───────────────────────────────────────────────────────────

/** Sends pushes that were held for quiet hours. Does a bounded amount of work per run. */
export async function sendHeldPushes(now: Date = new Date(), limit = 200) {
  const due = await store.findHeldPushesDue(now, limit);
  const counts = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  if (!due.length) return counts;

  const settingsByUser = await store.loadSettingsForUsers([...new Set(due.map((n) => n.userId))]);

  for (const notification of due) {
    try {
      // Already seen in the inbox: a push now would only be noise.
      if (notification.openedAt || notification.readAt) {
        await store.setPushResult(notification.id, 'skipped');
        counts.skipped++;
        continue;
      }

      const settings = settingsByUser.get(notification.userId);
      const tokens = settings?.pushEnabled ? await getTokensForUser(notification.userId, now) : [];
      const sentToday = settings && tokens.length
        ? await store.countPushesSince(notification.userId, localDayStart(now, settings.timezone))
        : 0;

      let status: PushStatus;
      if (!settings || !settings.pushEnabled) status = 'off';
      else if (!tokens.length) status = 'no_device';
      else if (sentToday >= DAILY_INSTANT_CAP) status = 'capped';
      else status = await sendPush(notification, tokens);

      if (status !== 'sent' && status !== 'failed') {
        await store.setPushResult(notification.id, status);
        // No push after all, so do not wait 24 hours before the digest.
        if (notification.emailStatus === 'after_24h') await store.setEmailResult([notification.id], 'pending');
      }
      if (status === 'sent') counts.sent++;
      else if (status === 'failed') counts.failed++;
      else counts.skipped++;
    } catch (err: any) {
      logger.error(`[Alerts] Held push ${notification.id} failed:`, err);
      await store.setPushResult(notification.id, 'failed', { error: String(err?.message ?? err) }).catch(() => undefined);
      counts.failed++;
    }
  }
  return counts;
}

/**
 * Emails the daily digest to everyone whose digest hour it is right now in
 * their own time zone. Run hourly. At most one digest per person per run.
 */
export async function sendDailyDigests(now: Date = new Date(), maxEmails = 100) {
  const counts = { waiting: 0, sent: 0, notDue: 0, noEmail: 0, failed: 0 };

  const userIds = await store.findUsersWithDigestItems(now);
  counts.waiting = userIds.length;
  if (!userIds.length) return counts;

  const settingsByUser = await store.loadSettingsForUsers(userIds);

  for (const userId of userIds) {
    if (counts.sent + counts.failed >= maxEmails) break; // the next run continues

    const settings = settingsByUser.get(userId);

    if (!settings || !settings.emailEnabled || !settings.email) {
      // Email was switched off after these were queued: stop carrying them.
      const items = await store.findDigestItems(userId, now, 500);
      await store.setEmailResult(items.map((i) => i.id), 'none');
      counts.noEmail++;
      continue;
    }

    if (localHour(now, settings.timezone) !== settings.digestHour) {
      counts.notDue++;
      continue;
    }

    const items = await store.findDigestItems(userId, now, 50);
    if (!items.length) continue;

    try {
      await emailDigest({
        to: settings.email,
        locale: settings.language,
        totalCount: items.length,
        items: items.slice(0, DIGEST_MAX_ITEMS).map((item) => ({
          title: item.title,
          body: item.body,
          url: trackedUrl(item.id, 'email'),
        })),
      });
      await store.setEmailResult(items.map((i) => i.id), 'sent', { at: new Date() });
      counts.sent++;
    } catch (err) {
      // Left as they are, so the next run in this hour (or tomorrow) retries.
      logger.error(`[Alerts] Digest for user ${userId} failed:`, err);
      counts.failed++;
    }
  }
  return counts;
}

// src/services/notification.service.ts
// Unified notification dispatcher — one function per order lifecycle flow.
// Each fans out to email + WhatsApp in parallel, respecting per-user
// NotificationSettings. Designed to be called fire-and-forget from
// controllers, strictly AFTER the related DB transaction commits.

import {
  whatsappNewOrder,
  whatsappPaymentMarkedPaid,
  whatsappPiReleased,
  whatsappOrderCancelled,
  whatsappOrderDisputed,
  whatsappWelcome,
} from './whatsapp.service';
import {
  emailNewOrder,
  emailPaymentMarkedPaid,
  emailPiReleased,
  emailOrderCancelled,
  emailOrderDisputed,
  emailWelcome,
  emailAlert,
} from './email.service';
import { getNotificationSettings } from './notificationSettings.service';
import logger from '../config/loggingConfig';
import { getTokensForUser } from '../models/deviceToken';
import { pushToTokens } from './pushNotification.service';

// ─── Resolved contact shape ───────────────────────────────────────────────────

interface UserContact {
  username:      string;
  email?:        string;
  phone?:        string;
  fcmTokens?: string[];
  whatsappOptIn: boolean;
}

// ─── Resolve a user's contact info from their saved NotificationSettings ────

export async function resolveNotificationContact(
  userId: string,
  username: string
): Promise<UserContact | null> {
  try {
    let fcmTokens: string[] | undefined = [];
    const settings = await getNotificationSettings(userId);
    if (!settings) {
      logger.warn(`[Notify] No notification settings found for user ${userId} — skipping`);
      return null;
    }

    if (settings.emailEnabled){
      fcmTokens = await getTokensForUser(userId);
    }

    return {
      username,
      email:         settings.emailEnabled    ? settings.email ?? undefined         : undefined,
      phone:         settings.whatsappEnabled ? settings.whatsappNumber ?? undefined : undefined,
      whatsappOptIn: settings.whatsappEnabled,
      fcmTokens: fcmTokens.length > 0 ? fcmTokens : undefined
    };
  } catch (err) {
    logger.error(`[Notify] Failed to resolve contact for user ${userId}:`, err);
    return null;
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function dispatch(
  user: UserContact | null,
  emailFn:    (() => Promise<void>) | null,
  whatsappFn: (() => Promise<void>) | null,
  pushNotifiFn: (() => Promise<void>) | null,
): Promise<void> {
  if (!user) return;

  const tasks: Promise<void>[] = [];

  if (emailFn && user.email) {
    tasks.push(
      emailFn().catch((err) => { logger.error('[Notify] Email failed:', err); })
    );
  }

  if (whatsappFn && user.phone && user.whatsappOptIn) {
    tasks.push(
      whatsappFn().catch((err) => { logger.error('[Notify] WhatsApp failed:', err); })
    );
  }

  if (pushNotifiFn && user.fcmTokens && user.fcmTokens.length>0) {
    tasks.push(
      pushNotifiFn().catch((err) => { logger.error('[Notify] Push failed:', err); })
    );
  }

  if (!tasks.length) {
    logger.info(`[Notify] No enabled channels with contact info for ${user.username} — skipped`);
    return;
  }

  await Promise.allSettled(tasks);
}

// ═══════════════════════════════════════════════════════════════════════════
// Order lifecycle events — one dedicated function per flow
// ═══════════════════════════════════════════════════════════════════════════

/** New order placed — notify the counterparty (ad owner) */
// export async function notifyNewOrder(
//   userId: string,
//   username: string,
//   opts: { orderId: string; piAmount: string; counterpartyName: string },
// ): Promise<void> {
//   const user = await resolveNotificationContact(userId, username);
//   await dispatch(
//     user,
//     user?.email ? () => emailNewOrder({
//       to: user.email!, username: user.username,
//       orderId: opts.orderId, piAmount: opts.piAmount, counterpartyName: opts.counterpartyName,
//     }) : null,
//     user?.phone ? () => whatsappNewOrder({
//       phone: user.phone!, orderId: opts.orderId,
//       counterpartyName: opts.counterpartyName, piAmount: opts.piAmount,
//     }) : null,
    
//   );
// }

/** Buyer marked payment as sent — notify the seller to verify & release */
// export async function notifyPaymentMarkedPaid(
//   userId: string,
//   username: string,
//   opts: { orderId: string; piAmount: string; buyerName: string },
// ): Promise<void> {
//   const user = await resolveNotificationContact(userId, username);
//   await dispatch(
//     user,
//     user?.email ? () => emailPaymentMarkedPaid({
//       to: user.email!, username: user.username,
//       orderId: opts.orderId, piAmount: opts.piAmount, buyerName: opts.buyerName,
//     }) : null,
//     user?.phone ? () => whatsappPaymentMarkedPaid({
//       phone: user.phone!, orderId: opts.orderId,
//       buyerName: opts.buyerName, piAmount: opts.piAmount,
//     }) : null,
//   );
// }

/** Order cancelled — notify either party */
// export async function notifyOrderCancelled(
//   userId: string,
//   username: string,
//   opts: { orderId: string; piAmount: string; reason?: string },
// ): Promise<void> {
//   const user = await resolveNotificationContact(userId, username);
//   await dispatch(
//     user,
//     user?.email ? () => emailOrderCancelled({
//       to: user.email!, username: user.username,
//       orderId: opts.orderId, piAmount: opts.piAmount, reason: opts.reason,
//     }) : null,
//     user?.phone ? () => whatsappOrderCancelled({
//       phone: user.phone!, orderId: opts.orderId, piAmount: opts.piAmount,
//     }) : null,
//   );
// }

// ═══════════════════════════════════════════════════════════════════════════
// Account events
// ═══════════════════════════════════════════════════════════════════════════

// export async function notifyUserWelcome(userId: string, username: string): Promise<void> {
//   const user = await resolveNotificationContact(userId, username);
//   await dispatch(
//     user,
//     user?.email ? () => emailWelcome({ to: user.email!, username: user.username }) : null,
//     user?.phone ? () => whatsappWelcome({ phone: user.phone!, username: user.username }) : null,
//   );
// }

export async function notifyCustom(opts: {
  userId: string; username: string; subject: string; title: string; body: string;
  ctaText?: string; ctaUrl?: string;
}): Promise<void> {
  const user = await resolveNotificationContact(opts.userId, opts.username);
  await dispatch(
    user,
    user?.email ? () => emailAlert({
      to: user.email!, subject: opts.subject, title: opts.title, body: opts.body,
      ctaText: opts.ctaText, ctaUrl: opts.ctaUrl,
    }) : null,
    null, // custom alerts; no generic WhatsApp template
    user?.fcmTokens ? () => pushToTokens(
    user.fcmTokens as string[],
    {
      title: opts.title,
      body:opts.body,
      data: opts.ctaUrl ? { url: opts.ctaUrl } : {},
    }) : null,
  );
}
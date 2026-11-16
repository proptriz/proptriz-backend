// src/services/notification.service.ts
// Unified notification dispatcher: one function per alert.
// Each fans out to email, push and (when enabled) WhatsApp in parallel,
// respecting the person's NotificationSettings. Designed to be called
// fire-and-forget, strictly AFTER the related database write has succeeded.

import {
  isWhatsappEnabled,
  whatsappListingEnquiry,
  whatsappListingExpiring,
  whatsappNewListing,
} from './whatsapp.service';
import {
  emailListingEnquiry,
  emailListingExpiring,
  emailNewListing,
  emailWelcome,
} from './email.service';
import { getNotificationSettings } from './notificationSettings.service';
import logger from '../config/loggingConfig';
import { getTokensForUser, pruneStaleTokens } from '../models/deviceToken';
import { PushPayload, pushToTokens } from './pushNotification.service';
import {
  AlertLocale, ListingSummary, alertCopy, editListingUrl, listingUrl,
} from './notificationCopy';

// ─── Resolved contact shape ───────────────────────────────────────────────────

export interface UserContact {
  username:   string;
  email?:     string;   // set only when the email channel is on
  phone?:     string;   // set only when the WhatsApp channel is on
  fcmTokens?: string[]; // set only when push is on and a device is registered
}

// ─── Resolve a user's contact info from their saved NotificationSettings ────

export async function resolveNotificationContact(
  userId: string,
  username: string
): Promise<UserContact | null> {
  try {
    const settings = await getNotificationSettings(userId);
    if (!settings) {
      logger.warn(`[Notify] No notification settings found for user ${userId}; skipping`);
      return null;
    }

    const fcmTokens = settings.pushEnabled ? await getTokensForUser(userId) : [];

    return {
      username,
      email:     settings.emailEnabled    ? settings.email ?? undefined          : undefined,
      phone:     settings.whatsappEnabled ? settings.whatsappNumber ?? undefined : undefined,
      fcmTokens: fcmTokens.length > 0 ? fcmTokens : undefined,
    };
  } catch (err) {
    logger.error(`[Notify] Failed to resolve contact for user ${userId}:`, err);
    return null;
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

interface ChannelSends {
  email?:    (to: string) => Promise<void>;
  whatsapp?: (phone: string) => Promise<void>;
  push?:     PushPayload;
}

async function dispatch(user: UserContact | null, sends: ChannelSends): Promise<void> {
  if (!user) return;

  const tasks: Promise<void>[] = [];

  if (sends.email && user.email) {
    const to = user.email;
    tasks.push(sends.email(to).catch((err) => { logger.error('[Notify] Email failed:', err); }));
  }

  if (sends.whatsapp && user.phone && isWhatsappEnabled()) {
    const phone = user.phone;
    tasks.push(sends.whatsapp(phone).catch((err) => { logger.error('[Notify] WhatsApp failed:', err); }));
  }

  if (sends.push && user.fcmTokens?.length) {
    const tokens = user.fcmTokens;
    tasks.push(
      pushToTokens(tokens, sends.push)
        .then((staleTokens) => pruneStaleTokens(staleTokens))
        .catch((err) => { logger.error('[Notify] Push failed:', err); })
    );
  }

  if (!tasks.length) {
    logger.info(`[Notify] No enabled channels with contact info for ${user.username}; skipped`);
    return;
  }

  await Promise.allSettled(tasks);
}

// ═══════════════════════════════════════════════════════════════════════════
// Listing alerts
// ═══════════════════════════════════════════════════════════════════════════

/** A new listing matches what the person is looking for. */
export async function notifyNewListing(
  userId: string,
  username: string,
  opts: { listing: ListingSummary; searchName?: string; locale?: AlertLocale },
): Promise<void> {
  const { listing, searchName, locale } = opts;
  const copy = alertCopy(locale);
  const user = await resolveNotificationContact(userId, username);

  await dispatch(user, {
    email:    (to) => emailNewListing({ to, username, listing, searchName, locale }),
    whatsapp: (phone) => whatsappNewListing({ phone, listing, locale }),
    push: {
      title: copy.newListing.pushTitle,
      body: copy.newListing.pushBody(listing),
      imageUrl: listing.imageUrl,
      data: { type: 'new_listing', listingId: listing.id, url: listingUrl(listing.id) },
    },
  });
}

/** Tell the agent/owner that someone asked for the contact on their listing. */
export async function notifyListingEnquiry(
  userId: string,
  username: string,
  opts: { listing: ListingSummary; enquirerName: string; locale?: AlertLocale },
): Promise<void> {
  const { listing, enquirerName, locale } = opts;
  const copy = alertCopy(locale);
  const user = await resolveNotificationContact(userId, username);

  await dispatch(user, {
    email:    (to) => emailListingEnquiry({ to, username, listing, enquirerName, locale }),
    whatsapp: (phone) => whatsappListingEnquiry({ phone, listing, enquirerName, locale }),
    push: {
      title: copy.enquiry.pushTitle,
      body: copy.enquiry.pushBody(enquirerName, listing),
      data: { type: 'listing_enquiry', listingId: listing.id, url: listingUrl(listing.id) },
    },
  });
}

/** Warn the agent/owner shortly before a listing expires. */
export async function notifyListingExpiring(
  userId: string,
  username: string,
  opts: { listing: ListingSummary; daysLeft: number; locale?: AlertLocale },
): Promise<void> {
  const { listing, daysLeft, locale } = opts;
  const copy = alertCopy(locale);
  const user = await resolveNotificationContact(userId, username);

  await dispatch(user, {
    email:    (to) => emailListingExpiring({ to, username, listing, daysLeft, locale }),
    whatsapp: (phone) => whatsappListingExpiring({ phone, listing, daysLeft, locale }),
    push: {
      title: copy.expiring.pushTitle,
      body: copy.expiring.pushBody(listing, daysLeft),
      data: { type: 'listing_expiring', listingId: listing.id, url: editListingUrl(listing.id) },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Account events
// ═══════════════════════════════════════════════════════════════════════════

export async function notifyUserWelcome(
  userId: string,
  username: string,
  opts: { locale?: AlertLocale } = {},
): Promise<void> {
  const user = await resolveNotificationContact(userId, username);
  await dispatch(user, {
    email: (to) => emailWelcome({ to, username, locale: opts.locale }),
  });
}

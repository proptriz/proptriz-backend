// src/services/notification.service.ts
// One function per alert. Each builds the wording and the link, then hands the
// alert to the router, which writes the inbox item and decides push and email
// from the person's settings. Call these fire-and-forget, strictly AFTER the
// related database write has succeeded.

import { emailListingEnquiry, emailListingExpiring, emailWelcome } from './email.service';
import { ListingSummary, alertCopy, appUrl, editListingUrl, listingUrl } from './notificationCopy';
import { AlertOutcome, routeAlert } from './alertRouter.service';

/**
 * A new listing matches what the person is looking for.
 * Inbox and push straight away; the daily email digest as a fallback.
 */
export async function notifyNewListing(
  userId: string,
  opts: { listing: ListingSummary; savedSearchId?: string; searchName?: string },
): Promise<AlertOutcome> {
  const { listing } = opts;
  return routeAlert({
    userId,
    type: 'new_listing',
    propertyId: listing.id,
    savedSearchId: opts.savedSearchId,
    imageUrl: listing.imageUrl,
    url: listingUrl(listing.id),
    content: (locale) => {
      const copy = alertCopy(locale);
      return { title: copy.newListing.pushTitle, body: copy.newListing.pushBody(listing) };
    },
  });
}

/**
 * Tell the agent/owner that someone asked for the contact on their listing.
 * One alert per enquirer per listing.
 */
export async function notifyListingEnquiry(
  userId: string,
  username: string,
  opts: { listing: ListingSummary; enquirerId: string; enquirerName: string },
): Promise<AlertOutcome> {
  const { listing, enquirerName } = opts;
  return routeAlert({
    userId,
    type: 'enquiry',
    propertyId: listing.id,
    dedupeKey: `enquiry:${listing.id}:${opts.enquirerId}`,
    url: listingUrl(listing.id),
    content: (locale) => {
      const copy = alertCopy(locale);
      return { title: copy.enquiry.pushTitle, body: copy.enquiry.pushBody(enquirerName, listing) };
    },
    email: 'now',
    emailNow: ({ to, locale, url }) => emailListingEnquiry({ to, username, listing, enquirerName, locale, url }),
  });
}

/** Warn the agent/owner shortly before a listing expires. One alert per listing per expiry date. */
export async function notifyListingExpiring(
  userId: string,
  username: string,
  opts: { listing: ListingSummary; daysLeft: number; expiresOn: string },
): Promise<AlertOutcome> {
  const { listing, daysLeft } = opts;
  return routeAlert({
    userId,
    type: 'expiring',
    propertyId: listing.id,
    dedupeKey: `expiring:${listing.id}:${opts.expiresOn}`,
    url: editListingUrl(listing.id),
    content: (locale) => {
      const copy = alertCopy(locale);
      return { title: copy.expiring.pushTitle, body: copy.expiring.pushBody(listing, daysLeft) };
    },
    email: 'now',
    emailNow: ({ to, locale, url }) => emailListingExpiring({ to, username, listing, daysLeft, locale, url }),
  });
}

/** Welcome message for a new account: inbox item plus an email if one is set. */
export async function notifyUserWelcome(userId: string, username: string): Promise<AlertOutcome> {
  return routeAlert({
    userId,
    type: 'system',
    dedupeKey: 'welcome',
    url: appUrl('/'),
    content: (locale) => {
      const copy = alertCopy(locale);
      return { title: copy.welcome.heading, body: copy.welcome.intro };
    },
    email: 'now',
    emailNow: ({ to, locale }) => emailWelcome({ to, username, locale }),
  });
}

/**
 * A test alert the person asked for from the settings screen. Fixed wording,
 * sent to the caller only, through every channel they have switched on.
 */
export async function notifyTest(userId: string, now: Date = new Date()): Promise<AlertOutcome> {
  return routeAlert({
    userId,
    type: 'system',
    dedupeKey: `test:${now.getTime()}`,
    url: appUrl('/notifications'),
    content: (locale) => alertCopy(locale).test,
    email: 'now',
    immediate: true,
  }, now);
}

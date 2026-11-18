// src/services/alertStore.ts
// Every database read and write the alert router and the jobs need.
// Kept in one place so the routing rules can be tested without a database.
import { Types } from 'mongoose';
import { EmailStatus, INotification, Notification, OpenChannel, PushStatus } from '../models/notification';
import { NotificationSettings } from '../models/notificationSettings';
import { NotificationPreferencesDTO, toSettingsDTO } from './notificationSettings.service';

const id = (value: string) => new Types.ObjectId(value);

export interface NewNotification {
  userId: string;
  type: INotification['type'];
  title: string;
  body: string;
  url: string;
  imageUrl?: string;
  propertyId?: string;
  savedSearchId?: string;
  dedupeKey: string;
}

export interface StoredNotification {
  id: string;
  userId: string;
  type: INotification['type'];
  title: string;
  body: string;
  url: string;
  imageUrl?: string;
  propertyId?: string;
  pushStatus: PushStatus;
  emailStatus: EmailStatus;
  readAt?: Date;
  openedAt?: Date;
  createdAt: Date;
}

function toStored(doc: any): StoredNotification {
  return {
    id: String(doc._id),
    userId: String(doc.user),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    url: doc.url,
    imageUrl: doc.imageUrl ?? undefined,
    propertyId: doc.property ? String(doc.property) : undefined,
    pushStatus: doc.push?.status ?? 'off',
    emailStatus: doc.email?.status ?? 'none',
    readAt: doc.readAt ?? undefined,
    openedAt: doc.openedAt ?? undefined,
    createdAt: doc.createdAt,
  };
}

/** Settings for one person, created with defaults on first use. */
export async function loadSettings(userId: string): Promise<NotificationPreferencesDTO> {
  return toSettingsDTO(await NotificationSettings.getOrCreate(id(userId)));
}

/** Inserts the inbox row. Returns null when the same alert already exists for this person. */
export async function insertNotification(input: NewNotification): Promise<StoredNotification | null> {
  try {
    const doc = await Notification.create({
      user: id(input.userId),
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url,
      imageUrl: input.imageUrl,
      property: input.propertyId ? id(input.propertyId) : undefined,
      savedSearch: input.savedSearchId ? id(input.savedSearchId) : undefined,
      dedupeKey: input.dedupeKey,
    });
    return toStored(doc);
  } catch (err: any) {
    if (err?.code === 11000) return null; // duplicate: already alerted
    throw err;
  }
}

export async function setPushResult(
  notificationId: string,
  status: PushStatus,
  extra: { at?: Date; holdUntil?: Date; error?: string } = {},
): Promise<void> {
  const set: Record<string, unknown> = { 'push.status': status };
  if (extra.at) set['push.at'] = extra.at;
  if (extra.holdUntil) set['push.holdUntil'] = extra.holdUntil;
  if (extra.error) set['push.error'] = extra.error.slice(0, 300);
  await Notification.updateOne({ _id: id(notificationId) }, { $set: set });
}

export async function setEmailResult(
  notificationIds: string[],
  status: EmailStatus,
  extra: { at?: Date; error?: string } = {},
): Promise<void> {
  if (!notificationIds.length) return;
  const set: Record<string, unknown> = { 'email.status': status };
  if (extra.at) set['email.at'] = extra.at;
  if (extra.error) set['email.error'] = extra.error.slice(0, 300);
  await Notification.updateMany({ _id: { $in: notificationIds.map(id) } }, { $set: set });
}

/** Instant pushes already sent to this person since `since` (start of their day). */
export async function countPushesSince(userId: string, since: Date): Promise<number> {
  return Notification.countDocuments({ user: id(userId), 'push.status': 'sent', 'push.at': { $gte: since } });
}

/** Alerts of one type created for this person since `since` (rate limits). */
export async function countByTypeSince(userId: string, type: INotification['type'], since: Date): Promise<number> {
  return Notification.countDocuments({ user: id(userId), type, createdAt: { $gte: since } });
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export async function listInbox(
  userId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ items: StoredNotification[]; nextCursor: string | null }> {
  const filter: Record<string, unknown> = { user: id(userId) };
  if (opts.cursor) filter._id = { $lt: id(opts.cursor) };

  const docs = await Notification.find(filter).sort({ _id: -1 }).limit(opts.limit + 1).lean();
  const page = docs.slice(0, opts.limit);
  return {
    items: page.map(toStored),
    nextCursor: docs.length > opts.limit ? String(page[page.length - 1]._id) : null,
  };
}

export async function countUnread(userId: string): Promise<number> {
  return Notification.countDocuments({ user: id(userId), readAt: null });
}

/** Marks the person's own alerts as read. `ids` omitted means all of them. */
export async function markRead(userId: string, ids: string[] | undefined, now: Date): Promise<number> {
  const filter: Record<string, unknown> = { user: id(userId), readAt: null };
  if (ids) filter._id = { $in: ids.map(id) };
  const result = await Notification.updateMany(filter, { $set: { readAt: now } });
  return result.modifiedCount;
}

/**
 * Records that an alert was opened and returns where it leads.
 * The first open wins for `openedAt` and `openedVia`; `userId`, when given,
 * restricts the open to that person's own alert.
 */
export async function recordOpen(
  notificationId: string,
  channel: OpenChannel,
  now: Date,
  userId?: string,
): Promise<{ url: string } | null> {
  if (!Types.ObjectId.isValid(notificationId)) return null;
  const filter: Record<string, unknown> = { _id: id(notificationId) };
  if (userId) filter.user = id(userId);

  const doc = await Notification.findOne(filter).select('url openedAt readAt');
  if (!doc) return null;

  const set: Record<string, unknown> = {};
  if (!doc.openedAt) { set.openedAt = now; set.openedVia = channel; }
  if (!doc.readAt) set.readAt = now;
  if (Object.keys(set).length) await Notification.updateOne({ _id: doc._id }, { $set: set });

  return { url: doc.url };
}

// ─── Scheduler queries ────────────────────────────────────────────────────────

/** Pushes held for quiet hours whose hold has ended, oldest first. */
export async function findHeldPushesDue(now: Date, limit: number): Promise<StoredNotification[]> {
  const docs = await Notification.find({ 'push.status': 'held', 'push.holdUntil': { $lte: now } })
    .sort({ 'push.holdUntil': 1 })
    .limit(limit)
    .lean();
  return docs.map(toStored);
}

/** Filter for alerts that belong in a digest now. */
function digestFilter(now: Date): Record<string, unknown> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    openedAt: null,
    readAt: null,
    $or: [
      { 'email.status': 'pending' },
      { 'email.status': 'after_24h', createdAt: { $lte: dayAgo } },
    ],
  };
}

/** People who have at least one alert waiting for a digest. */
export async function findUsersWithDigestItems(now: Date): Promise<string[]> {
  const ids = await Notification.distinct('user', digestFilter(now));
  return ids.map(String);
}

/** One person's alerts waiting for a digest, newest first. */
export async function findDigestItems(userId: string, now: Date, limit: number): Promise<StoredNotification[]> {
  const docs = await Notification.find({ user: id(userId), ...digestFilter(now) })
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
  return docs.map(toStored);
}

export async function loadSettingsForUsers(userIds: string[]): Promise<Map<string, NotificationPreferencesDTO>> {
  const docs = await NotificationSettings.find({ userId: { $in: userIds.map(id) } });
  return new Map(docs.map((doc) => [String(doc.userId), toSettingsDTO(doc)]));
}

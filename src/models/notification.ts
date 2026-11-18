// src/models/notification.ts
// One row per alert per person: it is the in-app inbox item AND the delivery
// log (what was tried on each channel, and whether the person opened it).
import { Schema, model, Document, Types } from 'mongoose';

export const ALERT_TYPES = [
  'new_listing',     // a new listing matches a saved search
  'listing_change',  // price drop, available again, relisted
  'enquiry',         // someone contacted the agent about a listing
  'expiring',        // the agent's listing is about to expire
  'review',          // new review on the agent's listing
  'agent_report',    // weekly reach numbers
  'demand',          // what seekers want in the agent's area
  'system',          // account and test messages; cannot be switched off
] as const;
export type AlertType = typeof ALERT_TYPES[number];

/** The types a person can switch on or off in settings. */
export const SWITCHABLE_ALERT_TYPES = ALERT_TYPES.filter((t) => t !== 'system') as Exclude<AlertType, 'system'>[];

export type PushStatus =
  | 'off'        // push is switched off in settings
  | 'no_device'  // no device registered, or none seen in the last 30 days
  | 'capped'     // over the daily limit of instant alerts
  | 'held'       // inside quiet hours; sent when they end
  | 'sent'
  | 'failed'
  | 'skipped';   // was held, but the person opened it before it was sent

export type EmailStatus =
  | 'none'       // not emailed (email off, or not wanted for this alert)
  | 'pending'    // goes into the next daily digest
  | 'after_24h'  // goes into a digest only if still unopened 24 hours later
  | 'sent'
  | 'failed';

export type OpenChannel = 'inbox' | 'push' | 'email';

export interface INotification extends Document {
  user: Types.ObjectId;
  type: AlertType;
  title: string;
  body: string;
  /** Where the alert leads: an https link on the public site. */
  url: string;
  imageUrl?: string;
  property?: Types.ObjectId;
  savedSearch?: Types.ObjectId;
  /** One alert per person per key; a second insert with the same key is dropped. */
  dedupeKey: string;
  push: { status: PushStatus; at?: Date; holdUntil?: Date; error?: string };
  email: { status: EmailStatus; at?: Date; error?: string };
  readAt?: Date;
  openedAt?: Date;
  openedVia?: OpenChannel;
  createdAt: Date;
  updatedAt: Date;
}

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    url: { type: String, required: true, maxlength: 2000 },
    imageUrl: { type: String, maxlength: 2000 },
    property: { type: Schema.Types.ObjectId, ref: 'Property' },
    savedSearch: { type: Schema.Types.ObjectId },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    push: {
      status: { type: String, required: true, default: 'off' },
      at: Date,
      holdUntil: Date,
      error: String,
    },
    email: {
      status: { type: String, required: true, default: 'none' },
      at: Date,
      error: String,
    },
    readAt: Date,
    openedAt: Date,
    openedVia: { type: String, enum: ['inbox', 'push', 'email'] },
  },
  { timestamps: true, collection: 'notifications' }
);

// Inbox: newest first for one person; _id breaks ties and drives the cursor.
NotificationSchema.index({ user: 1, _id: -1 });
// Unread badge.
NotificationSchema.index({ user: 1, readAt: 1 });
// Duplicates are impossible: one alert per person per key.
NotificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
// Scheduler: pushes held for quiet hours, and digest candidates. Sparse-ish
// partial indexes keep these small, since most rows are in a final state.
NotificationSchema.index(
  { 'push.holdUntil': 1 },
  { partialFilterExpression: { 'push.status': 'held' } }
);
NotificationSchema.index(
  { 'email.status': 1, user: 1 },
  { partialFilterExpression: { 'email.status': { $in: ['pending', 'after_24h'] } } }
);
// Daily cap: instant pushes sent to one person today.
NotificationSchema.index({ user: 1, 'push.at': -1 });
// Old rows delete themselves.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });

export const Notification = model<INotification>('Notification', NotificationSchema);

// src/models/notificationSettings.ts
import { Schema, model, Document, Types, Model } from 'mongoose';
import { SWITCHABLE_ALERT_TYPES } from './notification';
import { DEFAULT_TIMEZONE } from '../utils/alertTime';

// ─── Interface ──────────────────────────────────────────────────────────────

export type SettingsLanguage = 'en' | 'fr' | 'sw';
export type SwitchableAlertType = typeof SWITCHABLE_ALERT_TYPES[number];
export type AlertTypeSwitches = Record<SwitchableAlertType, boolean>;

export interface INotificationSettings extends Document {
  userId:          Types.ObjectId;
  emailEnabled:    boolean;
  email?:          string;
  whatsappEnabled: boolean;
  whatsappNumber?: string;
  pushEnabled:     boolean;
  /** IANA time zone, e.g. "Africa/Lagos". Drives quiet hours and the digest hour. */
  timezone:        string;
  language:        SettingsLanguage;
  quietHours:      { enabled: boolean; start: string; end: string }; // "HH:mm", local time
  /** Local hour (0-23) at which the daily email digest is sent. */
  digestHour:      number;
  /** Per-alert-type switches. A type that is off creates no alert at all. */
  types:           AlertTypeSwitches;
  createdAt:       Date;
  updatedAt:       Date;
}

export const DEFAULT_QUIET_HOURS = { enabled: true, start: '21:00', end: '07:00' };
export const DEFAULT_DIGEST_HOUR = 8;

export function defaultTypeSwitches(): AlertTypeSwitches {
  return Object.fromEntries(SWITCHABLE_ALERT_TYPES.map((t) => [t, true])) as AlertTypeSwitches;
}

// ─── Validation patterns (kept in sync with the frontend screen) ─────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/; // requires leading + and country code

// ─── Schema ───────────────────────────────────────────────────────────────────

const typeSwitchFields = Object.fromEntries(
  SWITCHABLE_ALERT_TYPES.map((t) => [t, { type: Boolean, default: true }])
);

const NotificationSettingsSchema = new Schema<INotificationSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    emailEnabled: { type: Boolean, default: false },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v: string) => !v || EMAIL_RE.test(v),
        message: 'Invalid email address',
      },
    },

    whatsappEnabled: { type: Boolean, default: false },
    whatsappNumber: {
      type: String,
      trim: true,
      validate: {
        validator: (v: string) => !v || WHATSAPP_RE.test(v),
        message: 'WhatsApp number must include country code, e.g. +2348012345678',
      },
    },

    // Push — opt-in only; depends on browser/device support
    pushEnabled: { type: Boolean, default: false },

    timezone: { type: String, default: DEFAULT_TIMEZONE },
    language: { type: String, enum: ['en', 'fr', 'sw'], default: 'en' },
    quietHours: {
      enabled: { type: Boolean, default: DEFAULT_QUIET_HOURS.enabled },
      start:   { type: String, default: DEFAULT_QUIET_HOURS.start },
      end:     { type: String, default: DEFAULT_QUIET_HOURS.end },
    },
    digestHour: { type: Number, min: 0, max: 23, default: DEFAULT_DIGEST_HOUR },
    types: typeSwitchFields,
  },
  { timestamps: true }
);

// ─── Cross-field validation ──────────────────────────────────────────────────
// A channel cannot be enabled without its required contact detail present.
// This guards direct DB writes; the service layer also validates on input.

NotificationSettingsSchema.pre('validate', function (this: INotificationSettings) {
  if (this.emailEnabled && !this.email) {
    throw new Error('Email address is required when email notifications are enabled');
  }
  if (this.whatsappEnabled && !this.whatsappNumber) {
    throw new Error('WhatsApp number is required when WhatsApp notifications are enabled');
  }
});

// ─── Static helpers ───────────────────────────────────────────────────────────

interface NotificationSettingsModel extends Model<INotificationSettings> {
  /** Get settings for a user, creating defaults (all channels off) if none exist yet. */
  getOrCreate(userId: Types.ObjectId | string): Promise<INotificationSettings>;
}

NotificationSettingsSchema.statics.getOrCreate = async function (
  userId: Types.ObjectId | string,
): Promise<INotificationSettings> {
  let settings = await this.findOne({ userId });

  if (!settings) {
    settings = await this.create({
      userId,
      emailEnabled: false,
      whatsappEnabled: false,
      pushEnabled: false,
    });
  }

  return settings;
};

export const NotificationSettings = model<INotificationSettings, NotificationSettingsModel>(
  'NotificationSettings',
  NotificationSettingsSchema
);

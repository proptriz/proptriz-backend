// src/models/notificationSettings.model.ts
import { Schema, model, Document, Types } from 'mongoose';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface INotificationSettings extends Document {
  userId:          Types.ObjectId;
  emailEnabled:    boolean;
  email?:          string;
  whatsappEnabled: boolean;
  whatsappNumber?: string;
  pushEnabled:     boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

// ─── Validation patterns (kept in sync with the frontend modal) ─────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/; // requires leading + and country code

// ─── Schema ───────────────────────────────────────────────────────────────────

const NotificationSettingsSchema = new Schema<INotificationSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Email — enabled by default per product requirement
    emailEnabled: { type: Boolean, default: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v: string) => !v || EMAIL_RE.test(v),
        message: 'Invalid email address',
      },
    },

    // WhatsApp — enabled by default per product requirement
    whatsappEnabled: { type: Boolean, default: true },
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
  },
  { timestamps: true }
);

// ─── Cross-field validation ──────────────────────────────────────────────────
// A channel cannot be enabled without its required contact detail present.
// This guards direct DB writes; the route layer also validates on input.

NotificationSettingsSchema.pre('validate', function (this: INotificationSettings) {
  if (this.emailEnabled && !this.email) {
    throw new Error('Email address is required when email notifications are enabled');
  }
  if (this.whatsappEnabled && !this.whatsappNumber) {
    throw new Error('WhatsApp number is required when WhatsApp notifications are enabled');
  }
});

// ─── Static helpers ───────────────────────────────────────────────────────────

interface NotificationSettingsModel {
  /** Get settings for a user, creating sane defaults if none exist yet. */
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

export const NotificationSettings = model<
  INotificationSettings,
  import('mongoose').Model<INotificationSettings> & NotificationSettingsModel
>('NotificationSettings', NotificationSettingsSchema);
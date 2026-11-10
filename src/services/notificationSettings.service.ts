// src/services/notificationSettings.service.ts
import { Types } from 'mongoose';
import { NotificationSettings, INotificationSettings } from '../models/notificationSettings';
import logger from '../config/loggingConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferencesInput {
  emailEnabled?:    boolean;
  email?:           string;
  whatsappEnabled?: boolean;
  whatsappNumber?:  string;
  pushEnabled?:     boolean;
}

export interface NotificationPreferencesDTO {
  emailEnabled:    boolean;
  email:            string | null;
  whatsappEnabled: boolean;
  whatsappNumber:   string | null;
  pushEnabled:      boolean;
  updatedAt:        Date;
}

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/;

// ─── Validation (mirrors model-level rules; surfaces clean error messages) ───

export class NotificationSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationSettingsValidationError';
  }
}

function assertValid(input: NotificationPreferencesInput) {
  if (input.emailEnabled) {
    if (!input.email || !input.email.trim()) {
      throw new NotificationSettingsValidationError('Email address is required when email notifications are enabled');
    }
    if (!EMAIL_RE.test(input.email.trim())) {
      throw new NotificationSettingsValidationError('Enter a valid email address');
    }
  }

  if (input.whatsappEnabled) {
    if (!input.whatsappNumber || !input.whatsappNumber.trim()) {
      throw new NotificationSettingsValidationError('WhatsApp number is required when WhatsApp notifications are enabled');
    }
    if (!WHATSAPP_RE.test(input.whatsappNumber.trim())) {
      throw new NotificationSettingsValidationError('WhatsApp number must include country code, e.g. +2348012345678');
    }
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toDTO(doc: INotificationSettings): NotificationPreferencesDTO {
  return {
    emailEnabled:    doc.emailEnabled,
    email:           doc.email ?? null,
    whatsappEnabled: doc.whatsappEnabled,
    whatsappNumber:  doc.whatsappNumber ?? null,
    pushEnabled:     doc.pushEnabled,
    updatedAt:       doc.updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a user's notification settings, creating defaults
 * (email + WhatsApp enabled, push disabled) if none exist yet.
 */
export async function getNotificationSettings(
  userId: string,
): Promise<NotificationPreferencesDTO> {
  const doc = await NotificationSettings.getOrCreate(new Types.ObjectId(userId));
  return toDTO(doc);
}

/**
 * Update a user's notification settings.
 * Validates that required contact fields are present for any enabled channel.
 * Performs a partial update — only fields present in `input` are changed.
 */
export async function updateNotificationSettings(
  userId: string,
  input: NotificationPreferencesInput
): Promise<NotificationPreferencesDTO> {
  const existing = await NotificationSettings.getOrCreate(new Types.ObjectId(userId));

  // Merge incoming partial update over existing state before validating,
  // so e.g. enabling email without resending an already-saved address still works.
  const merged: NotificationPreferencesInput = {
    emailEnabled:    input.emailEnabled    ?? existing.emailEnabled,
    email:           input.email           ?? existing.email,
    whatsappEnabled: input.whatsappEnabled ?? existing.whatsappEnabled,
    whatsappNumber:  input.whatsappNumber  ?? existing.whatsappNumber,
    pushEnabled:     input.pushEnabled     ?? existing.pushEnabled,
  };

  assertValid(merged);

  existing.emailEnabled    = merged.emailEnabled!;
  existing.email           = merged.email?.trim().toLowerCase();
  existing.whatsappEnabled = merged.whatsappEnabled!;
  existing.whatsappNumber  = merged.whatsappNumber?.trim();
  existing.pushEnabled     = merged.pushEnabled!;

  await existing.save();

  logger.info(`[NotificationSettings] Updated for user ${userId}`);
  return toDTO(existing);
}

/**
 * Fetch settings for multiple users at once — used by notification
 * dispatch jobs that need to fan out to many recipients.
 */
export async function getNotificationSettingsForUsers(
  userIds: string[]
): Promise<Map<string, NotificationPreferencesDTO>> {
  const docs = await NotificationSettings.find({
    userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
  });

  const map = new Map<string, NotificationPreferencesDTO>();
  for (const doc of docs) {
    map.set(doc.userId.toString(), toDTO(doc));
  }
  return map;
}

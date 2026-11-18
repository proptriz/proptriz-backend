// src/services/notificationSettings.service.ts
import { Types } from 'mongoose';
import {
  NotificationSettings, INotificationSettings, AlertTypeSwitches, SettingsLanguage,
  DEFAULT_QUIET_HOURS, DEFAULT_DIGEST_HOUR, defaultTypeSwitches,
} from '../models/notificationSettings';
import { SWITCHABLE_ALERT_TYPES } from '../models/notification';
import { DEFAULT_TIMEZONE, isValidClockTime, isValidTimeZone } from '../utils/alertTime';
import logger from '../config/loggingConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferencesInput {
  emailEnabled?:    boolean;
  email?:           string;
  whatsappEnabled?: boolean;
  whatsappNumber?:  string;
  pushEnabled?:     boolean;
  timezone?:        string;
  language?:        string;
  quietHours?:      { enabled?: boolean; start?: string; end?: string };
  digestHour?:      number;
  types?:           Partial<Record<string, boolean>>;
}

export interface NotificationPreferencesDTO {
  emailEnabled:    boolean;
  email:           string | null;
  whatsappEnabled: boolean;
  whatsappNumber:  string | null;
  pushEnabled:     boolean;
  timezone:        string;
  language:        SettingsLanguage;
  quietHours:      { enabled: boolean; start: string; end: string };
  digestHour:      number;
  types:           AlertTypeSwitches;
  updatedAt:       Date;
}

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/;
const LANGUAGES: SettingsLanguage[] = ['en', 'fr', 'sw'];

// ─── Validation (mirrors model-level rules; surfaces clean error messages) ───

export class NotificationSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationSettingsValidationError';
  }
}

const fail = (message: string): never => {
  throw new NotificationSettingsValidationError(message);
};

function assertChannelsValid(input: { emailEnabled?: boolean; email?: string; whatsappEnabled?: boolean; whatsappNumber?: string }) {
  if (input.emailEnabled) {
    if (!input.email || !input.email.trim()) fail('Email address is required when email notifications are enabled');
    if (!EMAIL_RE.test(input.email!.trim())) fail('Enter a valid email address');
  }

  if (input.whatsappEnabled) {
    if (!input.whatsappNumber || !input.whatsappNumber.trim()) fail('WhatsApp number is required when WhatsApp notifications are enabled');
    if (!WHATSAPP_RE.test(input.whatsappNumber!.trim())) fail('WhatsApp number must include country code, e.g. +2348012345678');
  }
}

function assertPreferencesValid(input: NotificationPreferencesInput) {
  if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) fail('Unknown time zone');
  if (input.language !== undefined && !LANGUAGES.includes(input.language as SettingsLanguage)) fail('Language must be one of en, fr, sw');

  if (input.digestHour !== undefined) {
    if (!Number.isInteger(input.digestHour) || input.digestHour < 0 || input.digestHour > 23) fail('Digest hour must be a whole number from 0 to 23');
  }

  if (input.quietHours !== undefined) {
    const q = input.quietHours;
    if (typeof q !== 'object' || q === null) fail('Invalid quiet hours');
    if (q.enabled !== undefined && typeof q.enabled !== 'boolean') fail('Invalid quiet hours');
    if (q.start !== undefined && !isValidClockTime(q.start)) fail('Quiet hours start must be a time like 21:00');
    if (q.end !== undefined && !isValidClockTime(q.end)) fail('Quiet hours end must be a time like 07:00');
  }

  if (input.types !== undefined) {
    if (typeof input.types !== 'object' || input.types === null) fail('Invalid alert types');
    for (const [key, value] of Object.entries(input.types)) {
      if (!(SWITCHABLE_ALERT_TYPES as string[]).includes(key)) fail(`Unknown alert type: ${key}`);
      if (typeof value !== 'boolean') fail(`Alert type ${key} must be true or false`);
    }
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
// Rows written before these fields existed read back with the defaults.

export function toSettingsDTO(doc: INotificationSettings): NotificationPreferencesDTO {
  const storedTypes = (doc.types ?? {}) as Partial<AlertTypeSwitches>;
  const types = defaultTypeSwitches();
  for (const key of SWITCHABLE_ALERT_TYPES) {
    if (typeof storedTypes[key] === 'boolean') types[key] = storedTypes[key] as boolean;
  }

  return {
    emailEnabled:    doc.emailEnabled,
    email:           doc.email ?? null,
    whatsappEnabled: doc.whatsappEnabled,
    whatsappNumber:  doc.whatsappNumber ?? null,
    pushEnabled:     doc.pushEnabled,
    timezone:        isValidTimeZone(doc.timezone) ? doc.timezone : DEFAULT_TIMEZONE,
    language:        LANGUAGES.includes(doc.language) ? doc.language : 'en',
    quietHours: {
      enabled: doc.quietHours?.enabled ?? DEFAULT_QUIET_HOURS.enabled,
      start:   isValidClockTime(doc.quietHours?.start) ? doc.quietHours.start : DEFAULT_QUIET_HOURS.start,
      end:     isValidClockTime(doc.quietHours?.end) ? doc.quietHours.end : DEFAULT_QUIET_HOURS.end,
    },
    digestHour: Number.isInteger(doc.digestHour) ? doc.digestHour : DEFAULT_DIGEST_HOUR,
    types,
    updatedAt: doc.updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Get a user's notification settings, creating defaults (all channels off) if none exist yet. */
export async function getNotificationSettings(
  userId: string,
): Promise<NotificationPreferencesDTO> {
  const doc = await NotificationSettings.getOrCreate(new Types.ObjectId(userId));
  return toSettingsDTO(doc);
}

/**
 * Update a user's notification settings.
 * Partial update: only fields present in `input` are changed. A channel can be
 * switched on only when its contact detail is present (new or already saved).
 */
export async function updateNotificationSettings(
  userId: string,
  input: NotificationPreferencesInput
): Promise<NotificationPreferencesDTO> {
  assertPreferencesValid(input);

  const existing = await NotificationSettings.getOrCreate(new Types.ObjectId(userId));

  const merged = {
    emailEnabled:    input.emailEnabled    ?? existing.emailEnabled,
    email:           input.email           ?? existing.email,
    whatsappEnabled: input.whatsappEnabled ?? existing.whatsappEnabled,
    whatsappNumber:  input.whatsappNumber  ?? existing.whatsappNumber,
    pushEnabled:     input.pushEnabled     ?? existing.pushEnabled,
  };
  assertChannelsValid(merged);

  existing.emailEnabled    = merged.emailEnabled;
  existing.email           = merged.email?.trim().toLowerCase() || undefined;
  existing.whatsappEnabled = merged.whatsappEnabled;
  existing.whatsappNumber  = merged.whatsappNumber?.trim() || undefined;
  existing.pushEnabled     = merged.pushEnabled;

  if (input.timezone !== undefined) existing.timezone = input.timezone;
  if (input.language !== undefined) existing.language = input.language as SettingsLanguage;
  if (input.digestHour !== undefined) existing.digestHour = input.digestHour;

  if (input.quietHours !== undefined) {
    const current = toSettingsDTO(existing).quietHours;
    existing.quietHours = {
      enabled: input.quietHours.enabled ?? current.enabled,
      start:   input.quietHours.start ?? current.start,
      end:     input.quietHours.end ?? current.end,
    };
  }

  if (input.types !== undefined) {
    existing.types = { ...toSettingsDTO(existing).types, ...(input.types as Partial<AlertTypeSwitches>) };
    existing.markModified('types');
  }

  await existing.save();

  logger.info(`[NotificationSettings] Updated for user ${userId}`);
  return toSettingsDTO(existing);
}

/** Settings for many users at once, for jobs that fan out to many people. */
export async function getNotificationSettingsForUsers(
  userIds: string[]
): Promise<Map<string, NotificationPreferencesDTO>> {
  const docs = await NotificationSettings.find({
    userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
  });

  const map = new Map<string, NotificationPreferencesDTO>();
  for (const doc of docs) {
    map.set(doc.userId.toString(), toSettingsDTO(doc));
  }
  return map;
}

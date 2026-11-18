import { Schema, model, Document, Types } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export type DevicePlatform = "web" | "android" | "ios";

export interface IDeviceToken extends Document {
  user: Types.ObjectId;
  fcmToken: string;
  platform: DevicePlatform;
  /** Last time this device registered or refreshed its token. */
  lastSeenAt: Date;
  appVersion?: string;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A device counts as live for push when it was seen within this many days. */
export const LIVE_DEVICE_DAYS = 30;

// ─── Schema ───────────────────────────────────────────────────────────────────

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    user:       { type: Schema.Types.ObjectId, ref: "User", required: true },
    fcmToken:   { type: String, required: true, unique: true },
    platform:   { type: String, enum: ["web", "android", "ios"], default: "web" },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    appVersion: { type: String, maxlength: 40 },
    language:   { type: String, maxlength: 10 },
  },
  { timestamps: true }
);

DeviceTokenSchema.index({ user: 1, lastSeenAt: -1 });

export const DeviceToken = model<IDeviceToken>("DeviceToken", DeviceTokenSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  platform?: DevicePlatform;
  appVersion?: string;
  language?: string;
}

/**
 * Register or refresh a device for a user. A token belongs to one device, so
 * if another account signs in on the same device the token moves to it.
 * Returns true if the token was newly inserted.
 */
export async function upsertToken(
  userId: string,
  fcmToken: string,
  info: DeviceInfo = {}
): Promise<boolean> {
  const set: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    platform: info.platform ?? "web",
    lastSeenAt: new Date(),
  };
  if (info.appVersion) set.appVersion = info.appVersion;
  if (info.language) set.language = info.language;

  const result = await DeviceToken.updateOne({ fcmToken }, { $set: set }, { upsert: true });
  return result.upsertedCount > 0;
}

/** Remove one of a user's own tokens (e.g. on logout). Never touches another user's device. */
export async function removeTokenForUser(userId: string, fcmToken: string): Promise<void> {
  await DeviceToken.deleteOne({ fcmToken, user: new Types.ObjectId(userId) });
}

/** Bulk-remove stale tokens returned by FCM after a multicast send. */
export async function pruneStaleTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  await DeviceToken.deleteMany({ fcmToken: { $in: tokens } });
}

/** FCM tokens of a user's live devices (seen in the last 30 days). */
export async function getTokensForUser(userId: string, now: Date = new Date()): Promise<string[]> {
  const liveSince = new Date(now.getTime() - LIVE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
  const docs = await DeviceToken.find(
    { user: new Types.ObjectId(userId), lastSeenAt: { $gte: liveSince } },
    "fcmToken"
  ).lean();
  return docs.map((d) => d.fcmToken);
}

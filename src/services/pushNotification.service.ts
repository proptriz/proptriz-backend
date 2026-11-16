import { initializeApp, cert, getApps, ServiceAccount } from "firebase-admin/app";
import {
  getMessaging,
  Message,
  SendResponse,
  MessagingTopicManagementResponse,
} from "firebase-admin/messaging";

import logger from "../config/loggingConfig";

// ─── Init (call once at app startup) ────────────────────────────────────────

/**
 * Returns true when Firebase is ready. Never throws: a missing or malformed
 * Firebase configuration must not stop the server (or the database
 * connection) from starting. Push simply stays off until it is configured.
 */
export function initFirebase(): boolean {
  if (getApps().length) return true;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    logger.warn("[Firebase] Not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY); push is disabled");
    return false;
  }

  try {
    const serviceAccount: ServiceAccount = {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };

    initializeApp({ credential: cert(serviceAccount) });
    logger.info("[Firebase] Initialized");
    return true;
  } catch (err) {
    logger.error("[Firebase] Failed to initialize; push is disabled:", err);
    return false;
  }
}

/** Messaging client, initializing Firebase on first use (serverless cold starts). */
function messaging() {
  if (!initFirebase()) throw new Error("Push notifications are not configured");
  return getMessaging();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // must be string values for FCM
  imageUrl?: string;
}

export interface SendResult {
  successCount: number;
  failureCount: number;
  failedTokens: string[];
}

// ─── Shared builders ─────────────────────────────────────────────────────────

const STALE_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function buildNotification(payload: PushPayload) {
  return {
    title: payload.title,
    body: payload.body,
    ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
  };
}

function buildWebpush(payload: PushPayload): NonNullable<Message["webpush"]> {
  return {
    fcmOptions: payload.data?.url ? { link: payload.data.url } : undefined,
    notification: {
      title: payload.title,
      body: payload.body,
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      ...(payload.imageUrl && { image: payload.imageUrl }),
    },
  };
}

// ─── Core send helpers ────────────────────────────────────────────────────────

/** Send to a single FCM token. */
export async function sendToToken(token: string, payload: PushPayload): Promise<string> {
  const message: Message = {
    token,
    notification: buildNotification(payload),
    data: payload.data,
    webpush: buildWebpush(payload),
  };
  return messaging().send(message);
}

/**
 * Send to multiple FCM tokens (500 per batch — FCM multicast limit).
 * Returns counts + stale tokens you can purge from the DB.
 */
export async function sendToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<SendResult> {
  const result: SendResult = { successCount: 0, failureCount: 0, failedTokens: [] };
  if (!tokens.length) return result;

  for (const chunk of chunkArray(tokens, 500)) {
    const notification = buildNotification(payload);
    const webpush = buildWebpush(payload);

    const messages: Message[] = chunk.map((token) => ({
      token,
      notification,
      data: payload.data,
      webpush,
    }));

    const batchResponse = await messaging().sendEach(messages);

    result.successCount += batchResponse.successCount;
    result.failureCount += batchResponse.failureCount;

    batchResponse.responses.forEach((resp: SendResponse, idx: number) => {
      if (!resp.success) {
        logger.warn(`[FCM] Failed token ...${chunk[idx].slice(-8)}: ${resp.error?.code}`);
        if (resp.error && STALE_CODES.has(resp.error.code)) {
          result.failedTokens.push(chunk[idx]);
        }
      }
    });
  }

  return result;
}

/** Send to a Firebase topic (e.g. "payments", "all-users"). */
export async function sendToTopic(topic: string, payload: PushPayload): Promise<string> {
  const message: Message = {
    topic,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    webpush: buildWebpush(payload),
  };
  return messaging().send(message);
}

// ─── Topic subscription helpers ──────────────────────────────────────────────

export async function subscribeToTopic(
  tokens: string[],
  topic: string
): Promise<MessagingTopicManagementResponse> {
  return messaging().subscribeToTopic(tokens, topic);
}

export async function unsubscribeFromTopic(
  tokens: string[],
  topic: string
): Promise<MessagingTopicManagementResponse> {
  return messaging().unsubscribeFromTopic(tokens, topic);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Send-and-forget variant: logs counts and returns the stale tokens for the caller to purge. */
export async function pushToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<string[]> {
  const result = await sendToTokens(tokens, payload);
  logger.info(`[FCM] Sent: ${result.successCount} ok, ${result.failureCount} failed`);
  return result.failedTokens;
}
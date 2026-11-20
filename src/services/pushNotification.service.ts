import { initializeApp, cert, getApps, ServiceAccount } from "firebase-admin/app";
import {
  getMessaging,
  Message,
  SendResponse,
  MessagingTopicManagementResponse,
} from "firebase-admin/messaging";

import logger from "../config/loggingConfig";

// ─── Credentials ─────────────────────────────────────────────────────────────

/**
 * Turns a pasted private key into valid PEM. Hosting dashboards and .env files
 * mangle it in predictable ways: wrapping quotes, a trailing comma copied from
 * the JSON, literal "\n" instead of line breaks, or line breaks replaced by spaces.
 * Rebuilding the PEM from its base64 body handles all of them.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim().replace(/,$/, "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");

  const match = key.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!match) return key;

  const body = match[2].replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${match[1]}-----\n${lines.join("\n")}\n-----END ${match[1]}-----\n`;
}

type CredentialResult =
  | { ok: true; account: ServiceAccount }
  | { ok: false; reason: string };

/**
 * Reads the Firebase service account from the environment, either as
 * FIREBASE_SERVICE_ACCOUNT_JSON (the whole JSON file, or its base64: easiest to
 * paste correctly) or as the three separate variables.
 */
export function loadServiceAccount(env: NodeJS.ProcessEnv): CredentialResult {
  const whole = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (whole) {
    try {
      const text = whole.startsWith("{") ? whole : Buffer.from(whole, "base64").toString("utf8");
      const json = JSON.parse(text);
      if (!json.project_id || !json.client_email || !json.private_key) {
        return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key" };
      }
      return {
        ok: true,
        account: {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: normalizePrivateKey(json.private_key),
        },
      };
    } catch {
      return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 of it)" };
    }
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    return {
      ok: false,
      reason: "Not configured (set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY)",
    };
  }
  return {
    ok: true,
    account: {
      projectId: FIREBASE_PROJECT_ID.trim(),
      clientEmail: FIREBASE_CLIENT_EMAIL.trim(),
      privateKey: normalizePrivateKey(FIREBASE_PRIVATE_KEY),
    },
  };
}

// ─── Init (call once at app startup) ────────────────────────────────────────

/**
 * Returns true when Firebase is ready. Never throws: a missing or malformed
 * Firebase configuration must not stop the server (or the database
 * connection) from starting. Push simply stays off until it is configured.
 */
export function initFirebase(): boolean {
  if (getApps().length) return true;

  const credentials = loadServiceAccount(process.env);
  if (!credentials.ok) {
    logger.warn(`[Firebase] ${credentials.reason}; push is disabled`);
    return false;
  }

  try {
    initializeApp({ credential: cert(credentials.account) });
    logger.info("[Firebase] Initialized");
    return true;
  } catch (err: any) {
    logger.error(
      `[Firebase] Failed to initialize (${err?.code ?? "error"}); push is disabled. ` +
        "If this mentions the private key, paste the whole private_key value from the service account JSON, " +
        "or set FIREBASE_SERVICE_ACCOUNT_JSON to the whole file's contents (or its base64).",
      err,
    );
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
  // The token belongs to a different Firebase project (for example one created
  // before the project was replaced). It can never work with these credentials;
  // the browser registers a fresh token the next time the person opens the app.
  "messaging/mismatched-credential",
]);

/**
 * True when a failed send means this token can never work again, so it should be
 * forgotten. "Permission denied by the third party webpush service" is the browser
 * vendor's push service refusing a subscription that was made with a different
 * key (for example before the Firebase project changed); the browser must subscribe again.
 */
export function isDeadTokenError(error?: { code?: string; message?: string }): boolean {
  if (!error) return false;
  if (error.code && STALE_CODES.has(error.code)) return true;
  const text = `${error.message ?? ""}`;
  return /THIRD_PARTY_PERMISSION_DENIED|Permission denied by the third party webpush service/i.test(text);
}

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

/**
 * Message for one device token.
 *
 * It is data-only on purpose: the title, body and image travel in `data`, and the
 * service worker (and the open page) show the notification themselves. With a
 * `notification` block the browser shows it by itself when the tab is closed but
 * hands it silently to the page when the tab is open, so a person looking at the
 * app saw nothing. One path for both cases keeps taps and icons consistent.
 */
export function buildTokenMessage(token: string, payload: PushPayload): Message {
  return {
    token,
    data: {
      ...(payload.data ?? {}),
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  };
}

/** Send to a single FCM token. */
export async function sendToToken(token: string, payload: PushPayload): Promise<string> {
  return messaging().send(buildTokenMessage(token, payload));
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
    const messages: Message[] = chunk.map((token) => buildTokenMessage(token, payload));

    const batchResponse = await messaging().sendEach(messages);

    result.successCount += batchResponse.successCount;
    result.failureCount += batchResponse.failureCount;

    batchResponse.responses.forEach((resp: SendResponse, idx: number) => {
      if (!resp.success) {
        logger.warn(`[FCM] Failed token ...${chunk[idx].slice(-8)}: ${resp.error?.code} - ${resp.error?.message}`);
        if (isDeadTokenError(resp.error)) {
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
// src/routes/notificationSettings.routes.ts
import { Router } from 'express';
import { verifyToken } from '../middlewares/verifyToken';
import * as notificationController from '../controllers/notificationController'
import { getTokensForUser, getTokensForUsers, pruneStaleTokens, removeToken, upsertToken } from '../models/deviceToken';
import { sendToTokens, sendToTopic } from '../services/pushNotification.service';

const notificationRoutes = Router();

// ─── GET /notifications/settings ──────────────────────────────────────────────
// Returns the current user's notification settings.b
// Creates sane defaults (email + WhatsApp on, push off) on first access.
notificationRoutes.get('/settings', verifyToken, notificationController.getUsersSettings);

// ─── PATCH /notifications/settings ────────────────────────────────────────────
// Partial update — only send the fields that changed.
// Body: { emailEnabled?, email?, whatsappEnabled?, whatsappNumber?, pushEnabled? }
notificationRoutes.patch('/settings', verifyToken, notificationController.updateSettings);

// ─── POST /notifications/custom ────────────────────────────────────────────
notificationRoutes.post('/custom', verifyToken, notificationController.customNotification);

// ----------- PUSH NOTIFICATIONS (FCM) -----------

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // must be string values for FCM
  imageUrl?: string;
}

// ─── 1. Register / refresh a device token ────────────────────────────────────
// Called by the frontend after the user grants notification permission.
// POST /notifications/token
// Body: { userId, fcmToken, platform? }
notificationRoutes.post("/token", async (req, res) => {
  const { userId, fcmToken, platform } = req.body;

  if (!userId || !fcmToken) {
    return res.status(400).json({ error: "userId and fcmToken are required" });
  }

  try {
    const isNew = await upsertToken(userId, fcmToken, platform);
    return res.json({ success: true, isNew });
  } catch (err) {
    console.error("[Token Register]", err);
    return res.status(500).json({ error: "Failed to save token" });
  }
});

// ─── 2. Remove a device token (logout / revoke) ───────────────────────────────
// DELETE /notifications/token
// Body: { fcmToken }
notificationRoutes.delete("/token", async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) return res.status(400).json({ error: "fcmToken required" });

  try {
    await removeToken(fcmToken);
    return res.json({ success: true });
  } catch (err) {
    console.error("[Token Remove]", err);
    return res.status(500).json({ error: "Failed to remove token" });
  }
});

// ─── 3. Notify a single user (all their devices) ─────────────────────────────
// POST /notifications/user/:userId
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const payload: PushPayload = req.body;

  if (!payload.title || !payload.body) {
    return res.status(400).json({ error: "title and body required" });
  }

  try {
    const tokens = await getTokensForUser(userId);
    if (!tokens.length) return res.json({ sent: 0, message: "No registered devices" });

    const result = await sendToTokens(tokens, payload);

    // Auto-prune tokens FCM rejected
    if (result.failedTokens.length) await pruneStaleTokens(result.failedTokens);

    return res.json(result);
  } catch (err) {
    console.error("[Notify User]", err);
    return res.status(500).json({ error: "Notification failed" });
  }
});

// ─── 4. Notify multiple users at once ────────────────────────────────────────
// POST /notifications/users
// Body: { userIds: string[], title, body, data?, imageUrl? }
// notificationRoutes.post("/users", async (req, res) => {
//   const { userIds, ...payload }: { userIds: string[] } & PushPayload = req.body;

//   if (!Array.isArray(userIds) || !userIds.length) {
//     return res.status(400).json({ error: "userIds array required" });
//   }

//   try {
//     const tokens = await getTokensForUsers(userIds);
//     if (!tokens.length) return res.json({ sent: 0, message: "No registered devices" });

//     const result = await sendToTokens(tokens, payload);
//     if (result.failedTokens.length) await pruneStaleTokens(result.failedTokens);

//     return res.json(result);
//   } catch (err) {
//     console.error("[Notify Users]", err);
//     return res.status(500).json({ error: "Notification failed" });
//   }
// });

// ─── 5. Broadcast to a topic ──────────────────────────────────────────────────
// POST /notifications/topic/:topic
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post("/topic/:topic", async (req, res) => {
  const { topic } = req.params;
  const payload: PushPayload = req.body;

  if (!payload.title || !payload.body) {
    return res.status(400).json({ error: "title and body required" });
  }

  try {
    const messageId = await sendToTopic(topic, payload);
    return res.json({ success: true, messageId });
  } catch (err) {
    console.error("[Topic Broadcast]", err);
    return res.status(500).json({ error: "Broadcast failed" });
  }
});

// Quick one-off test route — remove after testing
notificationRoutes.post("/test-login", async (req, res) => {
  const { userId } = req.body;
  const tokens = await getTokensForUser(userId);

  if (!tokens.length) {
    return res.json({ error: "No tokens found for this user — registration may have failed" });
  }

  const result = await sendToTokens(tokens, {
    title: "Login Successful 🎉",
    body: "Welcome back to your Pi P2P platform!",
    data: { url: "/dashboard", type: "login" },
  });

  return res.json({ tokens, result });
});

export default notificationRoutes;

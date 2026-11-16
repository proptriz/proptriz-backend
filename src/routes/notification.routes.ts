// src/routes/notification.routes.ts
import { Router } from 'express';
import { verifyToken, verifyAdminToken } from '../middlewares/verifyToken';
import * as notificationController from '../controllers/notificationController';

const notificationRoutes = Router();

// ─── Signed-in user routes ────────────────────────────────────────────────────
// The user is always taken from the session (req.currentUser), never from the
// request body or URL.

// GET /notifications/settings — current user's settings (created on first access)
notificationRoutes.get('/settings', verifyToken, notificationController.getUsersSettings);

// PATCH /notifications/settings — partial update
// Body: { emailEnabled?, email?, whatsappEnabled?, whatsappNumber?, pushEnabled? }
notificationRoutes.patch('/settings', verifyToken, notificationController.updateSettings);

// POST /notifications/token — register / refresh this device for the signed-in user
// Body: { fcmToken, platform?: "web" | "android" | "ios" }
notificationRoutes.post('/token', verifyToken, notificationController.registerDeviceToken);

// DELETE /notifications/token — remove one of the signed-in user's devices
// Body: { fcmToken }
notificationRoutes.delete('/token', verifyToken, notificationController.removeDeviceToken);

// POST /notifications/test — send a fixed test push to the signed-in user's devices
notificationRoutes.post('/test', verifyToken, notificationController.sendTestNotification);

// ─── Admin-only routes (HTTP Basic, ADMIN_API_USERNAME / ADMIN_API_PASSWORD) ──

// POST /notifications/user/:userId — push to all of one user's devices
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post('/user/:userId', verifyAdminToken, notificationController.adminNotifyUser);

// POST /notifications/topic/:topic — broadcast to a Firebase topic
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post('/topic/:topic', verifyAdminToken, notificationController.adminNotifyTopic);

export default notificationRoutes;

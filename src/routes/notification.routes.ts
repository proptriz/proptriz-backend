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
// Body: { emailEnabled?, email?, whatsappEnabled?, whatsappNumber?, pushEnabled?,
//         timezone?, language?, quietHours?: { enabled?, start?, end? }, digestHour?, types?: { [type]: boolean } }
notificationRoutes.patch('/settings', verifyToken, notificationController.updateSettings);

// GET /notifications — inbox, newest first. Query: ?limit=20&cursor=<nextCursor>
notificationRoutes.get('/', verifyToken, notificationController.listNotifications);

// GET /notifications/unread-count — badge number
notificationRoutes.get('/unread-count', verifyToken, notificationController.getUnreadCount);

// POST /notifications/read — Body: { ids: string[] } or { all: true }
notificationRoutes.post('/read', verifyToken, notificationController.markNotificationsRead);

// POST /notifications/:id/open — inbox tap: records the open, returns { url }
notificationRoutes.post('/:id/open', verifyToken, notificationController.openNotification);

// POST /notifications/token — register / refresh this device for the signed-in user
// Body: { fcmToken, platform?: "web" | "android" | "ios", appVersion?, language? }
notificationRoutes.post('/token', verifyToken, notificationController.registerDeviceToken);

// DELETE /notifications/token — remove one of the signed-in user's devices
// Body: { fcmToken }
notificationRoutes.delete('/token', verifyToken, notificationController.removeDeviceToken);

// POST /notifications/test — test alert to the signed-in user: inbox, push and email
notificationRoutes.post('/test', verifyToken, notificationController.sendTestNotification);

// ─── Admin-only routes (HTTP Basic, ADMIN_API_USERNAME / ADMIN_API_PASSWORD) ──

// POST /notifications/user/:userId — push to all of one user's devices
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post('/user/:userId', verifyAdminToken, notificationController.adminNotifyUser);

// POST /notifications/topic/:topic — broadcast to a Firebase topic
// Body: { title, body, data?, imageUrl? }
notificationRoutes.post('/topic/:topic', verifyAdminToken, notificationController.adminNotifyTopic);

// ─── Tracked link (mounted at /api/v1/n) ──────────────────────────────────────
// GET /n/:id?c=push|email — records the open, then redirects to the alert's link.
export const trackedLinkRoutes = Router();
trackedLinkRoutes.get('/:id', notificationController.followTrackedLink);

export default notificationRoutes;

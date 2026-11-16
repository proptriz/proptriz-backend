import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

jest.mock('../src/helpers/jwt', () => ({ decodeUserToken: jest.fn() }));
jest.mock('../src/models/deviceToken', () => ({
  upsertToken: jest.fn().mockResolvedValue(true),
  removeTokenForUser: jest.fn().mockResolvedValue(undefined),
  getTokensForUser: jest.fn().mockResolvedValue(['tok-1']),
  pruneStaleTokens: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/pushNotification.service', () => ({
  sendToTokens: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0, failedTokens: [] }),
  sendToTopic: jest.fn().mockResolvedValue('message-id'),
}));
jest.mock('../src/services/notificationSettings.service', () => ({
  getNotificationSettings: jest.fn(),
  updateNotificationSettings: jest.fn(),
  NotificationSettingsValidationError: class extends Error {},
}));

import notificationRoutes from '../src/routes/notification.routes';
import { decodeUserToken } from '../src/helpers/jwt';
import * as deviceToken from '../src/models/deviceToken';
import * as push from '../src/services/pushNotification.service';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const OTHER_USER_ID = '64b7f0c2a1b2c3d4e5f60999';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/notifications', notificationRoutes);

const signedIn = () =>
  (decodeUserToken as jest.Mock).mockResolvedValue({ _id: { toString: () => USER_ID }, display_name: 'Ada' });

const adminAuth = (user = 'admin', pass = 'admin-pass') =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

describe('notification routes require the right caller', () => {
  describe.each([
    ['post', '/notifications/token'],
    ['delete', '/notifications/token'],
    ['post', '/notifications/test'],
    ['post', `/notifications/user/${OTHER_USER_ID}`],
    ['post', '/notifications/topic/all-users'],
    ['get', '/notifications/settings'],
    ['patch', '/notifications/settings'],
  ] as const)('%s %s', (method, path) => {
    it('rejects a request with no credentials', async () => {
      const res = await (request(app) as any)[method](path).send({
        fcmToken: 'tok-1', userId: OTHER_USER_ID, title: 'x', body: 'y',
      });
      expect(res.status).toBe(401);
      expect(deviceToken.upsertToken).not.toHaveBeenCalled();
      expect(deviceToken.removeTokenForUser).not.toHaveBeenCalled();
      expect(push.sendToTokens).not.toHaveBeenCalled();
      expect(push.sendToTopic).not.toHaveBeenCalled();
    });
  });

  it('removed the open test-login and custom routes', async () => {
    signedIn();
    const a = await request(app).post('/notifications/test-login').set('Authorization', 'Bearer t').send({ userId: OTHER_USER_ID });
    const b = await request(app).post('/notifications/custom').set('Authorization', 'Bearer t').send({ subject: 's', title: 't', body: 'b' });
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
  });
});

describe('device tokens', () => {
  beforeEach(signedIn);

  it('registers the token for the signed-in user, ignoring any userId in the body', async () => {
    const res = await request(app)
      .post('/notifications/token')
      .set('Authorization', 'Bearer t')
      .send({ userId: OTHER_USER_ID, fcmToken: 'tok-abc', platform: 'android' });

    expect(res.status).toBe(200);
    expect(deviceToken.upsertToken).toHaveBeenCalledWith(USER_ID, 'tok-abc', 'android');
  });

  it('defaults the platform to web and rejects unknown platforms', async () => {
    await request(app).post('/notifications/token').set('Authorization', 'Bearer t').send({ fcmToken: 'tok-abc' });
    expect(deviceToken.upsertToken).toHaveBeenCalledWith(USER_ID, 'tok-abc', 'web');

    const res = await request(app).post('/notifications/token').set('Authorization', 'Bearer t').send({ fcmToken: 'tok-abc', platform: 'windows' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing or non-string token', async () => {
    const a = await request(app).post('/notifications/token').set('Authorization', 'Bearer t').send({});
    const b = await request(app).post('/notifications/token').set('Authorization', 'Bearer t').send({ fcmToken: { $ne: null } });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(deviceToken.upsertToken).not.toHaveBeenCalled();
  });

  it('removes a token only within the signed-in user\'s own devices', async () => {
    const res = await request(app).delete('/notifications/token').set('Authorization', 'Bearer t').send({ fcmToken: 'tok-abc' });
    expect(res.status).toBe(200);
    expect(deviceToken.removeTokenForUser).toHaveBeenCalledWith(USER_ID, 'tok-abc');
  });

  it('sends the test push only to the signed-in user, with fixed wording', async () => {
    const res = await request(app)
      .post('/notifications/test')
      .set('Authorization', 'Bearer t')
      .send({ userId: OTHER_USER_ID, title: 'Injected', body: 'Injected' });

    expect(res.status).toBe(200);
    expect(deviceToken.getTokensForUser).toHaveBeenCalledWith(USER_ID);
    const payload = (push.sendToTokens as jest.Mock).mock.calls[0][1];
    expect(payload.title).toBe('Proptriz');
    expect(JSON.stringify(payload)).not.toContain('Injected');
    expect(payload.data.url).toBe('https://proptriz.com/profile/notifications');
  });
});

describe('admin sends', () => {
  it('rejects a signed-in (non-admin) user', async () => {
    signedIn();
    const res = await request(app)
      .post(`/notifications/user/${OTHER_USER_ID}`)
      .set('Authorization', 'Bearer some-user-jwt')
      .send({ title: 'x', body: 'y' });
    expect(res.status).toBe(401);
    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it('rejects wrong admin credentials', async () => {
    const res = await request(app)
      .post('/notifications/topic/all-users')
      .set('Authorization', adminAuth('admin', 'nope'))
      .send({ title: 'x', body: 'y' });
    expect(res.status).toBe(401);
    expect(push.sendToTopic).not.toHaveBeenCalled();
  });

  it('rejects empty credentials when the admin login is not configured', async () => {
    const saved = { u: process.env.ADMIN_API_USERNAME, p: process.env.ADMIN_API_PASSWORD };
    process.env.ADMIN_API_USERNAME = '';
    process.env.ADMIN_API_PASSWORD = '';
    try {
      const res = await request(app)
        .post('/notifications/topic/all-users')
        .set('Authorization', adminAuth('', ''))
        .send({ title: 'x', body: 'y' });
      expect(res.status).toBe(401);
      expect(push.sendToTopic).not.toHaveBeenCalled();
    } finally {
      process.env.ADMIN_API_USERNAME = saved.u;
      process.env.ADMIN_API_PASSWORD = saved.p;
    }
  });

  it('lets an admin push to a user and to a topic', async () => {
    const a = await request(app)
      .post(`/notifications/user/${OTHER_USER_ID}`)
      .set('Authorization', adminAuth())
      .send({ title: 'Hello', body: 'World', data: { n: 1 } });
    expect(a.status).toBe(200);
    expect(push.sendToTokens).toHaveBeenCalledWith(['tok-1'], { title: 'Hello', body: 'World', data: { n: '1' } });

    const b = await request(app)
      .post('/notifications/topic/all-users')
      .set('Authorization', adminAuth())
      .send({ title: 'Hello', body: 'World' });
    expect(b.status).toBe(200);
    expect(push.sendToTopic).toHaveBeenCalledWith('all-users', { title: 'Hello', body: 'World' });
  });

  it('rejects a payload without title and body', async () => {
    const res = await request(app).post('/notifications/topic/all-users').set('Authorization', adminAuth()).send({ title: 'x' });
    expect(res.status).toBe(400);
  });
});

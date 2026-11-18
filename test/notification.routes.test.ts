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
jest.mock('../src/services/alertStore', () => ({
  countByTypeSince: jest.fn().mockResolvedValue(0),
  recordOpen: jest.fn(),
  listInbox: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  countUnread: jest.fn().mockResolvedValue(3),
  markRead: jest.fn().mockResolvedValue(2),
}));
jest.mock('../src/services/notification.service', () => ({
  notifyTest: jest.fn().mockResolvedValue({ status: 'created', push: 'sent', email: 'sent' }),
}));
jest.mock('../src/services/jobs.service', () => ({
  isKnownJob: (n: string) => n === 'send-held' || n === 'daily-digest',
  runJob: jest.fn().mockResolvedValue({ sent: 0 }),
  getJobStatus: jest.fn().mockResolvedValue({ healthy: true, jobs: [] }),
}));
jest.mock('../src/services/notificationSettings.service', () => ({
  getNotificationSettings: jest.fn(),
  updateNotificationSettings: jest.fn(),
  NotificationSettingsValidationError: class extends Error {},
}));

import notificationRoutes, { trackedLinkRoutes } from '../src/routes/notification.routes';
import internalRoutes from '../src/routes/internal.routes';
import * as store from '../src/services/alertStore';
import { notifyTest } from '../src/services/notification.service';
import { runJob } from '../src/services/jobs.service';
import { decodeUserToken } from '../src/helpers/jwt';
import * as deviceToken from '../src/models/deviceToken';
import * as push from '../src/services/pushNotification.service';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const OTHER_USER_ID = '64b7f0c2a1b2c3d4e5f60999';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/notifications', notificationRoutes);
app.use('/n', trackedLinkRoutes);
app.use('/internal', internalRoutes);

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
    ['get', '/notifications'],
    ['get', '/notifications/unread-count'],
    ['post', '/notifications/read'],
    ['post', '/notifications/abc/open'],
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
    expect(deviceToken.upsertToken).toHaveBeenCalledWith(USER_ID, 'tok-abc', expect.objectContaining({ platform: 'android' }));
  });

  it('defaults the platform to web and rejects unknown platforms', async () => {
    const ok = await request(app).post('/notifications/token').set('Authorization', 'Bearer t').send({ fcmToken: 'tok-abc' });
    expect(ok.status).toBe(200);
    expect(deviceToken.upsertToken).toHaveBeenCalledWith(USER_ID, 'tok-abc', expect.objectContaining({ platform: undefined }));

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

  it('sends the test alert only to the signed-in user, ignoring body wording', async () => {
    const res = await request(app)
      .post('/notifications/test')
      .set('Authorization', 'Bearer t')
      .send({ userId: OTHER_USER_ID, title: 'Injected', body: 'Injected' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inbox: true, push: 'sent', email: 'sent' });
    expect((notifyTest as jest.Mock).mock.calls[0][0]).toBe(USER_ID);
    expect(JSON.stringify((notifyTest as jest.Mock).mock.calls)).not.toContain('Injected');
  });

  it('limits test alerts to 3 an hour', async () => {
    (store.countByTypeSince as jest.Mock).mockResolvedValueOnce(3);
    const res = await request(app).post('/notifications/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(429);
    expect(notifyTest).not.toHaveBeenCalled();
  });
});

describe('inbox', () => {
  beforeEach(signedIn);

  it('returns the unread count for the signed-in user', async () => {
    const res = await request(app).get('/notifications/unread-count').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(3);
    expect(store.countUnread).toHaveBeenCalledWith(USER_ID);
  });

  it('caps the page size at 50', async () => {
    await request(app).get('/notifications?limit=500').set('Authorization', 'Bearer t');
    const args = (store.listInbox as jest.Mock).mock.calls[0];
    expect(JSON.stringify(args)).toContain('50');
    expect(JSON.stringify(args)).not.toContain('500');
  });

  it('marks all read, and rejects an empty body', async () => {
    const ok = await request(app).post('/notifications/read').set('Authorization', 'Bearer t').send({ all: true });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/notifications/read').set('Authorization', 'Bearer t').send({});
    expect(bad.status).toBe(400);
  });
});

describe('tracked links', () => {
  it('records the open and redirects to the stored url without auth', async () => {
    (store.recordOpen as jest.Mock).mockResolvedValueOnce({ url: 'https://proptriz.com/listing/1' });
    const res = await request(app).get('/n/64b7f0c2a1b2c3d4e5f60aaa?c=email');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://proptriz.com/listing/1');
    expect((store.recordOpen as jest.Mock).mock.calls[0][1]).toBe('email');
  });

  it('never redirects to a url from the query string', async () => {
    (store.recordOpen as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app).get('/n/64b7f0c2a1b2c3d4e5f60aaa?url=https://evil.example');
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toContain('evil');
  });

  it('returns json for the web app route', async () => {
    (store.recordOpen as jest.Mock).mockResolvedValueOnce({ url: 'https://proptriz.com/listing/1' });
    const res = await request(app).get('/n/64b7f0c2a1b2c3d4e5f60aaa?format=json&c=push');
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://proptriz.com/listing/1');
  });
});

describe('scheduler endpoints', () => {
  it('rejects a call without the job secret', async () => {
    const res = await request(app).post('/internal/jobs/send-held');
    expect(res.status).toBe(401);
    expect(runJob).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const res = await request(app).post('/internal/jobs/send-held').set('x-job-secret', 'nope');
    expect(res.status).toBe(401);
  });

  it('runs a known job with the secret, as header or Bearer', async () => {
    const a = await request(app).post('/internal/jobs/send-held').set('x-job-secret', 'job-secret');
    const b = await request(app).post('/internal/jobs/daily-digest').set('Authorization', 'Bearer job-secret');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(runJob).toHaveBeenCalledTimes(2);
  });

  it('404s an unknown job', async () => {
    const res = await request(app).post('/internal/jobs/drop-tables').set('x-job-secret', 'job-secret');
    expect(res.status).toBe(404);
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

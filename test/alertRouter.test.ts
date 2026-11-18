jest.mock('../src/services/alertStore');
jest.mock('../src/models/deviceToken', () => ({
  getTokensForUser: jest.fn(),
  pruneStaleTokens: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/pushNotification.service', () => ({ sendToTokens: jest.fn() }));
jest.mock('../src/services/email.service', () => ({
  emailSingleAlert: jest.fn().mockResolvedValue(undefined),
  emailDigest: jest.fn().mockResolvedValue(undefined),
}));

import * as store from '../src/services/alertStore';
import { getTokensForUser, pruneStaleTokens } from '../src/models/deviceToken';
import { sendToTokens } from '../src/services/pushNotification.service';
import { emailDigest, emailSingleAlert } from '../src/services/email.service';
import {
  DAILY_INSTANT_CAP, decideDigestStatus, decidePush, routeAlert, sendDailyDigests, sendHeldPushes,
} from '../src/services/alertRouter.service';

const mocked = store as jest.Mocked<typeof store>;
const USER = '64b7f0c2a1b2c3d4e5f60718';
const NOTIFICATION_ID = '64b7f0c2a1b2c3d4e5f6aaaa';
const LISTING = '64b7f0c2a1b2c3d4e5f6bbbb';

const NOON = new Date('2026-11-16T11:00:00Z');      // 12:00 in Lagos
const NIGHT = new Date('2026-11-16T22:00:00Z');     // 23:00 in Lagos

const baseSettings = {
  emailEnabled: false, email: null as string | null, whatsappEnabled: false, whatsappNumber: null,
  pushEnabled: false, timezone: 'Africa/Lagos', language: 'en' as const,
  quietHours: { enabled: true, start: '21:00', end: '07:00' }, digestHour: 8,
  types: { new_listing: true, listing_change: true, enquiry: true, expiring: true, review: true, agent_report: true, demand: true },
  updatedAt: new Date(),
};
const settings = (over: Partial<typeof baseSettings> = {}) => ({ ...baseSettings, ...over });

const stored = (over: Partial<store.StoredNotification> = {}): store.StoredNotification => ({
  id: NOTIFICATION_ID, userId: USER, type: 'new_listing', title: 'New listing for you', body: '2-bed flat',
  url: `https://proptriz.com/property/details/${LISTING}`, propertyId: LISTING,
  pushStatus: 'off', emailStatus: 'none', createdAt: NOON, ...over,
});

const request = (over = {}) => ({
  userId: USER,
  type: 'new_listing' as const,
  propertyId: LISTING,
  url: `https://proptriz.com/property/details/${LISTING}`,
  content: (locale: string) => ({ title: locale === 'fr' ? 'Nouvelle annonce pour vous' : 'New listing for you', body: '2-bed flat' }),
  ...over,
});

beforeEach(() => {
  mocked.loadSettings.mockResolvedValue(settings());
  mocked.insertNotification.mockResolvedValue(stored());
  mocked.countPushesSince.mockResolvedValue(0);
  mocked.setPushResult.mockResolvedValue(undefined);
  mocked.setEmailResult.mockResolvedValue(undefined);
  (getTokensForUser as jest.Mock).mockResolvedValue(['tok-1']);
  (sendToTokens as jest.Mock).mockResolvedValue({ successCount: 1, failureCount: 0, failedTokens: [] });
});

describe('decidePush', () => {
  const s = settings({ pushEnabled: true });
  it('skips when push is off or there is no live device', () => {
    expect(decidePush({ settings: settings(), liveDevices: 2, sentToday: 0, now: NOON })).toEqual({ action: 'skip', status: 'off' });
    expect(decidePush({ settings: s, liveDevices: 0, sentToday: 0, now: NOON })).toEqual({ action: 'skip', status: 'no_device' });
  });
  it('caps instant alerts per day', () => {
    expect(decidePush({ settings: s, liveDevices: 1, sentToday: DAILY_INSTANT_CAP - 1, now: NOON })).toEqual({ action: 'send' });
    expect(decidePush({ settings: s, liveDevices: 1, sentToday: DAILY_INSTANT_CAP, now: NOON })).toEqual({ action: 'skip', status: 'capped' });
  });
  it('holds during quiet hours until they end, and never drops', () => {
    expect(decidePush({ settings: s, liveDevices: 1, sentToday: 0, now: NIGHT })).toEqual({
      action: 'hold', holdUntil: new Date('2026-11-17T06:00:00.000Z'),
    });
  });
  it('sends at night when quiet hours are off, or when the person asked for it', () => {
    const noQuiet = settings({ pushEnabled: true, quietHours: { enabled: false, start: '21:00', end: '07:00' } });
    expect(decidePush({ settings: noQuiet, liveDevices: 1, sentToday: 0, now: NIGHT })).toEqual({ action: 'send' });
    expect(decidePush({ settings: s, liveDevices: 1, sentToday: 99, now: NIGHT, immediate: true })).toEqual({ action: 'send' });
  });
});

describe('decideDigestStatus', () => {
  it('uses email as the fallback', () => {
    expect(decideDigestStatus(false, 'no_device')).toBe('none');
    expect(decideDigestStatus(true, 'no_device')).toBe('pending');
    expect(decideDigestStatus(true, 'off')).toBe('pending');
    expect(decideDigestStatus(true, 'capped')).toBe('pending');
    expect(decideDigestStatus(true, 'failed')).toBe('pending');
    expect(decideDigestStatus(true, 'sent')).toBe('after_24h');
    expect(decideDigestStatus(true, 'held')).toBe('after_24h');
  });
});

describe('routeAlert', () => {
  it('always writes the inbox item, even with every channel off', async () => {
    const outcome = await routeAlert(request(), NOON);
    expect(mocked.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER, type: 'new_listing', dedupeKey: `new_listing:${LISTING}`, title: 'New listing for you',
    }));
    expect(outcome).toEqual({ status: 'created', notificationId: NOTIFICATION_ID, push: 'off', email: 'none' });
    expect(sendToTokens).not.toHaveBeenCalled();
  });

  it('writes the alert in the person\'s language', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ language: 'fr' as any }));
    await routeAlert(request(), NOON);
    expect(mocked.insertNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouvelle annonce pour vous' }));
  });

  it('creates nothing when the person switched this alert type off', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ types: { ...baseSettings.types, new_listing: false } }));
    expect(await routeAlert(request(), NOON)).toEqual({ status: 'disabled' });
    expect(mocked.insertNotification).not.toHaveBeenCalled();
  });

  it('alerts a person once per listing and type', async () => {
    mocked.insertNotification.mockResolvedValue(null);
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true }));
    expect(await routeAlert(request(), NOON)).toEqual({ status: 'duplicate' });
    expect(sendToTokens).not.toHaveBeenCalled();
  });

  it('pushes with a tracked link and queues the digest only as a 24-hour fallback', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true, emailEnabled: true, email: 'ada@example.com' }));
    (sendToTokens as jest.Mock).mockResolvedValue({ successCount: 1, failureCount: 1, failedTokens: ['dead'] });
    (getTokensForUser as jest.Mock).mockResolvedValue(['tok-1', 'dead']);

    const outcome = await routeAlert(request(), NOON);

    const [tokens, payload] = (sendToTokens as jest.Mock).mock.calls[0];
    expect(tokens).toEqual(['tok-1', 'dead']);
    expect(payload.data.url).toBe(`https://proptriz.com/n/${NOTIFICATION_ID}?c=push`);
    expect(payload.data.listingId).toBe(LISTING);
    expect(pruneStaleTokens).toHaveBeenCalledWith(['dead']);
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'sent', expect.any(Object));
    expect(mocked.setEmailResult).toHaveBeenCalledWith([NOTIFICATION_ID], 'after_24h');
    expect(outcome).toMatchObject({ push: 'sent', email: 'after_24h' });
  });

  it('holds the push during quiet hours', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true }));
    const outcome = await routeAlert(request(), NIGHT);
    expect(sendToTokens).not.toHaveBeenCalled();
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'held', { holdUntil: new Date('2026-11-17T06:00:00.000Z') });
    expect(outcome.push).toBe('held');
  });

  it('sends alerts beyond the daily cap to the digest instead', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true, emailEnabled: true, email: 'ada@example.com' }));
    mocked.countPushesSince.mockResolvedValue(DAILY_INSTANT_CAP);
    const outcome = await routeAlert(request(), NOON);
    expect(sendToTokens).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ push: 'capped', email: 'pending' });
  });

  it('goes straight to the next digest when there is no push device (e.g. the Pi Browser)', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true, emailEnabled: true, email: 'ada@example.com' }));
    (getTokensForUser as jest.Mock).mockResolvedValue([]);
    expect(await routeAlert(request(), NOON)).toMatchObject({ push: 'no_device', email: 'pending' });
  });

  it('keeps the inbox item when the push provider fails', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ pushEnabled: true }));
    (sendToTokens as jest.Mock).mockRejectedValue(new Error('FCM down'));
    const outcome = await routeAlert(request(), NOON);
    expect(outcome).toMatchObject({ status: 'created', push: 'failed' });
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'failed', { error: 'FCM down' });
  });

  it('emails straight away when asked, with a tracked link', async () => {
    mocked.loadSettings.mockResolvedValue(settings({ emailEnabled: true, email: 'ada@example.com' }));
    const outcome = await routeAlert(request({ email: 'now' }), NOON);
    expect(emailSingleAlert).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com', url: `https://proptriz.com/n/${NOTIFICATION_ID}?c=email`,
    }));
    expect(outcome.email).toBe('sent');
  });

  it('refuses links that leave the public site, and alerts with no key', async () => {
    await expect(routeAlert(request({ url: 'https://evil.example/phish' }), NOON)).rejects.toThrow('public site');
    await expect(routeAlert(request({ url: 'javascript:alert(1)' }), NOON)).rejects.toThrow('public site');
    await expect(routeAlert(request({ propertyId: undefined }), NOON)).rejects.toThrow('dedupeKey');
    expect(mocked.insertNotification).not.toHaveBeenCalled();
  });
});

describe('sendHeldPushes', () => {
  it('sends held pushes whose quiet hours have ended', async () => {
    mocked.findHeldPushesDue.mockResolvedValue([stored({ pushStatus: 'held', emailStatus: 'after_24h' })]);
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ pushEnabled: true })]]));
    expect(await sendHeldPushes(NOON)).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'sent', expect.any(Object));
  });

  it('skips a held push the person already saw in the inbox', async () => {
    mocked.findHeldPushesDue.mockResolvedValue([stored({ pushStatus: 'held', readAt: NOON })]);
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ pushEnabled: true })]]));
    expect(await sendHeldPushes(NOON)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendToTokens).not.toHaveBeenCalled();
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'skipped');
  });

  it('moves the alert to the next digest when the device has gone', async () => {
    mocked.findHeldPushesDue.mockResolvedValue([stored({ pushStatus: 'held', emailStatus: 'after_24h' })]);
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ pushEnabled: true })]]));
    (getTokensForUser as jest.Mock).mockResolvedValue([]);
    await sendHeldPushes(NOON);
    expect(mocked.setPushResult).toHaveBeenCalledWith(NOTIFICATION_ID, 'no_device');
    expect(mocked.setEmailResult).toHaveBeenCalledWith([NOTIFICATION_ID], 'pending');
  });
});

describe('sendDailyDigests', () => {
  const EIGHT_LAGOS = new Date('2026-11-16T07:05:00Z'); // 08:05 in Lagos

  beforeEach(() => {
    mocked.findUsersWithDigestItems.mockResolvedValue([USER]);
    mocked.findDigestItems.mockResolvedValue([
      stored({ id: 'a1', emailStatus: 'pending' }),
      stored({ id: 'a2', emailStatus: 'pending' }),
    ]);
  });

  it('emails one digest at the person\'s digest hour, in their language, and marks the items sent', async () => {
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ emailEnabled: true, email: 'ada@example.com', language: 'sw' as any })]]));
    const counts = await sendDailyDigests(EIGHT_LAGOS);

    expect(counts).toMatchObject({ waiting: 1, sent: 1 });
    expect(emailDigest).toHaveBeenCalledTimes(1);
    const digest = (emailDigest as jest.Mock).mock.calls[0][0];
    expect(digest).toMatchObject({ to: 'ada@example.com', locale: 'sw', totalCount: 2 });
    expect(digest.items[0].url).toBe('https://proptriz.com/n/a1?c=email');
    expect(mocked.setEmailResult).toHaveBeenCalledWith(['a1', 'a2'], 'sent', expect.any(Object));
  });

  it('waits when it is not the person\'s digest hour', async () => {
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ emailEnabled: true, email: 'ada@example.com' })]]));
    expect(await sendDailyDigests(NOON)).toMatchObject({ sent: 0, notDue: 1 });
    expect(emailDigest).not.toHaveBeenCalled();
    expect(mocked.setEmailResult).not.toHaveBeenCalled();
  });

  it('respects the time zone: 08:00 in Nairobi is 05:00 UTC', async () => {
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ emailEnabled: true, email: 'a@b.co', timezone: 'Africa/Nairobi' })]]));
    expect(await sendDailyDigests(EIGHT_LAGOS)).toMatchObject({ sent: 0, notDue: 1 });
    expect(await sendDailyDigests(new Date('2026-11-16T05:10:00Z'))).toMatchObject({ sent: 1 });
  });

  it('drops queued items when email has been switched off', async () => {
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings()]]));
    expect(await sendDailyDigests(EIGHT_LAGOS)).toMatchObject({ sent: 0, noEmail: 1 });
    expect(emailDigest).not.toHaveBeenCalled();
    expect(mocked.setEmailResult).toHaveBeenCalledWith(['a1', 'a2'], 'none');
  });

  it('leaves items queued when the email fails, so the next run retries', async () => {
    mocked.loadSettingsForUsers.mockResolvedValue(new Map([[USER, settings({ emailEnabled: true, email: 'ada@example.com' })]]));
    (emailDigest as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    expect(await sendDailyDigests(EIGHT_LAGOS)).toMatchObject({ sent: 0, failed: 1 });
    expect(mocked.setEmailResult).not.toHaveBeenCalled();
  });
});

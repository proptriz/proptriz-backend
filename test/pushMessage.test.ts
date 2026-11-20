import { buildTokenMessage, isDeadTokenError } from '../src/services/pushNotification.service';

describe('buildTokenMessage', () => {
  const payload = {
    title: 'New listing',
    body: '3 bed in Lekki',
    imageUrl: 'https://proptriz.com/a.png',
    data: { url: 'https://proptriz.com/n/abc?c=push', type: 'new_listing' },
  };

  it('is data-only so the service worker and page show it the same way', () => {
    const msg = buildTokenMessage('tok-1', payload) as any;
    expect(msg.token).toBe('tok-1');
    expect(msg.notification).toBeUndefined();
    expect(msg.data).toEqual({
      url: 'https://proptriz.com/n/abc?c=push',
      type: 'new_listing',
      title: 'New listing',
      body: '3 bed in Lekki',
      imageUrl: 'https://proptriz.com/a.png',
    });
  });

  it('keeps every data value a string, as FCM requires', () => {
    const msg = buildTokenMessage('t', { title: 'a', body: 'b', data: { n: '1' } }) as any;
    expect(Object.values(msg.data).every((v) => typeof v === 'string')).toBe(true);
    expect(msg.data.imageUrl).toBeUndefined();
  });

  it('asks the push service to deliver promptly', () => {
    const msg = buildTokenMessage('t', { title: 'a', body: 'b' }) as any;
    expect(msg.webpush.headers.Urgency).toBe('high');
  });
});

describe('isDeadTokenError', () => {
  it('flags tokens Firebase says are gone or from another project', () => {
    expect(isDeadTokenError({ code: 'messaging/registration-token-not-registered' })).toBe(true);
    expect(isDeadTokenError({ code: 'messaging/invalid-registration-token' })).toBe(true);
    expect(isDeadTokenError({ code: 'messaging/mismatched-credential', message: 'SenderId mismatch' })).toBe(true);
  });

  it('flags a subscription the browser push service refuses (old key)', () => {
    expect(isDeadTokenError({
      code: 'messaging/unknown-error',
      message: 'Permission denied by the third party webpush service. Raw server response: THIRD_PARTY_PERMISSION_DENIED',
    })).toBe(true);
  });

  it('keeps tokens on errors that may pass', () => {
    expect(isDeadTokenError({ code: 'messaging/server-unavailable' })).toBe(false);
    expect(isDeadTokenError({ code: 'messaging/internal-error', message: 'try later' })).toBe(false);
    expect(isDeadTokenError(undefined)).toBe(false);
  });
});

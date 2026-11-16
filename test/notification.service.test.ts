jest.mock('../src/services/notificationSettings.service', () => ({ getNotificationSettings: jest.fn() }));
jest.mock('../src/models/deviceToken', () => ({
  getTokensForUser: jest.fn().mockResolvedValue(['tok-1', 'tok-2']),
  pruneStaleTokens: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/pushNotification.service', () => ({ pushToTokens: jest.fn().mockResolvedValue(['tok-2']) }));
jest.mock('../src/services/email.service', () => ({
  emailNewListing: jest.fn().mockResolvedValue(undefined),
  emailListingEnquiry: jest.fn().mockResolvedValue(undefined),
  emailListingExpiring: jest.fn().mockResolvedValue(undefined),
  emailWelcome: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/whatsapp.service', () => ({
  isWhatsappEnabled: jest.fn().mockReturnValue(false),
  whatsappNewListing: jest.fn().mockResolvedValue(undefined),
  whatsappListingEnquiry: jest.fn().mockResolvedValue(undefined),
  whatsappListingExpiring: jest.fn().mockResolvedValue(undefined),
}));

import { notifyNewListing, resolveNotificationContact } from '../src/services/notification.service';
import { getNotificationSettings } from '../src/services/notificationSettings.service';
import { getTokensForUser, pruneStaleTokens } from '../src/models/deviceToken';
import { pushToTokens } from '../src/services/pushNotification.service';
import { emailNewListing } from '../src/services/email.service';
import { isWhatsappEnabled, whatsappNewListing } from '../src/services/whatsapp.service';

const settings = (over: Record<string, unknown>) =>
  (getNotificationSettings as jest.Mock).mockResolvedValue({
    emailEnabled: false, email: null, whatsappEnabled: false, whatsappNumber: null, pushEnabled: false, ...over,
  });

const listing = { id: 'abc123', title: '2-bed flat', priceText: '₦1,200,000 / year', locationText: 'Tanke, Ilorin' };

describe('resolveNotificationContact', () => {
  it('loads push tokens when push is on, even with email off', async () => {
    settings({ pushEnabled: true });
    const contact = await resolveNotificationContact('u1', 'Ada');
    expect(getTokensForUser).toHaveBeenCalledWith('u1');
    expect(contact).toEqual({ username: 'Ada', email: undefined, phone: undefined, fcmTokens: ['tok-1', 'tok-2'] });
  });

  it('does not load push tokens when push is off, even with email on', async () => {
    settings({ emailEnabled: true, email: 'ada@example.com' });
    const contact = await resolveNotificationContact('u1', 'Ada');
    expect(getTokensForUser).not.toHaveBeenCalled();
    expect(contact?.fcmTokens).toBeUndefined();
    expect(contact?.email).toBe('ada@example.com');
  });
});

describe('notifyNewListing', () => {
  it('sends email and push, links to proptriz.com, and prunes stale tokens', async () => {
    settings({ emailEnabled: true, email: 'ada@example.com', pushEnabled: true });
    await notifyNewListing('u1', 'Ada', { listing, locale: 'fr' });

    expect(emailNewListing).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', locale: 'fr' }));
    const [tokens, payload] = (pushToTokens as jest.Mock).mock.calls[0];
    expect(tokens).toEqual(['tok-1', 'tok-2']);
    expect(payload.title).toBe('Nouvelle annonce pour vous');
    expect(payload.data.url).toBe('https://proptriz.com/property/details/abc123');
    expect(pruneStaleTokens).toHaveBeenCalledWith(['tok-2']);
  });

  it('never sends WhatsApp unless it is switched on', async () => {
    settings({ whatsappEnabled: true, whatsappNumber: '+2348012345678' });
    await notifyNewListing('u1', 'Ada', { listing });
    expect(whatsappNewListing).not.toHaveBeenCalled();

    (isWhatsappEnabled as jest.Mock).mockReturnValue(true);
    await notifyNewListing('u1', 'Ada', { listing });
    expect(whatsappNewListing).toHaveBeenCalledTimes(1);
  });
});

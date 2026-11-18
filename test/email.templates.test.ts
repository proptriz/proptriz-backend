const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail }) } }));

process.env.SMTP_HOST = 'smtp.test';
process.env.SMTP_USER = 'user';
process.env.SMTP_PASS = 'pass';
process.env.EMAIL_FROM_ADDRESS = 'alerts@proptriz.com';

import { emailListingEnquiry, emailListingExpiring, emailNewListing, emailWelcome } from '../src/services/email.service';
import { alertCopy } from '../src/services/notificationCopy';

const listing = { id: 'abc123', title: '2-bed flat', priceText: '₦1,200,000 / year', locationText: 'Tanke, Ilorin' };

describe('listing email templates', () => {
  it('builds a Proptriz new-listing email with an https link and no OnSwap wording', async () => {
    await emailNewListing({ to: 'ada@example.com', username: 'Ada', listing, searchName: 'Ilorin flats' });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('New listing: 2-bed flat');
    expect(mail.html).toContain('https://proptriz.com/property/details/abc123');
    expect(mail.html).toContain('https://proptriz.com/profile/notifications');
    expect(mail.html).toContain('Ilorin flats');
    expect(mail.html).not.toMatch(/onswap|Pi Browser|P2P/i);
  });

  it('escapes user-supplied text', async () => {
    await emailListingEnquiry({
      to: 'agent@example.com', username: '<b>Agent</b>', enquirerName: '<script>alert(1)</script>',
      listing: { ...listing, title: '"><img src=x onerror=alert(1)>', imageUrl: 'javascript:alert(1)' },
    });
    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Agent</b>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('javascript:');
  });

  it.each(['en', 'fr', 'sw'] as const)('renders every template in %s', async (locale) => {
    await emailNewListing({ to: 'a@b.co', username: 'Ada', listing, locale });
    await emailListingEnquiry({ to: 'a@b.co', username: 'Ada', listing, enquirerName: 'Bola', locale });
    await emailListingExpiring({ to: 'a@b.co', username: 'Ada', listing, daysLeft: 3, locale });
    await emailWelcome({ to: 'a@b.co', username: 'Ada', locale });

    expect(sendMail).toHaveBeenCalledTimes(4);
    const copy = alertCopy(locale);
    expect(sendMail.mock.calls[0][0].html).toContain(copy.newListing.heading);
    expect(sendMail.mock.calls[2][0].subject).toBe(copy.expiring.subject(listing, 3));
    for (const [mail] of sendMail.mock.calls) {
      expect(mail.html).toContain(`<html lang="${locale}">`);
      expect(mail.html).not.toContain('undefined');
    }
  });
});

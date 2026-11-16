// src/services/whatsapp.service.ts
// Meta WhatsApp Cloud API: one approved template per listing alert.
//
// WhatsApp is paid per message, so it is OFF unless WHATSAPP_ENABLED=true and
// the credentials are set. It is not part of the first alerts release.
//
// Templates to create in Meta Business Manager → Message Templates
// (category Utility; one translation each for en, fr and sw):
//   new_listing_alert  → "New on Proptriz: {{1}} at {{2}}, {{3}}. View it: {{4}}"
//   listing_enquiry    → "{{1}} is interested in your Proptriz listing {{2}}. View it: {{3}}"
//   listing_expiring   → "Your Proptriz listing {{1}} expires in {{2}} day(s). Renew it: {{3}}"

import axios from 'axios';
import logger from '../config/loggingConfig';
import { AlertLocale, ListingSummary, editListingUrl, listingUrl } from './notificationCopy';

const GRAPH_API_VERSION = 'v25.0';

const TEMPLATE_LANGUAGE: Record<AlertLocale, string> = { en: 'en', fr: 'fr', sw: 'sw' };

export function isWhatsappEnabled(): boolean {
  return (
    process.env.WHATSAPP_ENABLED === 'true' &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
    !!process.env.WHATSAPP_ACCESS_TOKEN
  );
}

/** Last four digits only: phone numbers never go to the logs in full. */
function maskPhone(phone: string): string {
  return `…${phone.slice(-4)}`;
}

async function sendTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  locale: AlertLocale = 'en',
): Promise<string> {
  if (!isWhatsappEnabled()) {
    throw new Error('WhatsApp is not enabled');
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const recipient = to.replace(/^\+/, ''); // the Cloud API expects the number without "+"

  try {
    const res = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: TEMPLATE_LANGUAGE[locale] },
        components: [{
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text })),
        }],
      },
    }, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 10_000,
    });

    const messageId = res.data?.messages?.[0]?.id ?? 'unknown';
    logger.info(`[WhatsApp] Sent ${templateName} to ${maskPhone(recipient)}: ${messageId}`);
    return messageId;
  } catch (err: any) {
    // Log Meta's error body, but never the request (it carries the access token).
    logger.error(`[WhatsApp] ${templateName} to ${maskPhone(recipient)} failed`, {
      status: err.response?.status,
      error: err.response?.data?.error,
    });
    throw new Error(`Failed to send WhatsApp template (${templateName}): ${err.message}`);
  }
}

/** A new listing matches what the person is looking for. */
export async function whatsappNewListing(opts: {
  phone: string; listing: ListingSummary; locale?: AlertLocale;
}): Promise<void> {
  const { listing } = opts;
  await sendTemplate(
    opts.phone,
    'new_listing_alert',
    [listing.title, listing.priceText, listing.locationText ?? '-', listingUrl(listing.id)],
    opts.locale,
  );
}

/** Sent to the agent/owner when someone asks for the contact on their listing. */
export async function whatsappListingEnquiry(opts: {
  phone: string; listing: ListingSummary; enquirerName: string; locale?: AlertLocale;
}): Promise<void> {
  await sendTemplate(
    opts.phone,
    'listing_enquiry',
    [opts.enquirerName, opts.listing.title, listingUrl(opts.listing.id)],
    opts.locale,
  );
}

/** Sent to the agent/owner shortly before a listing expires. */
export async function whatsappListingExpiring(opts: {
  phone: string; listing: ListingSummary; daysLeft: number; locale?: AlertLocale;
}): Promise<void> {
  await sendTemplate(
    opts.phone,
    'listing_expiring',
    [opts.listing.title, String(opts.daysLeft), editListingUrl(opts.listing.id)],
    opts.locale,
  );
}

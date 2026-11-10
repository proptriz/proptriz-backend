// src/services/whatsapp.service.ts
// Meta WhatsApp Cloud API — dedicated template message per order lifecycle flow

import axios from 'axios';
import logger from '../config/loggingConfig';

const WA_API_URL = `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WA_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN!;

interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: { type: 'text'; text: string }[];
}

async function sendTemplate(to: string, templateName: string, bodyParams: string[]): Promise<string> {
  console.log({
    WA_API_URL,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  });
  try {
    const res = await axios.post(WA_API_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text })),
        } as TemplateComponent],
      },
    }, {
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    });

    const messageId = res.data?.messages?.[0]?.id ?? 'unknown';
    logger.info(`[WhatsApp] Sent (${templateName}):`, messageId);
    return messageId;
  } catch (err: any) {
    console.error("Status:", err.response?.status);
    console.error("Data:", JSON.stringify(err.response?.data, null, 2));
    console.error("URL:", err.config?.url);
    return Promise.reject(new Error(`Failed to send WhatsApp template (${templateName}): ${err.message}`));
  }
}

function shortId(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// Order lifecycle messages — each maps to an approved Meta template
// ═══════════════════════════════════════════════════════════════════════════
// Create these exact templates in Meta Business Manager → Message Templates:
//   new_order           → "New order #{{1}} from {{2}} for {{3}} Pi on OnSwap."
//   payment_marked_paid → "{{1}} marked order #{{2}} as paid ({{3}} Pi). Please verify and release."
//   pi_released         → "You received {{1}} Pi on OnSwap. Order #{{2}} complete 🎉"
//   order_cancelled     → "Order #{{1}} ({{2}} Pi) was cancelled."
//   order_disputed      → "A dispute was opened on order #{{1}} ({{2}} Pi). Reason: {{3}}"

/** New order placed — sent to the counterparty (ad owner) */
export async function whatsappNewOrder(opts: {
  phone: string; orderId: string; counterpartyName: string; piAmount: string;
}): Promise<void> {
  logger.info('Sending WhatsApp new order notification', { opts });
  await sendTemplate(opts.phone, 'new_order', [shortId(opts.orderId), opts.counterpartyName, opts.piAmount]);
}

/** Buyer marked payment as sent — sent to the seller */
export async function whatsappPaymentMarkedPaid(opts: {
  phone: string; orderId: string; buyerName: string; piAmount: string;
}): Promise<void> {
  // remove the + from the phone number for WhatsApp API
  opts.phone = opts.phone.replace(/^\+/, '');
  console.log('Sending WhatsApp payment marked paid notification', { opts });
  await sendTemplate(opts.phone, 'jaspers_market_order_confirmation_v1', [opts.buyerName, shortId(opts.orderId), opts.piAmount]);
}

/** Pi released on-chain — sent to the buyer */
export async function whatsappPiReleased(opts: {
  phone: string; orderId: string; piAmount: string;
}): Promise<void> {
  logger.info('Sending WhatsApp pi released notification', { opts });
  await sendTemplate(opts.phone, 'hello_world', [opts.piAmount, shortId(opts.orderId)]);
}

/** Order cancelled — sent to either party */
export async function whatsappOrderCancelled(opts: {
  phone: string; orderId: string; piAmount: string;
}): Promise<void> {
  logger.info('Sending WhatsApp order cancelled notification', { opts });
  await sendTemplate(opts.phone, 'order_cancelled', [shortId(opts.orderId), opts.piAmount]);
}

/** Dispute raised — sent to the other party */
export async function whatsappOrderDisputed(opts: {
  phone: string; orderId: string; piAmount: string; reason: string;
}): Promise<void> {
  logger.info('Sending WhatsApp order disputed notification', { opts });
  await sendTemplate(opts.phone, 'order_disputed', [shortId(opts.orderId), opts.piAmount, opts.reason]);
}

/** Welcome message for new users */
export async function whatsappWelcome(opts: { phone: string; username: string }): Promise<void> {
  logger.info('Sending WhatsApp welcome message', { opts });
  await sendTemplate(opts.phone, 'welcome_user', [opts.username]);
}

// curl -i -X POST `
//      https://graph.facebook.com/v25.0/1226073813916507/messages `
//      -H 'Authorization: Bearer EAAjnyvFm9MoBR1L9SrbvFLAeBZBbZALqhS87bW3ltbiwaw8t61F0FxxZCPiUYPrWBL32ZBzM1YlzzQ1ltry4GBPAI6b2QJInyItLUzz6wvr1z1Fq6u8rDQmE09liZC5RlfLrxiYSdk6O7j103dZCBei16fGJB3cdltu0lqNLwRrkk8Avx454UtkZCsjJY1CYAUxeEf4thP83jIOLcAvzeUawHqFJOP3ApWW6Wb7WZAG0uyPDp4pxDBKv6TalUNd2srhj7Td9zFK78ZA3c94BZBsDlXSZAay' `
//      -H 'Content-Type: application/json' `
//      -d '{ \"messaging_product\": \"whatsapp\",
//      \"to\": \"2348104822394\",
//      \"type\": \"template\",
//      \"template\": { \"name\": \"jaspers_market_plain_text_v1\",
//      \"language\": { \"code\": \"en_US\" } } }'
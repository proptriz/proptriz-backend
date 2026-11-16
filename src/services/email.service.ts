// src/services/email.service.ts
// Nodemailer email service — works with Resend, SendGrid SMTP, or Gmail

import nodemailer, { Transporter } from 'nodemailer';
import logger from '../config/loggingConfig';
import {
  AlertLocale, ListingSummary, alertCopy, alertSettingsUrl, appUrl, editListingUrl, listingUrl,
} from './notificationCopy';

// ─── Transporter singleton ───────────────────────────────────────────────────

let transporter: Transporter;

export function initEmail(): void {
  if (transporter) return;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_FROM_ADDRESS) {
    throw new Error('Email is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS / EMAIL_FROM_ADDRESS)');
  }

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST!,    // e.g. smtp.resend.com
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER!,   // e.g. resend: "resend"
      pass: process.env.SMTP_PASS!,   // API key or password
    },
    tls: {
      // Bypasses the self-signed cert error if SMTP_REJECT_UNAUTHORIZED is explicitly set to 'false'
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
    }
  });

  logger.info('[Email] Transporter initialized');
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to:       string | string[];
  subject:  string;
  html:     string;
  text?:    string;   // plain-text fallback
  replyTo?: string;
}

// ─── Core sender ─────────────────────────────────────────────────────────────

export async function sendEmail(opts: EmailOptions): Promise<string> {
  if (!transporter) initEmail();

  const info = await transporter.sendMail({
    from:    `"${process.env.EMAIL_FROM_NAME ?? 'Proptriz'}" <${process.env.EMAIL_FROM_ADDRESS!}>`,
    to:      Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    replyTo: opts.replyTo,
  });

  logger.info('[Email] Sent:', info.messageId);
  return info.messageId;
}

// ─── Escaping helpers ──────────────────────────────────────────────────────────

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) links may reach an href or src attribute.
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return url;
  } catch {
    return '#';
  }
}

// ─── HTML template helper ─────────────────────────────────────────────────────
// Proptriz brand: teal #1e5f74, navy #143d4d, gold #f0a500.
// Inline styles only, since many mail clients drop <style> blocks.

const BRAND = { teal: '#1e5f74', navy: '#143d4d', gold: '#f0a500', text: '#1f2937', muted: '#6b7280', line: '#e5e7eb', page: '#f3f6f8' };
const FONT = "'DM Sans',Arial,Helvetica,sans-serif";

function emailTemplate(content: string, locale?: AlertLocale): string {
  const copy = alertCopy(locale);
  const settingsUrl = escapeHtml(alertSettingsUrl());
  return `<!DOCTYPE html>
<html lang="${locale ?? 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:${FONT};color:${BRAND.text};">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:${BRAND.navy};border-radius:16px 16px 0 0;padding:20px 28px;">
      <span style="font-family:Raleway,${FONT};font-size:22px;font-weight:900;color:#ffffff;">Prop</span><span style="font-family:Raleway,${FONT};font-size:22px;font-weight:900;color:${BRAND.gold};">triz</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${BRAND.line};border-top:none;border-radius:0 0 16px 16px;padding:28px;font-size:15px;line-height:1.55;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:20px;font-size:12px;line-height:1.5;color:${BRAND.muted};">
      ${escapeHtml(copy.footer)}<br>
      <a href="${settingsUrl}" style="color:${BRAND.teal};">${escapeHtml(copy.manageAlerts)}</a>
      &nbsp;·&nbsp; © ${new Date().getFullYear()} Proptriz
    </div>
  </div>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${BRAND.navy};">${escapeHtml(text)}</h2>`;
}

function paragraph(text: string, muted = false): string {
  return `<p style="margin:0 0 12px;color:${muted ? BRAND.muted : BRAND.text};">${escapeHtml(text)}</p>`;
}

/** Button plus the same link written out, for clients that hide buttons. */
function ctaButton(label: string, url: string, locale?: AlertLocale): string {
  const safeUrl = escapeHtml(sanitizeUrl(url));
  return `
    <p style="margin:20px 0 12px;">
      <a href="${safeUrl}" style="display:inline-block;background:${BRAND.teal};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;">${escapeHtml(label)}</a>
    </p>
    <p style="margin:0;font-size:12px;color:${BRAND.muted};word-break:break-all;">
      ${escapeHtml(alertCopy(locale).linkFallback)} <a href="${safeUrl}" style="color:${BRAND.teal};">${safeUrl}</a>
    </p>`;
}

function listingCard(listing: ListingSummary): string {
  const image = listing.imageUrl && sanitizeUrl(listing.imageUrl) !== '#'
    ? `<img src="${escapeHtml(listing.imageUrl)}" alt="" width="100%" style="display:block;width:100%;max-height:240px;object-fit:cover;border-radius:12px 12px 0 0;">`
    : '';
  const location = listing.locationText
    ? `<div style="font-size:13px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(listing.locationText)}</div>`
    : '';
  return `
    <div style="border:1px solid ${BRAND.line};border-radius:12px;margin:16px 0 4px;">
      ${image}
      <div style="padding:14px 16px;">
        <div style="font-size:16px;font-weight:bold;color:${BRAND.navy};">${escapeHtml(listing.title)}</div>
        ${location}
        <div style="font-size:18px;font-weight:bold;color:${BRAND.teal};margin-top:8px;">${escapeHtml(listing.priceText)}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Listing alerts
// ═══════════════════════════════════════════════════════════════════════════

/** A new listing matches what the person is looking for. */
export async function emailNewListing(opts: {
  to: string; username: string; listing: ListingSummary; searchName?: string; locale?: AlertLocale;
}): Promise<void> {
  const copy = alertCopy(opts.locale);
  await sendEmail({
    to: opts.to,
    subject: copy.newListing.subject(opts.listing),
    html: emailTemplate(`
      ${heading(copy.newListing.heading)}
      ${paragraph(copy.greeting(opts.username))}
      ${paragraph(copy.newListing.intro(opts.searchName))}
      ${listingCard(opts.listing)}
      ${ctaButton(copy.viewListing, listingUrl(opts.listing.id), opts.locale)}
    `, opts.locale),
  });
}

/** Sent to the agent/owner when someone asks for the contact on their listing. */
export async function emailListingEnquiry(opts: {
  to: string; username: string; listing: ListingSummary; enquirerName: string; locale?: AlertLocale;
}): Promise<void> {
  const copy = alertCopy(opts.locale);
  await sendEmail({
    to: opts.to,
    subject: copy.enquiry.subject(opts.listing),
    html: emailTemplate(`
      ${heading(copy.enquiry.heading)}
      ${paragraph(copy.greeting(opts.username))}
      ${paragraph(copy.enquiry.intro(opts.enquirerName, opts.listing))}
      ${listingCard(opts.listing)}
      ${ctaButton(copy.viewListing, listingUrl(opts.listing.id), opts.locale)}
    `, opts.locale),
  });
}

/** Sent to the agent/owner shortly before a listing expires. */
export async function emailListingExpiring(opts: {
  to: string; username: string; listing: ListingSummary; daysLeft: number; locale?: AlertLocale;
}): Promise<void> {
  const copy = alertCopy(opts.locale);
  await sendEmail({
    to: opts.to,
    subject: copy.expiring.subject(opts.listing, opts.daysLeft),
    html: emailTemplate(`
      ${heading(copy.expiring.heading)}
      ${paragraph(copy.greeting(opts.username))}
      ${paragraph(copy.expiring.intro(opts.listing, opts.daysLeft))}
      ${listingCard(opts.listing)}
      ${ctaButton(copy.expiring.cta, editListingUrl(opts.listing.id), opts.locale)}
    `, opts.locale),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Account emails
// ═══════════════════════════════════════════════════════════════════════════

/** Welcome email for new users */
export async function emailWelcome(opts: { to: string; username: string; locale?: AlertLocale }): Promise<void> {
  const copy = alertCopy(opts.locale);
  await sendEmail({
    to: opts.to,
    subject: copy.welcome.subject,
    html: emailTemplate(`
      ${heading(copy.welcome.heading)}
      ${paragraph(copy.greeting(opts.username))}
      ${paragraph(copy.welcome.intro)}
      ${ctaButton(copy.welcome.cta, appUrl('/'), opts.locale)}
    `, opts.locale),
  });
}

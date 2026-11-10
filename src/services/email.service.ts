// src/services/email.service.ts
// Nodemailer email service — works with Resend, SendGrid SMTP, or Gmail

import nodemailer, { Transporter } from 'nodemailer';
import logger from '../config/loggingConfig';

// ─── Transporter singleton ───────────────────────────────────────────────────

let transporter: Transporter;

export function initEmail(): void {
  if (transporter) return;

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

  logger.info('[Email] Transporter initialized ✓');
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

// ─── HTML template helper ─────────────────────────────────────────────────────

function emailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <style>
    body        { margin:0; padding:0; background:#0f0f0f; font-family:Arial,sans-serif; color:#e5e5e5; }
    .wrapper    { max-width:560px; margin:0 auto; padding:32px 16px; }
    .card       { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:32px; color:#e5e5e5; }
    .logo       { font-size:22px; font-weight:bold; margin-bottom:4px; }
    .tagline    { font-size:11px; font-weight:bold; color:#9a9a9a; letter-spacing:1px;
                  text-transform:uppercase; margin:0 0 24px; }
    .divider    { border:none; border-top:1px solid #2a2a2a; margin:24px 0; }
    .btn        { display:inline-block; background:#f0a03c; color:#000 !important; font-weight:bold;
                  text-decoration:none; padding:12px 28px; border-radius:10px; font-size:15px; }
    .btn-outline{ display:inline-block; background:transparent; color:#f0a03c !important; font-weight:bold;
                  text-decoration:none; padding:11px 27px; border-radius:10px; font-size:15px;
                  border:1px solid #f0a03c; margin-left:8px; }
    .muted      { color:#9a9a9a; font-size:13px; }
    .amount     { font-size:28px; font-weight:bold; color:#f0a03c; }
    .badge      { display:inline-block; font-size:12px; font-weight:bold; padding:4px 10px;
                  border-radius:999px; }
    .badge-warn { background:rgba(251,191,36,0.15); color:#fbbf24; }
    .badge-ok   { background:rgba(74,222,128,0.15); color:#4ade80; }
    .badge-bad  { background:rgba(248,113,113,0.15); color:#f87171; }
    .footer     { text-align:center; margin-top:24px; font-size:12px; color:#7a7a7a; }
    h2, p, a    { color:#e5e5e5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo">
        <span style="color:#ffffff">on</span><span style="color:#f0a03c">Swap</span>
      </div>
      <div class="tagline">African Pi Exchange</div>
      ${content}
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} OnSwap. You received this because you have an account with us.
    </div>
  </div>
</body>
</html>`;
}

function shortId(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

// ─── Pi Browser link block (replaces the old .btn CTA) ────────────────────────
function piBrowserLink(url: string, instruction: string): string {
  const safeUrl = escapeHtml(sanitizeUrl(url));
  return `
    <p class="muted" style="margin:16px 0 6px">${escapeHtml(instruction)}</p>
    <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:8px;padding:10px 14px;word-break:break-all;">
      <a href="${safeUrl}" style="color:#f0a03c;font-family:monospace;font-size:13px;text-decoration:none;">${safeUrl}</a>
    </div>
    <p class="muted" style="margin:6px 0 0;font-size:12px;">Copy the link above and open it inside Pi Browser.</p>
  `;
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

// Guards against javascript: / data: URLs being injected into href attributes —
// relevant for emailAlert's ctaUrl, which can originate from a caller-supplied body.
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return url;
  } catch {
    return '#';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Order lifecycle emails — one dedicated function per flow/recipient pair
// ═══════════════════════════════════════════════════════════════════════════

/** New order placed — sent to the counterparty (ad owner) */
export async function emailNewOrder(opts: {
  to: string; username: string; orderId: string; piAmount: string; counterpartyName: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `New order #${shortId(opts.orderId)} on OnSwap`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">New Order Received</h2>
      <p class="muted">Hi ${opts.username}, you have a new order placed against your ad.</p>
      <hr class="divider">
      <div class="amount">${opts.piAmount} Pi</div>
      <span class="badge badge-warn">Awaiting Payment</span>
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}/p2p/orders/${opts.orderId}`, 'Open this link in Pi Browser to view your order:')}
    `),
  });
}

/** Buyer marked payment as sent — sent to the seller, prompts Pi release */
export async function emailPaymentMarkedPaid(opts: {
  to: string; username: string; orderId: string; piAmount: string; buyerName: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `Action needed: confirm payment for order #${shortId(opts.orderId)}`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">Buyer Marked Payment as Sent</h2>
      <p class="muted">Hi ${opts.username}, the buyer has marked your order #${shortId(opts.orderId)} as paid.</p>
      <hr class="divider">
      <div class="amount">${opts.piAmount} Pi</div>
      <span class="badge badge-warn">Verify &amp; Release</span>
      <hr class="divider">
      <p class="muted">Please check your payment account, confirm the funds have landed, then release the Pi.</p>
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}/p2p/orders/${opts.orderId}`, 'Open this link in Pi Browser to review and release:')}
    `),
  });
}

/** Pi released on-chain — sent to the buyer */
export async function emailPiReleased(opts: {
  to: string; username: string; orderId: string; piAmount: string; txId?: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `You received ${opts.piAmount} Pi 🎉`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">Pi Released</h2>
      <p class="muted">Hi ${opts.username}, the seller has marked your order #${shortId(opts.orderId)} as released and Pi has now been sent to your wallet.</p>
      <hr class="divider">
      <div class="amount">${opts.piAmount} Pi</div>
      <span class="badge badge-ok">Completed</span>
      ${opts.txId ? `<hr class="divider"><p class="muted">Transaction ID: <code>${opts.txId}</code></p>` : ''}
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}/p2p/orders/${opts.orderId}`, 'Open this link in Pi Browser to view your order:')}
    `),
  });
}

/** Order cancelled — sent to either party */
export async function emailOrderCancelled(opts: {
  to: string; username: string; orderId: string; piAmount: string; reason?: string;
}): Promise<void> {
  const username = escapeHtml(opts.username);
  const reason = opts.reason ? escapeHtml(opts.reason) : undefined;
  await sendEmail({
    to: opts.to,
    subject: `Order #${shortId(opts.orderId)} cancelled`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">Order Cancelled</h2>
      <p class="muted">Hi ${username}, order #${shortId(opts.orderId)} for ${opts.piAmount} Pi was cancelled — please do not make any payment.</p>
      <span class="badge badge-bad">Cancelled</span>
      ${reason ? `<hr class="divider"><p class="muted">Reason: ${reason}</p>` : ''}
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}/p2p/orders/${opts.orderId}`, 'Open this link in Pi Browser to view the order:')}
    `),
  });
}

/** Dispute raised — sent to the other party */
export async function emailOrderDisputed(opts: {
  to: string; username: string; orderId: string; piAmount: string; reason: string;
}): Promise<void> {
  const username = escapeHtml(opts.username);
  const reason = escapeHtml(opts.reason);
  await sendEmail({
    to: opts.to,
    subject: `Dispute opened on order #${shortId(opts.orderId)}`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">Dispute Raised</h2>
      <p class="muted">Hi ${username}, a dispute was opened on order #${shortId(opts.orderId)} for ${opts.piAmount} Pi.</p>
      <span class="badge badge-bad">Disputed</span>
      <hr class="divider">
      <p class="muted">Reason: ${reason}</p>
      <p class="muted">Our team will review within 24 hours.</p>
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}/p2p/orders/${opts.orderId}`, 'Open this link in Pi Browser to view the order:')}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Account emails
// ═══════════════════════════════════════════════════════════════════════════

/** Welcome email for new users */
export async function emailWelcome(opts: { to: string; username: string }): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `Welcome to OnSwap, ${opts.username}!`,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">Welcome to OnSwap 🎉</h2>
      <p>Hi <strong>${opts.username}</strong>, your account is ready.</p>
      <p class="muted">OnSwap is a P2P platform for buying and selling Pi with local payment methods.</p>
      ${piBrowserLink(`${process.env.CORS_ORIGIN_URL}`, 'Open this link in Pi Browser to start trading:')}
    `),
  });
}

/** Generic fallback alert — for anything without a dedicated template */
export async function emailAlert(opts: {
  to: string; subject: string; title: string; body: string; ctaText?: string; ctaUrl?: string;
}): Promise<void> {
  const title = escapeHtml(opts.title);
  const body = escapeHtml(opts.body);
  const ctaText = opts.ctaText ? escapeHtml(opts.ctaText) : undefined;

  await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: emailTemplate(`
      <h2 style="margin:0 0 8px">${title}</h2>
      <p>${body}</p>
      ${ctaText && opts.ctaUrl ? piBrowserLink(opts.ctaUrl, `${ctaText} — open this link in Pi Browser:`) : ''}
    `),
  });
}
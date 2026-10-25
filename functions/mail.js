// Transactional email: one SMTP transport, one sender, one template, and send limits.
//
// SMTP_URL is the info@hybridprog.com mailbox on Namecheap Private Email, used as is, e.g.
// smtps://info%40hybridprog.com:PASSWORD@mail.privateemail.com:465 (firebase functions:secrets:set SMTP_URL).
// The sender must be that same mailbox, or SPF/DKIM/DMARC checks fail.
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

export const SMTP_URL = defineSecret('SMTP_URL');

export const MAIL = {
  address: 'info@hybridprog.com',
  from: '"HybridProg" <info@hybridprog.com>',
  replyTo: 'info@hybridprog.com',
  site: 'https://hybridprog.com',
};

// Running in the Functions emulator (firebase emulators:start).
export const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

let transport = null;

/**
 * Sends one email with both a plain-text and an HTML part. On failure the SMTP error is logged
 * and the caller gets a generic error, so server details never reach the user.
 * In the emulator without functions/.secret.local, the email is only logged (its link is logged too).
 */
export async function sendEmail({ to, subject, text, html }) {
  if (EMULATOR && !SMTP_URL.value()) {
    logger.info('Email not sent (no SMTP_URL in the emulator)', { to, subject });
    return;
  }
  transport ??= nodemailer.createTransport(SMTP_URL.value());
  try {
    await transport.sendMail({ from: MAIL.from, replyTo: MAIL.replyTo, to, subject, text, html });
  } catch (err) {
    logger.error('Email not sent', { subject, code: err.code, response: err.response, message: err.message });
    throw new HttpsError('unavailable', 'Could not send the email. Please try again in a few minutes.');
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * { text, html } for a short email: a heading, paragraphs, and optionally a big code or a button.
 * Text only, no images, and every link points to hybridprog.com.
 */
export function template({ heading, paragraphs, code = null, button = null, footnote = '' }) {
  const text = [
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(code ? [code, ''] : []),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    '--',
    `HybridProg · ${MAIL.site}`,
  ].join('\n');

  const p = (s) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#222">${esc(s)}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
<h1 style="margin:0 0 20px;font-size:22px;color:#111">${esc(heading)}</h1>
${paragraphs.map(p).join('\n')}
${code ? `<p style="margin:8px 0 24px;font-size:32px;font-weight:bold;letter-spacing:6px;color:#111">${esc(code)}</p>` : ''}
${button ? `<p style="margin:8px 0 24px"><a href="${esc(button.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:16px">${esc(button.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#666">Or paste this link into your browser:<br>${esc(button.url)}</p>` : ''}
${footnote ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#666">${esc(footnote)}</p>` : ''}
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#888;text-align:center">HybridProg · <a href="${MAIL.site}" style="color:#888">hybridprog.com</a></p>
</body></html>`;
  return { text, html };
}

// ---------- send limits ----------

const HOUR = 60 * 60 * 1000;
// mailLimits/{id}: no rule matches it, so only these functions read or write it.
const limitRef = (key) => getFirestore().doc(`mailLimits/${createHash('sha256').update(key).digest('hex')}`);

/**
 * Counts one send against each { key, max } (sends per hour). Returns false, counting nothing,
 * if any of them is already at its limit. Keys are hashed, so no addresses are stored.
 */
export async function underLimits(limits) {
  const now = Date.now();
  return getFirestore().runTransaction(async (tx) => {
    const refs = limits.map(({ key }) => limitRef(key));
    const docs = await Promise.all(refs.map((ref) => tx.get(ref)));
    const counts = docs.map((d) => {
      const data = d.data();
      return data && now - data.windowStart.toMillis() < HOUR ? data : { windowStart: Timestamp.fromMillis(now), sends: 0 };
    });
    if (counts.some((c, i) => c.sends >= limits[i].max)) return false;
    counts.forEach((c, i) => tx.set(refs[i], {
      windowStart: c.windowStart,
      sends: c.sends + 1,
      expiresAt: Timestamp.fromMillis(c.windowStart.toMillis() + HOUR), // for an optional TTL policy
    }));
    return true;
  });
}

/** The caller's IP address: the last X-Forwarded-For entry, which Google's front end adds. */
export function clientIp(request) {
  const forwarded = String(request.rawRequest?.headers?.['x-forwarded-for'] || '').split(',');
  return forwarded.at(-1).trim() || request.rawRequest?.ip || 'unknown';
}

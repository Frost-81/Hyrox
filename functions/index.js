// Emails sent from info@hybridprog.com (mail.js): email verification and password resets.
//
// New email and password accounts must confirm their address before they can use the site:
// firestore.rules and payments.js refuse a password sign-in until its token has email_verified.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { SMTP_URL, MAIL, sendEmail, template, underLimits, clientIp } from './mail.js';

initializeApp();

export { createCheckout, billingPortal, stripeWebhook } from './payments.js';

const MAX_PER_IP = 10; // emails of each kind per hour from one IP address (homes and gyms share one)
const MAX_PER_ACCOUNT = 5; // emails of each kind per hour to one address
const MAX_ALL = 400; // emails per hour in all (Namecheap allows 500)

const opts = { region: 'us-central1', secrets: [SMTP_URL] };

/** Firebase Hosting serves the same action page (/__/auth/action) on our domain, so links stay on it. */
function onOurSite(link) {
  const { pathname, search } = new URL(link);
  return new URL(`${pathname}${search}`, MAIL.site).href;
}

// ---------- email verification ----------

/** Emails the signed-in user a link that confirms their address. Returns { email, verified }. */
export const sendVerifyEmail = onCall(opts, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { email, emailVerified } = await getAuth().getUser(request.auth.uid);
  if (!email) throw new HttpsError('failed-precondition', 'This account has no email address.');
  if (emailVerified) return { email, verified: true };

  const allowed = await underLimits([
    { key: `verify-uid:${request.auth.uid}`, max: MAX_PER_ACCOUNT },
    { key: `verify-ip:${clientIp(request)}`, max: MAX_PER_IP },
    { key: 'mail-all', max: MAX_ALL },
  ]);
  if (!allowed) throw new HttpsError('resource-exhausted', 'Too many emails asked for. Try again in an hour.');

  let link;
  try {
    link = await getAuth().generateEmailVerificationLink(email);
  } catch (err) {
    logger.error('Verification link not made', { code: err.code, message: err.message });
    throw new HttpsError('unavailable', 'Could not send the email. Please try again in a few minutes.');
  }

  await sendEmail({
    to: email,
    subject: 'Confirm your HybridProg email',
    ...template({
      heading: 'Confirm your email',
      paragraphs: ['Welcome to HybridProg. Confirm this is your email address to finish creating your account.'],
      button: { label: 'Confirm my email', url: onOurSite(link) },
      footnote: 'If you did not create a HybridProg account, ignore this email.',
    }),
  });
  return { email, verified: false };
});

// ---------- password reset ----------

/**
 * { email }: emails a link to choose a new password. The answer is always the same, so it never
 * reveals whether an account exists. Replaces Firebase's own email, which came from firebaseapp.com.
 */
export const sendPasswordReset = onCall(opts, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'That email address looks wrong.');
  }
  const sent = { ok: true };
  const allowed = await underLimits([
    { key: `reset-email:${email}`, max: MAX_PER_ACCOUNT },
    { key: `reset-ip:${clientIp(request)}`, max: MAX_PER_IP },
    { key: 'mail-all', max: MAX_ALL },
  ]);
  if (!allowed) return sent;

  let link;
  try {
    link = await getAuth().generatePasswordResetLink(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/email-not-found') return sent;
    logger.error('Password reset link not made', { code: err.code, message: err.message });
    throw new HttpsError('unavailable', 'Could not send the email. Please try again in a few minutes.');
  }
  const url = onOurSite(link);

  await sendEmail({
    to: email,
    subject: 'Reset your HybridProg password',
    ...template({
      heading: 'Reset your password',
      paragraphs: ['Someone asked to reset the password of your HybridProg account. Choose a new one with the button below. The link works once and expires in 1 hour.'],
      button: { label: 'Choose a new password', url },
      footnote: 'If you did not ask for this, ignore this email. Your password stays the same.',
    }),
  });
  return sent;
});

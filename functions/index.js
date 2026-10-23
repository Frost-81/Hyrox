// Email sign-in codes: a second step after the password, for users who turn it on.
//
// A verified sign-in is recorded as a custom claim: `mfaEmail: true` (turned on) and `mfa`, the
// auth_time of the last few sign-ins that entered a code. firestore.rules lets a password sign-in
// of an enrolled user through only when its auth_time is in that list, so a new sign-in needs a new code.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

initializeApp();

export { createCheckout, billingPortal, stripeWebhook } from './payments.js';

// e.g. smtps://user:password@smtp.example.com:465 (set with: firebase functions:secrets:set SMTP_URL)
const SMTP_URL = defineSecret('SMTP_URL');
const MAIL_FROM = defineString('MAIL_FROM', { default: 'Hybrid Prog <info@hybridprog.com>' });

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const SESSIONS_KEPT = 5; // sign-ins (devices) that stay verified at once

const opts = { region: 'us-central1', secrets: [SMTP_URL] };
const codeRef = (uid) => getFirestore().doc(`mfaCodes/${uid}`); // no rule matches it: server only
const hash = (uid, code) => createHash('sha256').update(`${uid}:${code}`).digest();

/** The signed-in password user, or an error. Google sign-ins have their own 2-step verification. */
function passwordUser(request) {
  const token = request.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('failed-precondition', 'Email codes are for email and password sign-in.');
  }
  return { uid: request.auth.uid, authTime: token.auth_time, claims: token };
}

const verified = (claims) => claims.mfaEmail !== true || (claims.mfa || []).includes(claims.auth_time);

export const sendMfaCode = onCall(opts, async (request) => {
  const { uid, authTime } = passwordUser(request);
  const { email } = await getAuth().getUser(uid);
  if (!email) throw new HttpsError('failed-precondition', 'This account has no email address.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  await getFirestore().runTransaction(async (tx) => {
    const prev = (await tx.get(codeRef(uid))).data();
    if (prev && now - prev.sentAt.toMillis() < RESEND_MS) {
      throw new HttpsError('resource-exhausted', 'Wait a minute before asking for a new code.');
    }
    const inWindow = prev && now - prev.windowStart.toMillis() < 60 * 60 * 1000;
    const sends = inWindow ? prev.sends : 0;
    if (sends >= MAX_SENDS_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Too many codes asked for. Try again in an hour.');
    }
    tx.set(codeRef(uid), {
      hash: hash(uid, code),
      authTime, // the code only works for the sign-in that asked for it
      attempts: 0,
      sentAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + CODE_TTL_MS),
      windowStart: inWindow ? prev.windowStart : Timestamp.fromMillis(now),
      sends: sends + 1,
    });
  });

  await nodemailer.createTransport(SMTP_URL.value()).sendMail({
    from: MAIL_FROM.value(),
    to: email,
    subject: `${code} is your Hybrid Prog sign-in code`,
    text: `Your sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not just sign in, change your password: someone else knows it.`,
  });
  return { email };
});

/** { code, enroll }: checks the code, then marks this sign-in verified (and turns codes on if enroll). */
export const verifyMfaCode = onCall(opts, async (request) => {
  const { uid, authTime, claims } = passwordUser(request);
  const code = String(request.data?.code || '');
  const enroll = request.data?.enroll === true;
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit code.');
  if (!enroll && claims.mfaEmail !== true) throw new HttpsError('failed-precondition', 'Email codes are not turned on.');

  // Throwing inside the transaction would roll back the attempt count, so return the outcome instead.
  const outcome = await getFirestore().runTransaction(async (tx) => {
    const doc = (await tx.get(codeRef(uid))).data();
    if (!doc || doc.authTime !== authTime || doc.expiresAt.toMillis() < Date.now()) return 'expired';
    if (doc.attempts >= MAX_ATTEMPTS) return 'locked';
    if (!timingSafeEqual(Buffer.from(doc.hash), hash(uid, code))) {
      tx.update(codeRef(uid), { attempts: doc.attempts + 1 });
      return 'wrong';
    }
    // Used up. The send counters stay so a correct code doesn't reset the hourly limit.
    tx.update(codeRef(uid), { expiresAt: Timestamp.fromMillis(0) });
    return 'ok';
  });
  if (outcome === 'expired') throw new HttpsError('deadline-exceeded', 'That code has expired. Send a new one.');
  if (outcome === 'locked') throw new HttpsError('resource-exhausted', 'Too many wrong codes. Send a new one.');
  if (outcome === 'wrong') throw new HttpsError('permission-denied', 'That code is wrong.');

  const auth = getAuth();
  const current = (await auth.getUser(uid)).customClaims || {};
  const mfa = [...(current.mfa || []).filter((t) => t !== authTime), authTime].slice(-SESSIONS_KEPT);
  await auth.setCustomUserClaims(uid, { ...current, mfaEmail: true, mfa });
  return { ok: true };
});

/** Turns codes off. Only from a sign-in that is already verified. */
export const disableMfa = onCall(opts, async (request) => {
  const { uid, claims } = passwordUser(request);
  if (!verified(claims)) throw new HttpsError('permission-denied', 'Enter your sign-in code first.');
  const auth = getAuth();
  const { mfaEmail, mfa, ...rest } = (await auth.getUser(uid)).customClaims || {};
  await auth.setCustomUserClaims(uid, rest);
  return { ok: true };
});

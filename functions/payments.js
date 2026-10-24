// Stripe payments: Checkout, the billing portal and the webhook that records what each user has paid for.
//
// customers/{uid} holds { stripeId, access: { plan, wod } }. Only these functions write it; the site reads
// `access` (firestore.rules). The 12-week plan is a one-time payment (refunds take it back); the WOD is a
// monthly subscription, on while it is active or trialing.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { STRIPE_IDS } from './stripe-config.js';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Prices live on the server (stripe-config.js), not in the page, so a visitor can't pick their own.
// Checkout shows a promotion code box (PLAN50 / WOD50: scripts/createPromoCodes.js).
const PRODUCTS = {
  plan: { mode: 'payment', priceId: STRIPE_IDS.plan.priceId },
  wod: { mode: 'subscription', priceId: STRIPE_IDS.wod.priceId },
};

// Where Stripe may send people back to.
const ORIGINS = [
  'https://hybridprog.com',
  'https://www.hybridprog.com',
  'https://hyrox-prog.web.app',
  'https://hyrox-prog.firebaseapp.com',
  'http://127.0.0.1:5000',
  'http://localhost:5000',
];

const region = 'us-central1';
const stripe = () => new Stripe(STRIPE_SECRET_KEY.value());
const customerRef = (uid) => getFirestore().doc(`customers/${uid}`);

/** The signed-in user, who must have confirmed their email if they use a password (same test as firestore.rules). */
function signedIn(request) {
  const token = request.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (token.firebase?.sign_in_provider === 'password' && token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Confirm your email first.');
  }
  return { uid: request.auth.uid, email: token.email };
}

/** A page of this site to come back to, or an error. */
function returnUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new HttpsError('invalid-argument', 'Bad return address.'); }
  if (!ORIGINS.includes(url.origin)) throw new HttpsError('invalid-argument', 'Bad return address.');
  return url;
}

/** The user's Stripe customer id, created on first use. */
async function stripeCustomer(uid, email) {
  const snap = await customerRef(uid).get();
  if (snap.get('stripeId')) return snap.get('stripeId');
  const customer = await stripe().customers.create({ email, metadata: { uid } });
  await customerRef(uid).set({ stripeId: customer.id }, { merge: true });
  return customer.id;
}

const setAccess = (uid, product, on) =>
  customerRef(uid).set({ access: { [product]: on }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

/** { product, returnUrl } → { url } of a Stripe Checkout page. */
export const createCheckout = onCall({ region, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const { uid, email } = signedIn(request);
  const product = request.data?.product;
  const p = PRODUCTS[product];
  if (!p) throw new HttpsError('invalid-argument', 'Unknown product.');
  if ((await customerRef(uid).get()).get(`access.${product}`) === true) {
    throw new HttpsError('already-exists', 'You already have this.');
  }

  const back = returnUrl(request.data?.returnUrl);
  const success = new URL(back);
  success.searchParams.set('paid', product);
  const metadata = { uid, product };
  const session = await stripe().checkout.sessions.create({
    mode: p.mode,
    customer: await stripeCustomer(uid, email),
    client_reference_id: uid,
    line_items: [{ price: p.priceId, quantity: 1 }],
    success_url: success.href,
    cancel_url: back.href,
    metadata,
    // Copied onto what the webhook sees later, so it knows whose payment or subscription it is.
    ...(p.mode === 'payment'
      ? { payment_intent_data: { metadata } }
      : { subscription_data: { metadata }, payment_method_collection: 'if_required' }), // no card when a code makes it free
    allow_promotion_codes: true,
    // Stripe turns Managed Payments (Stripe as merchant of record) on by default; we collect and file tax ourselves.
    managed_payments: { enabled: false },
  });
  return { url: session.url };
});

/** { returnUrl } → { url } of the Stripe customer portal (change or cancel the subscription, invoices). */
export const billingPortal = onCall({ region, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const { uid } = signedIn(request);
  const stripeId = (await customerRef(uid).get()).get('stripeId');
  if (!stripeId) throw new HttpsError('failed-precondition', 'No purchases yet.');
  const session = await stripe().billingPortal.sessions.create({
    customer: stripeId,
    return_url: returnUrl(request.data?.returnUrl).href,
  });
  return { url: session.url };
});

/** Stripe calls this (Developers → Webhooks). A non-2xx answer makes Stripe retry later. */
export const stripeWebhook = onRequest({ region, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    logger.warn('Bad Stripe signature', err.message);
    res.status(400).send('Bad signature');
    return;
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const { uid, product } = obj.metadata || {};
        // no_payment_required: a 100% off coupon made it free.
        const settled = ['paid', 'no_payment_required'].includes(obj.payment_status);
        if (obj.mode === 'payment' && settled && uid && PRODUCTS[product]?.mode === 'payment') {
          await setAccess(uid, product, true);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const { uid, product } = obj.metadata || {};
        if (!uid || PRODUCTS[product]?.mode !== 'subscription') break;
        // Events can arrive out of order, so use the subscription as it is now.
        const sub = await stripe().subscriptions.retrieve(obj.id);
        await setAccess(uid, product, ['active', 'trialing'].includes(sub.status));
        break;
      }
      case 'charge.refunded': {
        if (!obj.refunded || !obj.payment_intent) break; // partial refunds keep access
        const { metadata } = await stripe().paymentIntents.retrieve(obj.payment_intent);
        if (metadata?.uid && PRODUCTS[metadata.product]?.mode === 'payment') {
          await setAccess(metadata.uid, metadata.product, false);
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook failed', event.type, err);
    res.status(500).send('Failed');
  }
});

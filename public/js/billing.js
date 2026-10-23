// Feature gating by purchase: the 12-week plan is a one-time $5 payment, the WOD a $5/month subscription.
// Checkout and the record of what each user paid for are handled by our Cloud Functions (functions/payments.js,
// which also holds the Stripe price ids) and read by cloud.watchSubs().

// Stripe's customer portal login page: the user enters their email and Stripe sends a sign-in link.
// A fallback for the Manage subscription button. Switch with STRIPE_MODE in functions/stripe-config.js.
const PORTAL_MODE = 'sandbox'; // 'sandbox' | 'live'
const PORTAL_LOGIN = {
  sandbox: 'https://billing.stripe.com/p/login/test_8x24gA0ekdlLfze9yt2Ji00',
  live: '', // Stripe → Settings → Billing → Customer portal → "Login link", in the live account
};

/** The portal login link, with the email filled in when known; '' when none is set for this mode. */
export function portalLoginUrl(email) {
  const base = PORTAL_LOGIN[PORTAL_MODE];
  if (!base) return '';
  return email ? `${base}?prefilled_email=${encodeURIComponent(email)}` : base;
}

export const PRODUCTS = {
  plan: { name: '12-week plan', price: '$5', mode: 'payment' }, // one-time, unlocks for good
  wod: { name: 'Workout of the Day', price: '$5/month', mode: 'subscription' },
};

/** The product each feature needs. */
export const FEATURES = {
  fullPlan: 'plan', // all 12 weeks
  wod: 'wod', // Workout of the Day
};

/** Can this user use the feature? subs: Set of product keys ('plan', 'wod') the user has paid for. */
export function canUse(feature, { user, subs = new Set() } = {}) {
  if (!user) return false;
  const need = FEATURES[feature];
  return !!need && subs.has(need);
}

/** True if any of these products is a recurring subscription (so there is something to manage). */
export const hasSubscription = (subs) => [...subs].some((k) => PRODUCTS[k]?.mode === 'subscription');

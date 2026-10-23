// Feature gating by subscription. Two separate $5/month Stripe subscriptions: the 12-week plan and the WOD.
// Subscriptions are written by the "Run Payments with Stripe" Firebase extension and read by cloud.watchSubs().
// To turn payments on, create the two products in Stripe and paste their ids here.

export const PRODUCTS = {
  plan: { name: '12-week plan', price: '$5/month', priceId: '', productId: '' },
  wod: { name: 'Workout of the Day', price: '$5/month', priceId: '', productId: '' },
};

/** The product each feature needs. */
export const FEATURES = {
  fullPlan: 'plan', // all 12 weeks
  wod: 'wod', // Workout of the Day
};

/** Can this user use the feature? subs: Set of product keys ('plan', 'wod') with an active subscription. */
export function canUse(feature, { user, subs = new Set() } = {}) {
  if (!user) return false;
  const need = FEATURES[feature];
  return !!need && subs.has(need);
}

/** True once the Stripe price for a product has been filled in. */
export const checkoutReady = (product) => !!PRODUCTS[product]?.priceId;

/** Product key for a Stripe product id, or null. */
export const productKeyFor = (productId) =>
  Object.keys(PRODUCTS).find((k) => PRODUCTS[k].productId && PRODUCTS[k].productId === productId) || null;

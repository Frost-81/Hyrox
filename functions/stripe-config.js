// Stripe ids for each account. To go live, change STRIPE_MODE to 'live', set the live
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, run scripts/createPromoCodes.js with the live key
// and deploy the functions. Also switch PORTAL_MODE in public/js/billing.js and deploy hosting.
export const STRIPE_MODE = 'sandbox'; // 'sandbox' | 'live'

const IDS = {
  sandbox: {
    plan: { productId: 'prod_VUmNQt8V8EBmdt', priceId: 'price_1UTmp1JC54Im51kl1P7ltZfl' },
    wod: { productId: 'prod_VUmNqXQm7xWW9m', priceId: 'price_1UTmpCJC54Im51klY81LjVJL' },
  },
  live: {
    plan: { productId: 'prod_VUlbTjJzEWvVIc', priceId: 'price_1UTm3yQtgG9itN2pqbSAGCpK' },
    wod: { productId: 'prod_VUlbQubbwdwQ8h', priceId: 'price_1UTm4kQtgG9itN2pQ9VYQjAU' },
  },
};

/** { plan: { productId, priceId }, wod: { ... } } for the current mode. */
export const STRIPE_IDS = IDS[STRIPE_MODE];

/** The secret key prefix that belongs to the current mode (sandboxes use test keys). */
export const KEY_PREFIX = STRIPE_MODE === 'live' ? 'sk_live_' : 'sk_test_';

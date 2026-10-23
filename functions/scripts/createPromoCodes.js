// One-time setup: the founding-member promotion codes customers type in Stripe Checkout.
//   PLAN50 → 100% off the 12-week plan, first 50 redemptions
//   WOD50  → 100% off the WOD subscription (forever), first 50 redemptions
//
// Uses the products of STRIPE_MODE in stripe-config.js. Run from functions/ with that account's secret key:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/createPromoCodes.js
// Safe to run again: existing coupons and active codes are kept, not duplicated.
import Stripe from 'stripe';
import { STRIPE_MODE, STRIPE_IDS, KEY_PREFIX } from '../stripe-config.js';

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith(KEY_PREFIX)) {
  console.error(`STRIPE_MODE is '${STRIPE_MODE}': set STRIPE_SECRET_KEY to its ${KEY_PREFIX}... key.`);
  process.exit(1);
}
const stripe = new Stripe(key);

const PROMOS = [
  { code: 'PLAN50', couponId: 'founding-plan', productId: STRIPE_IDS.plan.productId, name: 'Founding member: 12-week plan' },
  { code: 'WOD50', couponId: 'founding-wod', productId: STRIPE_IDS.wod.productId, name: 'Founding member: WOD' },
];
const MAX = 50;

async function couponFor({ couponId, productId, name }) {
  try {
    const existing = await stripe.coupons.retrieve(couponId);
    console.log(`coupon ${couponId}: already exists`);
    return existing;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  const coupon = await stripe.coupons.create({
    id: couponId,
    name,
    percent_off: 100,
    duration: 'forever', // the WOD stays free; use 'repeating' + duration_in_months for a free trial period instead
    applies_to: { products: [productId] },
    max_redemptions: MAX,
  });
  console.log(`coupon ${couponId}: created`);
  return coupon;
}

async function make(promo) {
  const coupon = await couponFor(promo);
  const { data } = await stripe.promotionCodes.list({ code: promo.code, active: true, limit: 1 });
  if (data.length) {
    console.log(`code ${promo.code}: already active (${data[0].times_redeemed}/${data[0].max_redemptions ?? '∞'} used)`);
    return;
  }
  await stripe.promotionCodes.create({
    promotion: { type: 'coupon', coupon: coupon.id },
    code: promo.code,
    max_redemptions: MAX,
  });
  console.log(`code ${promo.code}: created, ${MAX} uses`);
}

for (const promo of PROMOS) await make(promo);
console.log(`Done (${STRIPE_MODE}).`);

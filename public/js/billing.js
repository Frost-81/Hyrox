// Feature gating, ready for paid plans. Nothing is charged yet: every feature is 'free'.
// To put a feature behind payment later, set it to 'pro' here. The tier comes from
// cloud.watchTier(), which reads subscriptions written by the Stripe Firebase extension.

export const TIERS = ['free', 'pro'];

/** The tier each feature needs. 'free' means any signed-in user. */
export const FEATURES = {
  fullPlan: 'free', // all 12 weeks, ticks, logs, print
  wod: 'free', // Workout of the Day
  wodLog: 'free', // logging WOD results and benchmark history
};

/** Can this user use the feature? Signed-out users only get the plan preview. */
export function canUse(feature, { user, tier = 'free' } = {}) {
  if (!user) return false;
  const need = FEATURES[feature] ?? 'pro';
  return TIERS.indexOf(tier) >= TIERS.indexOf(need);
}

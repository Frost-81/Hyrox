// Heart-rate zones and plan suggestions from logged sessions. Pure functions, no DOM.

const AGE_MID = {
  '16-24': 20, '25-29': 27, '30-34': 32, '35-39': 37, '40-44': 42, '45-49': 47,
  '50-54': 52, '55-59': 57, '60-64': 62, '65-69': 67, '70+': 72,
};

const num = (v) => (v === '' || v == null ? null : Number(v));

/**
 * Threshold heart rate (LTHR) and zones.
 * From a 5k test: LTHR ≈ 98% of the 5k average HR. Otherwise ≈ 89% of max HR
 * (max HR estimated as 208 − 0.7 × age when not given).
 */
export function hrProfile(inp) {
  const maxGiven = num(inp.maxHR);
  const hr5k = num(inp.hr5k);
  const maxHR = maxGiven || Math.round(208 - 0.7 * (AGE_MID[inp.age] ?? 35));
  const lthr = hr5k ? Math.round(hr5k * 0.98) : Math.round(maxHR * 0.89);
  const pct = (p) => Math.round(lthr * p);
  return {
    source: hr5k ? 'test' : maxGiven ? 'max' : 'estimate',
    maxHR,
    lthr,
    easy: [null, pct(0.89)],
    steady: [pct(0.9), pct(0.94)],
    thr: [pct(0.95), lthr],
    fiveK: [lthr + 1, null],
  };
}

/** "under 148" / "152–160" / "over 168" */
export function fmtZone([lo, hi]) {
  if (lo == null) return `under ${hi}`;
  if (hi == null) return `over ${lo - 1}`;
  return `${lo}–${hi}`;
}

/** New inputs after logging a 5k test: the 5k time (and heart rate, if given) drive paces, zones and the projection. */
export function applyTest(inputs, { fiveK, hr5k = null }) {
  const next = { ...inputs, fiveK, fiveKFromTest: true };
  if (hr5k) next.hr5k = String(hr5k);
  return next;
}

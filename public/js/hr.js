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

const lastN = (arr, n) => arr.slice(Math.max(0, arr.length - n));

/**
 * Suggestions from logged sessions, at most one of each kind.
 * Each id includes the newest log it is based on, so a dismissed or applied
 * suggestion only comes back after new logs.
 */
export function suggest(plan, logs = {}, dismissed = []) {
  const hr = plan.hr;
  const logged = plan.weeks
    .flatMap((w) => w.days)
    .filter((d) => d.key && logs[d.key])
    .map((d) => ({ ...d, log: logs[d.key] }));
  const out = [];

  const easy = lastN(logged.filter((d) => d.zone === 'easy' && d.log.hr), 3);
  if (easy.filter((d) => d.log.hr > hr.easy[1] + 3).length >= 2) {
    out.push({
      id: `easy-hot:${easy.at(-1).key}`,
      title: 'Your easy runs are running hot',
      text: `Your easy runs averaged ${avg(easy)} bpm, above your easy zone (under ${hr.easy[1]}). Slow easy runs down by 10 s/km so they stay truly easy.`,
      apply: { kind: 'adjust', easy: 10, hard: 0 },
    });
  }

  const hard = lastN(logged.filter((d) => (d.zone === 'steady' || d.zone === 'thr') && d.log.hr), 3);
  const tooHot = (d) => d.log.hr > hr[d.zone][1] + 3 || d.log.feel === 'hard';
  const tooEasy = (d) => d.zone === 'thr' && d.log.hr < hr.thr[0] && d.log.feel === 'easy';
  if (hard.filter(tooHot).length >= 2) {
    out.push({
      id: `hard-hot:${hard.at(-1).key}`,
      title: 'Your harder runs look too hard',
      text: 'Your steady and threshold runs went above their heart-rate zones or felt hard. Ease those paces by 5 s/km.',
      apply: { kind: 'adjust', easy: 0, hard: 5 },
    });
  } else if (hard.filter(tooEasy).length >= 2) {
    out.push({
      id: `hard-easy:${hard.at(-1).key}`,
      title: 'Your threshold runs look too easy',
      text: `Your threshold runs stayed under ${hr.thr[0]} bpm and felt easy. Speed up steady and threshold paces by 5 s/km.`,
      apply: { kind: 'adjust', easy: 0, hard: -5 },
    });
  }

  const test = logged.filter((d) => d.test && d.log.fiveK).at(-1);
  if (test && (test.log.fiveK !== plan.inputs.fiveK || (test.log.hr && Number(test.log.hr) !== Number(plan.inputs.hr5k)))) {
    const newLthr = test.log.hr ? Math.round(test.log.hr * 0.98) : null;
    out.push({
      id: `test:${test.key}:${test.log.fiveK}:${test.log.hr || ''}`,
      title: 'New 5k test result',
      text: `Update your 5k time to ${test.log.fiveK}${newLthr ? ` and your threshold heart rate to ${newLthr} bpm` : ''}. Your paces${newLthr ? ' and heart-rate zones' : ''} will be recalculated.`,
      apply: { kind: 'test', fiveK: test.log.fiveK, hr5k: test.log.hr || null },
    });
  }

  return out.filter((s) => !dismissed.includes(s.id));
}

const avg = (days) => Math.round(days.reduce((a, d) => a + Number(d.log.hr), 0) / days.length);

/** New inputs after applying a suggestion. */
export function applySuggestion(inputs, s) {
  const next = { ...inputs, dismissed: [...(inputs.dismissed || []), s.id] };
  if (s.apply.kind === 'adjust') {
    const cur = inputs.paceAdjust || { easy: 0, hard: 0 };
    next.paceAdjust = { easy: cur.easy + s.apply.easy, hard: cur.hard + s.apply.hard };
  } else {
    next.fiveK = s.apply.fiveK;
    if (s.apply.hr5k) next.hr5k = String(s.apply.hr5k);
  }
  return next;
}

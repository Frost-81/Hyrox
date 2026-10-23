// Pure plan engine: no DOM, no storage. Turns form inputs into a dated plan.
import { WEEKS, RACE_WEEK, PHASES, WEEK_LOAD, BEFORE_12_WEEKS, RECOVERY_TIPS_45, HR_TEST } from './sessions.js';
import { hrProfile, fmtZone } from './hr.js';

const MEN_OPEN = { push: 152, pull: 103, farm: 24, bag: 20, wb: 6 };
const WOMEN_OPEN = { push: 102, pull: 78, farm: 16, bag: 10, wb: 4 };

// sex picks the column of the machine swap chart: m, f, or x (mixed: show both).
export const DIVISIONS = {
  MO: { name: 'Men Open', sex: 'm', ...MEN_OPEN },
  WO: { name: 'Women Open', sex: 'f', ...WOMEN_OPEN },
  MP: { name: 'Men Pro', sex: 'm', push: 202, pull: 153, farm: 32, bag: 30, wb: 9 },
  WP: { name: 'Women Pro', sex: 'f', push: 152, pull: 103, farm: 24, bag: 20, wb: 6 },
  MD: { name: 'Men Doubles', sex: 'm', doubles: true, ...MEN_OPEN },
  WD: { name: 'Women Doubles', sex: 'f', doubles: true, ...WOMEN_OPEN },
  XD: { name: 'Mixed Doubles', sex: 'x', doubles: true, ...MEN_OPEN },
};

export const MACHINES = ['row', 'ski', 'bike'];

// The user's swap chart (meter columns only): run = row (men/women) = bike (men/women).
export const SWAP_CHART = [
  [200, 250, 200, 500, 400],
  [400, 500, 400, 1000, 800],
  [800, 1000, 800, 2000, 1600],
  [1200, 1500, 1200, 3000, 2400],
  [1600, 2000, 1600, 4000, 3200],
  [4000, 5000, 4000, 10000, 8000],
];
const ROW_PER_RUN = { m: 1.25, f: 1.0 };
const BIKE_PER_RUN = { m: 2.5, f: 2.0 };

export const AGE_GROUPS = ['16-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70+'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Share of the station total, in race order.
export const STATIONS = [
  { key: 'ski', name: 'SkiErg', dist: '1000 m', share: 0.144 },
  { key: 'push', name: 'Sled push', dist: '50 m', share: 0.103 },
  { key: 'pull', name: 'Sled pull', dist: '50 m', share: 0.138 },
  { key: 'bbj', name: 'Burpee broad jumps', dist: '80 m', share: 0.121 },
  { key: 'row', name: 'Row', dist: '1000 m', share: 0.147 },
  { key: 'farm', name: 'Farmers carry', dist: '200 m', share: 0.052 },
  { key: 'lunge', name: 'Sandbag lunges', dist: '100 m', share: 0.129 },
  { key: 'wb', name: 'Wall balls', dist: 'race reps', share: 0.167 },
];

const DAY = 86400000;

// ---------- parsing & formatting ----------

/** "1:05" -> 3900 seconds (hours:minutes). */
export function parseHM(str) {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(str || '');
  return m ? (+m[1] * 60 + +m[2]) * 60 : null;
}

/** "25" -> "25:00", "1" -> "1:00", "22.30" -> "22:30"; anything else is returned trimmed. */
export function normalizeTime(str) {
  const t = String(str ?? '').trim().replace(/[.,]/, ':');
  return /^\d{1,2}$/.test(t) ? `${+t}:00` : t;
}

/**
 * As-you-type mask for time fields, so phones without a ":" key still work:
 * "130" -> "1:30", "2500" -> "25:00", "1:305" -> "13:05". A well-formed "m:ss" being typed is left alone.
 */
export function maskTime(raw) {
  const t = String(raw ?? '');
  if (/^\d{0,2}:\d{0,2}$/.test(t)) return t;
  const digits = t.replace(/\D/g, '').slice(0, 4);
  return digits.length >= 3 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits;
}

/** "20:00" -> 1200 seconds (minutes:seconds). */
export function parseMS(str) {
  const m = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(str || '');
  return m ? +m[1] * 60 + +m[2] : null;
}

/** 245 -> "4:05"; 3900 -> "1:05:00" */
export function fmtTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "2027-04-24" -> UTC ms at midnight. */
export function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

export function toYmd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Local "today" as YYYY-MM-DD. */
export function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const weekdayIdx = (ms) => (new Date(ms).getUTCDay() + 6) % 7; // Mon = 0
const mondayOf = (ms) => ms - weekdayIdx(ms) * DAY;

export function fmtDate(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtLongDate(ms) {
  const d = new Date(ms);
  return `${WEEKDAYS[weekdayIdx(ms)]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function fmtRange(start, end) {
  const a = new Date(start), b = new Date(end);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${fmtDate(start)}–${b.getUTCDate()}`
    : `${fmtDate(start)}–${fmtDate(end)}`;
}

// ---------- validation ----------

export function validateInputs(inp, today = todayYmd()) {
  const errors = {};
  const race = parseYmd(inp.raceDate);
  if (!race) errors.raceDate = 'Pick your race date.';
  else if (race <= parseYmd(today)) errors.raceDate = 'Race date must be in the future.';

  const g = parseHM(normalizeTime(inp.goal));
  if (g == null) errors.goal = 'Use hours:minutes, e.g. 1:05.';
  else if (g < 55 * 60 || g > 150 * 60) errors.goal = 'Goal must be between 0:55 and 2:30.';

  if (!DIVISIONS[inp.division]) errors.division = 'Pick a division.';
  if (!AGE_GROUPS.includes(inp.age)) errors.age = 'Pick an age group.';

  if (inp.fiveK) {
    const k = parseMS(normalizeTime(inp.fiveK));
    if (k == null) errors.fiveK = 'Use minutes:seconds, e.g. 22:30.';
    else if (k < 13 * 60 || k > 50 * 60) errors.fiveK = 'That 5k time looks off (13:00–50:00).';
  }

  const n = (inp.days || []).length;
  if (n !== 5 && n !== 6) errors.days = 'Pick 5 or 6 training days.';

  const maxHR = inp.maxHR ? Number(inp.maxHR) : null;
  const hr5k = inp.hr5k ? Number(inp.hr5k) : null;
  if (maxHR != null && !(maxHR >= 120 && maxHR <= 230)) errors.maxHR = 'Max heart rate should be between 120 and 230.';
  if (inp.bodyWeight !== undefined && inp.bodyWeight !== '' && inp.bodyWeight !== null) {
    const bw = Number(String(inp.bodyWeight).replace(',', '.'));
    if (!(bw >= 35 && bw <= 200)) errors.bodyWeight = 'Body weight should be between 35 and 200 kg.';
  }
  if (hr5k != null && !(hr5k >= 100 && hr5k <= 220)) errors.hr5k = '5k heart rate should be between 100 and 220.';
  else if (hr5k && maxHR && hr5k > maxHR) errors.hr5k = 'Your 5k average can\'t be above your max heart rate.';
  return errors;
}

// ---------- numbers ----------

export function computeSplits(goalSec) {
  const run = goalSec * 0.503;
  const stations = goalSec * 0.446;
  return {
    goal: goalSec,
    run,
    runPerKm: run / 8,
    stations,
    roxzone: goalSec * 0.051,
    perStation: STATIONS.map((s) => ({ ...s, time: stations * s.share })),
  };
}

/** adjust: seconds per km added to easy and to steady/threshold paces (from heart-rate suggestions). */
export function computePaces(splits, fiveKSec, adjust = {}) {
  const race = Math.round(splits.runPerKm);
  const p = fiveKSec ? Math.round(fiveKSec / 5) : race - 15;
  const easyAdj = adjust.easy || 0;
  const hardAdj = adjust.hard || 0;
  const per500 = (key) => {
    const s500 = Math.round(splits.perStation.find((s) => s.key === key).time / 2);
    return { easy: s500 + 20, steady: s500 + 12, thr: s500 + 5 };
  };
  return {
    estimated: !fiveKSec,
    adjusted: !!(easyAdj || hardAdj),
    fiveK: p,
    easy: [p + 90 + easyAdj, p + 120 + easyAdj],
    steady: p + 50 + hardAdj,
    thr: p + 20 + hardAdj,
    race,
    row: per500('row'),
    ski: per500('ski'),
  };
}

const roundTo = (x, step) => Math.round(x / step) * step;

export function weekLoads(div, week) {
  const pct = WEEK_LOAD[week] ?? 1;
  return {
    pct,
    push: roundTo(div.push * pct, 2.5),
    pull: roundTo(div.pull * pct, 2.5),
    farm: Math.max(2, roundTo(div.farm * pct, 2)),
  };
}

/** ctx: { paces, div, hr (zones, or null to hide heart rate), equipment } */
function tokenValues(ctx, week) {
  const { paces, div, hr } = ctx;
  const L = weekLoads(div, week);
  const kg = (x) => `${x} kg`;
  const withHr = (pace, zone) => (hr ? `${pace}, HR ${fmtZone(hr[zone])}` : pace);
  return {
    easy: withHr(`${fmtTime(paces.easy[0])}–${fmtTime(paces.easy[1])}/km`, 'easy'),
    steady: withHr(`${fmtTime(paces.steady)}/km`, 'steady'),
    thr: withHr(`${fmtTime(paces.thr)}/km`, 'thr'),
    '5k': withHr(`${fmtTime(paces.fiveK)}/km`, 'fiveK'),
    race: `${fmtTime(paces.race)}/km`,
    push: kg(L.push),
    pull: kg(L.pull),
    farm: `2 x ${L.farm} kg`,
    bag: kg(div.bag),
    kb: kg(div.farm),
    wb: kg(div.wb),
  };
}

export function fill(line, values, ctx) {
  return line
    .replace(/\{m:([^}]+)\}/g, (m, spec) => (ctx ? machineText(spec, ctx, values) : m))
    .replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

// ---------- lifting targets ----------

/**
 * Estimated one-rep max as a share of body weight for a fit amateur (Open divisions).
 * perHand: dumbbell lifts, where the target is for each dumbbell.
 */
export const LIFTS = [
  { re: /^Back Squat\b/, name: 'squat', m: 1.0, f: 0.8 },
  { re: /^Front Squats?\b/, name: 'front squat', m: 0.85, f: 0.65 },
  { re: /^Bench Press\b/, name: 'bench', m: 0.85, f: 0.55 },
  { re: /^Incline Dumbbell Press\b/, name: 'incline DB press', m: 0.22, f: 0.14, perHand: true },
  { re: /^Romanian Deadlifts?\b/, name: 'RDL', m: 0.9, f: 0.7 },
  { re: /^Deadlifts?\b/, name: 'deadlift', m: 1.25, f: 1.0 },
  { re: /^Overhead Press\b/, name: 'overhead press', m: 0.5, f: 0.33 },
  { re: /^Walking Lunges with Dumbbells\b/, name: 'DB lunges', m: 0.25, f: 0.17, perHand: true },
];

/** Share of one-rep max for a set of `reps`, leaving about 2 reps in reserve (Epley). */
export const shareOfMax = (reps) => 1 / (1 + (reps + 2) / 30);

/**
 * Working weight for a lift line, as a share of body weight: by lift, men/women, rep count,
 * Pro (stronger) or 45+ (start lighter), and taper notes like "lighter weight".
 */
export function liftShare(line, sex, { pro = false, is45 = false } = {}) {
  const lift = LIFTS.find((l) => l.re.test(line));
  const m = /(\d+)(?:-(\d+))? reps/.exec(line);
  if (!lift || !m) return null;
  const reps = m[2] ? (+m[1] + +m[2]) / 2 : +m[1];
  let k = shareOfMax(reps) * (pro ? 1.15 : 1) * (is45 ? 0.9 : 1);
  if (/lighter weight/.test(line)) k *= 0.85;
  else if (/moderate weight/.test(line)) k *= 0.9;
  return { lift, share: lift[sex] * k };
}

// The % shown is rounded (5% steps for barbells, 1% per dumbbell) and the kg comes from that same %,
// so the two always agree (75% of 80 kg = 60 kg).
const pctOf = (share, perHand) => (perHand ? Math.round(share * 100) : roundTo(share * 100, 5));
const pctText = (share, perHand) => `${pctOf(share, perHand)}%`;
const kgText = (share, bw, perHand) => {
  const exact = (pctOf(share, perHand) / 100) * bw;
  return String(perHand ? Math.max(2, roundTo(exact, 2)) : Math.max(5, roundTo(exact, 2.5)));
};

/**
 * Add a target to a lift line: "@ 50 kg, about 60% of body weight" (or the % alone without a body weight).
 * Mixed Doubles shows men/women. Lines that aren't weighted lifts come back unchanged.
 */
export function liftLine(line, ctx) {
  const sexes = ctx.div.sex === 'x' ? ['m', 'f'] : [ctx.div.sex];
  const opts = { pro: /Pro/.test(ctx.div.name), is45: ctx.is45 };
  const shares = sexes.map((sx) => liftShare(line, sx, opts));
  if (!shares[0]) return line;
  const { perHand } = shares[0].lift;
  const pct = shares.map((x) => pctText(x.share, perHand)).join('/');
  const bw = Number(ctx.bodyWeight) || null;
  const each = perHand ? ' each' : '';
  const mw = sexes.length > 1 ? ' (men/women)' : '';
  const target = bw
    ? `@ ${perHand ? '2 x ' : ''}${shares.map((x) => kgText(x.share, bw, perHand)).join('/')} kg${mw}, about ${pct} of body weight${each}`
    : `@ about ${pct} of body weight${each}${mw}`;
  // Put the target right after the reps, before any note in brackets.
  return line.replace(/(\d+(?:-\d+)? reps(?: per leg)?)/, `$1 ${target}`);
}

// ---------- machine swaps ----------

const MACHINE_LABEL = { row: 'Row', ski: 'SkiErg', bike: 'Bike', run: 'Run' };
const NO_MACHINE = { row: 'no rower', ski: 'no SkiErg' };
const EFFORT_WORDS = { easy: 'at a moderate effort', steady: 'steady', thr: 'hard' };
const round50 = (x) => Math.max(50, Math.round(x / 50) * 50);

/** Run (or, with per, bike) distance for a row/ski distance, per the swap chart; mixed teams get "men/women". */
function convert(meters, per, sex) {
  const one = (k) => round50((meters / ROW_PER_RUN[k]) * (per ? per[k] : 1));
  if (sex !== 'x') return `${one(sex)}`;
  return one('m') === one('f') ? `${one('m')}` : `${one('m')}/${one('f')}`;
}

/**
 * Write out a machine token such as "row:1000m", "ski:15min:easy" or "row:2 x 10min:thr",
 * swapping to another machine or to running when the athlete doesn't have it.
 */
export function machineText(spec, ctx, values) {
  const [machine, amount, effort] = spec.split(':');
  const m = /^(?:(\d+) x )?(\d+)(m|min)$/.exec(amount);
  if (!m) return spec;
  const reps = m[1] ? `${m[1]} x ` : '';
  const n = +m[2];
  const has = (k) => ctx.equipment.includes(k);
  const sex = ctx.div.sex;

  // SkiErg isn't on the chart: without one, use the rower at the same distance or time.
  const use = has(machine) ? machine : machine === 'ski' && has('row') ? 'row' : null;
  const swapNote = use === machine ? '' : ` (${NO_MACHINE[machine]})`;

  if (m[3] === 'm') {
    if (use) {
      const split = effort ? ` @ about ${fmtTime(ctx.paces[use][effort])}/500 m` : '';
      return `${reps}${n} m ${use === 'ski' ? 'SkiErg' : 'row'}${split}${swapNote}`;
    }
    const mw = (d) => (d.includes('/') ? `${d} m (men/women)` : `${d} m`);
    const run = `${reps}${mw(convert(n, null, sex))} run${effort ? ` @ ${values[effort]}` : ''}`;
    const bike = has('bike') ? ` or ${reps}${mw(convert(n, BIKE_PER_RUN, sex))} bike` : '';
    return `${run}${bike}${swapNote}`;
  }

  const time = `${reps}${n} min`;
  if (use) {
    const split = effort ? ` (about ${fmtTime(ctx.paces[use][effort])}/500 m)` : '';
    return `${MACHINE_LABEL[use]}: ${time} ${EFFORT_WORDS[effort || 'easy']}${split}${swapNote}`;
  }
  if (has('bike')) return `Bike: ${time} ${EFFORT_WORDS[effort || 'easy']}${swapNote}`;
  return `Run: ${time} @ ${values[effort || 'easy']}${swapNote}`;
}

function simLines(splits, div, ctx, values) {
  const load = {
    push: ` @ ${div.push} kg`, pull: ` @ ${div.pull} kg`, farm: ` @ 2 x ${div.farm} kg`,
    lunge: ` @ ${div.bag} kg`, wb: ` @ ${div.wb} kg`,
  };
  return [
    'Each round: 1 km run @ {race}, then the station. Targets in brackets:',
    ...splits.perStation.map((s, i) => {
      const station = s.key === 'ski' || s.key === 'row' ? machineText(`${s.key}:1000m`, ctx, values) : `${s.name} ${s.dist}${load[s.key] || ''}`;
      return `${i + 1}. ${station} (${fmtTime(s.time)})`;
    }),
    `Keep transitions (Roxzone) brisk: about ${fmtTime(splits.roxzone / 16)} each.`,
  ];
}

function raceLines(splits) {
  return [
    `Target ${fmtTime(splits.goal)}: run each km around {race}`,
    `Stations: ${splits.perStation.map((s) => `${s.name} ${fmtTime(s.time)}`).join(', ')}`,
  ];
}

// ---------- day assignment ----------

const CALF_LINE = 'Calf raises 3 x 15 slow + tibialis raises 2 x 15 (tendon care)';
const WOD_NOTE_45 = '45+: stop at about 75% of the time cap and keep it smooth.';

/** Put sessions on the picked weekdays; long session last, avoid back-to-back hard days. */
export function assignSessions(sessions, days) {
  days = [...days].sort((a, b) => a - b);
  const longIdx = sessions.findIndex((s) => s.key === 'long');
  const long = sessions[longIdx];
  const rest = sessions.filter((_, i) => i !== longIdx);
  const slots = days.slice(0, -1);

  let best = null;
  for (const perm of permutations(rest.map((_, i) => i))) {
    const order = [...perm.map((i) => rest[i]), long];
    let clash = 0;
    for (let i = 0; i < days.length - 1; i++) {
      if (days[i + 1] - days[i] === 1 && order[i].effort === 'hard' && order[i + 1].effort === 'hard') clash++;
    }
    const moved = perm.reduce((sum, v, i) => sum + Math.abs(v - i), 0);
    const score = clash * 1000 + moved;
    if (!best || score < best.score) best = { score, clash, order };
  }
  const byDay = {};
  best.order.forEach((s, i) => { byDay[i < slots.length ? slots[i] : days[days.length - 1]] = s; });
  return { byDay, clash: best.clash };
}

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) yield [arr[i], ...p];
  }
}

/** Week sessions after the week 1 test, 5-day and 45+ adjustments. */
export function adjustSessions(week, { fiveDay, is45, testWeek = 1 }) {
  // Copies, so the shared session data is never changed. On 5-day plans the Wednesday WOD goes with the dropped session.
  let sessions = week.sessions.map((s) => ({ ...s, lines: [...s.lines], wod: s.wod && { ...s.wod } }));
  // Every plan opens with a 5k test (time + optional heart rate), also when a late start skips the early
  // weeks. Weeks 4 and 8 have their own; the taper (week 11+) gets no extra test.
  const opensWithTest = week.n === testWeek && week.n < 11 && !sessions.some((s) => s.test);
  if (opensWithTest) sessions = sessions.map((s) => (s.key === 'end' ? { ...HR_TEST, lines: [...HR_TEST.lines] } : s));
  if (fiveDay) {
    const rec = sessions.find((s) => s.key === 'rec');
    if (rec.movable) sessions.find((s) => s.key === 'skl').lines.push(...rec.lines);
    sessions = sessions.filter((s) => s.key !== 'rec');
  }
  if (is45) {
    const hard = sessions.filter((s) => s.effort === 'hard');
    const end = sessions.find((s) => s.key === 'end');
    if (hard.length > 2 && end.effort === 'hard') {
      end.effort = 'moderate';
      end.lines = end.lines.map((l) => l.replace(/\{(5k|thr)\}/g, '{steady}').replace(/:thr\}/g, ':steady}'));
      end.note = 'Easier for 45+: intervals at steady pace to keep two hard days this week.';
    }
    for (const s of sessions) {
      if (s.key === 'str' || /Strength/.test(s.label)) s.lines.push(CALF_LINE);
      if (s.wod) s.wod.note = WOD_NOTE_45;
    }
  }
  return sessions;
}

// ---------- plan ----------

export function buildPlan(inp, today = todayYmd()) {
  const div = DIVISIONS[inp.division];
  const goal = parseHM(inp.goal);
  const splits = computeSplits(goal);
  const paces = computePaces(splits, parseMS(normalizeTime(inp.fiveK)), inp.paceAdjust);
  const hr = hrProfile(inp);
  const equipment = Array.isArray(inp.equipment) ? inp.equipment : MACHINES;
  // Heart rate shows in the session lines only when the athlete gave us real numbers.
  const is45 = AGE_GROUPS.indexOf(inp.age) >= AGE_GROUPS.indexOf('45-49');
  const bodyWeight = Number(String(inp.bodyWeight ?? '').replace(',', '.')) || null;
  const ctx = { paces, div, hr: hr.source === 'estimate' ? null : hr, equipment, is45, bodyWeight };
  const days = [...inp.days].map(Number).sort((a, b) => a - b);
  const fiveDay = days.length === 5;

  const race = parseYmd(inp.raceDate);
  const todayMs = parseYmd(today);
  const week12 = mondayOf(race);
  const week1 = week12 - 77 * DAY;
  const currentWeek = Math.floor((mondayOf(todayMs) - week1) / (7 * DAY)) + 1;
  const firstWeek = Math.min(12, Math.max(1, currentWeek));

  const weeks = [];
  for (let n = firstWeek; n <= 12; n++) {
    const start = week1 + (n - 1) * 7 * DAY;
    const values = tokenValues(ctx, n);
    const dayList = [];
    let clash = 0;

    if (n < 12) {
      const src = WEEKS[n - 1];
      const sessions = adjustSessions(src, { fiveDay, is45, testWeek: firstWeek });
      const a = assignSessions(sessions, days);
      clash = a.clash;
      for (let d = 0; d < 7; d++) {
        const s = a.byDay[d];
        if (!s) { dayList.push(restDay(start + d * DAY)); continue; }
        const lines = s.sim ? [...s.lines, ...simLines(splits, div, ctx, values)] : s.lines;
        dayList.push(makeDay(start + d * DAY, n, s, lines, values, ctx));
      }
    } else {
      for (let d = 0; d < 7; d++) dayList.push(restDay(start + d * DAY));
    }
    weeks.push({
      n,
      phase: n <= 4 ? 1 : n <= 8 ? 2 : 3,
      phaseName: n === 12 ? 'Race week' : PHASES[n <= 4 ? 1 : n <= 8 ? 2 : 3],
      title: n === 12 ? 'Race Week!' : WEEKS[n - 1].title,
      start,
      end: start + 6 * DAY,
      label: `Week ${n} · ${fmtRange(start, start + 6 * DAY)}`,
      days: dayList,
      clash,
      current: n === currentWeek,
    });
  }

  // Race-week sessions are anchored to the race date and may reach back into week 11.
  const values12 = tokenValues(ctx, 12);
  for (const r of RACE_WEEK) {
    const date = race + r.offset * DAY;
    const wk = weeks.find((w) => date >= w.start && date <= w.end);
    if (!wk) continue;
    const idx = Math.round((date - wk.start) / DAY);
    const lines = r.race ? [...raceLines(splits), ...r.lines] : r.lines;
    wk.days[idx] = makeDay(date, 12, r, lines, values12, ctx);
  }
  // Week 11 days that fall in the last 3 days before the race become rest.
  for (const off of [-3, -2]) {
    const date = race + off * DAY;
    const wk = weeks.find((w) => w.n === 11 && date >= w.start && date <= w.end);
    if (wk) wk.days[Math.round((date - wk.start) / DAY)] = restDay(date);
  }

  const daysToRace = Math.round((race - todayMs) / DAY);
  return {
    inputs: { ...inp, days, equipment },
    division: div,
    hr,
    missingMachines: ['row', 'ski'].filter((k) => !equipment.includes(k)),
    is45,
    fiveDay,
    splits,
    paces,
    race,
    raceLabel: fmtLongDate(race),
    daysToRace,
    week1,
    today,
    currentWeek,
    preBlock: currentWeek < 1
      ? { weeksUntil: Math.ceil((week1 - todayMs) / (7 * DAY)), start: fmtLongDate(week1), lines: BEFORE_12_WEEKS.map((l) => fill(l, tokenValues(ctx, 1), ctx)) }
      : null,
    shortened: firstWeek > 1 ? { firstWeek, weeksLeft: 13 - firstWeek } : null,
    recoveryTips: is45 ? RECOVERY_TIPS_45 : null,
    weeks,
  };
}

const ZONE_TOKEN = /\{(easy|steady|thr|5k|race)\}/;

function makeDay(date, week, s, lines, values, ctx) {
  // A 5k test is run at 5k effort, even though its first line is the easy warm-up.
  const zone = s.test ? '5k' : lines.map((l) => ZONE_TOKEN.exec(l)?.[1]).find(Boolean);
  return {
    date,
    ymd: toYmd(date),
    weekday: WEEKDAYS[weekdayIdx(date)],
    key: `w${week}-${s.key}`,
    label: s.label,
    effort: s.effort,
    note: s.note || null,
    test: !!s.test,
    hrTest: !!s.hrTest,
    zone: zone === '5k' ? 'fiveK' : zone || null,
    lines: lines.map((l) => liftLine(fill(l, values, ctx), ctx)),
    wod: s.wod ? { title: s.wod.title, note: s.wod.note || null, lines: s.wod.lines.map((l) => fill(l, values, ctx)) } : null,
  };
}

function restDay(date) {
  return {
    date,
    ymd: toYmd(date),
    weekday: WEEKDAYS[weekdayIdx(date)],
    key: null,
    label: 'Rest',
    effort: 'rest',
    note: null,
    zone: null,
    lines: [],
    wod: null,
  };
}

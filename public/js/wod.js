// Workout of the Day: picking the day's workout from public/data/wods.json. Pure functions, no DOM.
import { parseYmd, toYmd, WEEKDAYS } from './plan.js';

/** Day 1 of the 365-day cycle (a Monday). */
export const START_DATE = '2026-11-02';
export const WOD_URL = 'data/wods.json';
export const MODES = ['solo', 'team'];

const DAY = 86400000;

/** Whole days from a to b (both "YYYY-MM-DD", read as dates, so time zones never shift it). */
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / DAY);

/** Index into workouts[] for a local date; wraps every 365 days, also before the start date. */
export function wodIndex(ymd, start = START_DATE) {
  return ((daysBetween(start, ymd) % 365) + 365) % 365;
}

export function workoutFor(data, ymd) {
  return data.workouts[wodIndex(ymd)];
}

/** Monday..Sunday of the week containing ymd, as [{ ymd, weekday, date }]. */
export function weekDates(ymd) {
  const ms = parseYmd(ymd);
  const monday = ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
  return WEEKDAYS.map((weekday, i) => {
    const d = toYmd(monday + i * DAY);
    return { ymd: d, weekday, date: Number(d.slice(8)) };
  });
}

export const addDays = (ymd, n) => toYmd(parseYmd(ymd) + n * DAY);

/** The user's saved choice wins; before they ever tap the toggle, each workout opens in the mode it was written for. */
export const pickMode = (workout, savedMode) => (MODES.includes(savedMode) ? savedMode : workout.defaultMode);

/** Result document id, as in Firestore: users/{uid}/wodResults/{day}-{mode}. */
export const resultId = (day, mode) => `${day}-${mode}`;

/** Benchmark results grouped by title and mode, oldest first in each group. */
export function groupBenchmarks(results) {
  const groups = new Map();
  for (const r of Object.values(results || {})) {
    if (!r?.benchmark) continue;
    const key = `${r.title} · ${r.mode === 'team' ? 'Team of 2' : 'Solo'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const list of groups.values()) list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([title, items]) => ({ title, items }));
}

let cache = null;
/** Fetch the library once per page load. */
export function loadWods(fetchFn = fetch) {
  if (!cache) {
    cache = fetchFn(WOD_URL).then((r) => {
      if (!r.ok) throw new Error(`WODs ${r.status}`);
      return r.json();
    });
    cache.catch(() => { cache = null; }); // allow a retry after a failed load
  }
  return cache;
}

// ---------- leaderboard ----------

/**
 * How a workout is ranked, from its scoring text.
 * time: lower is better (mm:ss). rounds: rounds + reps, higher is better. count: a number, higher is better.
 * null: not ranked (recovery, technique and easy days, where racing would defeat the purpose).
 */
export function scoreType(version) {
  const s = String(version?.scoring || '');
  if (/^None|^Average pace|easy effort/i.test(s)) return null;
  if (/^Time|^Slowest round|slowest one/i.test(s)) return { kind: 'time', better: 'lower', label: 'Time', hint: 'mm:ss, e.g. 41:20. Hit the cap? Enter the cap time.' };
  if (/rounds \+ reps/i.test(s)) return { kind: 'rounds', better: 'higher', label: 'Rounds + reps', hint: 'Full rounds and extra reps' };
  const unit = /calories/i.test(s) ? 'cal' : /metres/i.test(s) ? 'm' : /^Rounds completed/i.test(s) ? 'rounds' : 'reps';
  return { kind: 'count', better: 'higher', unit, label: `Total ${unit === 'cal' ? 'calories' : unit === 'm' ? 'metres' : unit}`, hint: s };
}

/** "41:20" or "1:02:05" -> seconds; null if not a time. */
export function parseClock(str) {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)\s*$/.exec(str || '');
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3];
}

const fmtClock = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/**
 * Turn what the athlete typed into a sortable score.
 * input: { time } | { rounds, reps } | { count }. Returns { value, display } or { error }.
 */
export function parseScore(type, input) {
  if (!type) return { error: 'This workout is not ranked.' };
  if (type.kind === 'time') {
    const sec = parseClock(input.time);
    if (sec == null || sec < 60 || sec > 3 * 3600) return { error: 'Enter your time as minutes:seconds, e.g. 41:20.' };
    return { value: sec, display: fmtClock(sec) };
  }
  if (type.kind === 'rounds') {
    const rounds = Number(input.rounds || 0), reps = Number(input.reps || 0);
    if (!Number.isInteger(rounds) || !Number.isInteger(reps) || rounds < 0 || reps < 0 || rounds > 200 || reps > 999 || rounds + reps === 0) {
      return { error: 'Enter whole numbers for rounds and reps.' };
    }
    return { value: rounds * 1000 + reps, display: reps ? `${rounds} rounds + ${reps}` : `${rounds} rounds` };
  }
  const n = Number(input.count);
  if (!Number.isInteger(n) || n <= 0 || n > 100000) return { error: 'Enter a whole number.' };
  return { value: n, display: `${n} ${type.unit}` };
}

/** Leaderboard id: one board per calendar day and version, so everyone doing today's WOD is compared. */
export const boardId = (ymd, mode) => `${ymd}-${mode}`;

const RESERVED = new Set(['admin', 'administrator', 'support', 'moderator', 'mod', 'staff', 'root', 'system', 'null', 'undefined',
  'hybrid', 'hybridplanbuilder', 'hybridprog', 'info', 'help', 'hyrox', 'official', 'coach']);

/** Usernames: 3-20 letters, numbers, dot, dash or underscore. Unique ignoring case. */
export function checkUsername(name) {
  const n = String(name || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,20}$/.test(n)) return { error: 'Use 3 to 20 letters, numbers, dots, dashes or underscores.' };
  if (!/[A-Za-z0-9]/.test(n)) return { error: 'Include at least one letter or number.' };
  const key = n.toLowerCase();
  if (RESERVED.has(key)) return { error: 'That username is reserved. Please pick another.' };
  return { name: n, key };
}

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

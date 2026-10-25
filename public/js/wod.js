// Workout of the Day: picking the day's workout from public/data/wods.json. Pure functions, no DOM.
import { parseYmd, toYmd, todayYmd, WEEKDAYS } from './plan.js';

/** Day 1 of the 365-day cycle (a Monday). */
export const START_DATE = '2026-11-02';
export const WOD_URL = '/data/wods.json';
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

/** Subscribers see only the current week: any other date is pulled back to today. */
export const clampToWeek = (ymd, today) => (weekDates(today).some((d) => d.ymd === ymd) ? ymd : today);

/** Next week's workouts open on Sunday at this hour, local time. */
export const RELEASE_HOUR = 18;

/** A date in the week to show: today, or next Monday from Sunday 6 pm on. */
export function wodWeekAnchor(now = new Date()) {
  const today = todayYmd(now);
  return now.getDay() === 0 && now.getHours() >= RELEASE_HOUR ? addDays(today, 1) : today;
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

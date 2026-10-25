// Browser storage for the last inputs, the 5k test logs and the WOD mode.
// Every access is wrapped: storage can be blocked (private windows, previews).

const INPUTS_KEY = 'hyrox:inputs';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: it lives for this visit only */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

/** One plan per race date, so tweaking pace or days keeps the logs. */
export const planIdFor = (inputs) => `race-${inputs.raceDate}`;

export const loadInputs = () => read(INPUTS_KEY, null);

// kg or lb for this device, used by the WOD page and as the default for a new plan.
// fallback: what to use when nothing was picked on this device yet.
const UNITS_KEY = 'hyrox:units';
export const getUnits = (fallback = 'kg') => {
  const u = read(UNITS_KEY, fallback);
  return u === 'kg' || u === 'lb' ? u : fallback;
};
export const setUnits = (units) => write(UNITS_KEY, units);

// The products ('plan', 'wod') the signed-in user owned last time, so a page can show "loading"
// instead of flashing its buy card while sign-in and purchases load. Cleared on sign-out.
const ACCESS_KEY = 'hyrox:access';
export const getAccessHint = () => {
  const v = read(ACCESS_KEY, []);
  return Array.isArray(v) ? v : [];
};
export const setAccessHint = (products) => (products.length ? write(ACCESS_KEY, products) : remove(ACCESS_KEY));
export const saveInputs = (inputs) => write(INPUTS_KEY, inputs);
export const clearInputs = () => remove(INPUTS_KEY);

// 5k test logs, cached per user so accounts on a shared device never mix: { "w1-end": { fiveK, hr? } }.
const LOGS_PREFIX = 'hyrox:logs:';
const logsKey = (uid, planId) => `${LOGS_PREFIX}${uid}:${planId}`;

export const getLogs = (uid, planId) => (uid ? read(logsKey(uid, planId), {}) : {});

export function replaceLogs(uid, planId, logs) {
  write(logsKey(uid, planId), logs);
}

export const clearLogs = (uid, planId) => uid && remove(logsKey(uid, planId));

// Workout of the Day: the Solo/Team choice, cached per user.
const wodModeKey = (uid) => `hyrox:wodMode:${uid}`;

export const getWodMode = (uid) => (uid ? read(wodModeKey(uid), null) : null);
export const setWodMode = (uid, mode) => uid && write(wodModeKey(uid), mode);

/** Remove everything this site stored for a user on this device (after account deletion). */
export function forgetUser(uid) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('hyrox:') && k.includes(uid)) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

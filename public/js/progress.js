// Browser storage for the last inputs and the done checkboxes.
// Every access is wrapped: storage can be blocked (private windows, previews).

const INPUTS_KEY = 'hyrox:inputs';
const DONE_PREFIX = 'hyrox:done:';

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
    /* storage unavailable: progress lives for this visit only */
  }
}

/** One plan per race date, so tweaking pace or days keeps the ticks. */
export const planIdFor = (inputs) => `race-${inputs.raceDate}`;

export const loadInputs = () => read(INPUTS_KEY, null);
export const saveInputs = (inputs) => write(INPUTS_KEY, inputs);

// Ticks are signed-in only and cached per user, so accounts on a shared device never mix.
const doneKey = (uid, planId) => `${DONE_PREFIX}${uid}:${planId}`;

export const getDone = (uid, planId) => (uid ? read(doneKey(uid, planId), {}) : {});

export function setDone(uid, planId, key, value) {
  const done = getDone(uid, planId);
  if (value) done[key] = true;
  else delete done[key];
  write(doneKey(uid, planId), done);
  return done;
}

export function replaceDone(uid, planId, done) {
  write(doneKey(uid, planId), done);
}

// Heart-rate logs, cached per user like the ticks: { "w3-end": { hr, feel, fiveK? } }.
const LOGS_PREFIX = 'hyrox:logs:';
const logsKey = (uid, planId) => `${LOGS_PREFIX}${uid}:${planId}`;

export const getLogs = (uid, planId) => (uid ? read(logsKey(uid, planId), {}) : {});

export function replaceLogs(uid, planId, logs) {
  write(logsKey(uid, planId), logs);
}

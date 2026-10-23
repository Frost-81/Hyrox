import { AGE_GROUPS, WEEKDAYS, DIVISIONS, MACHINES, buildPlan, validateInputs, todayYmd, normalizeTime, maskTime } from './plan.js';
import { summaryCard, splitsCard, pacesCard, swapCard, suggestionCards, noticeCards, glossaryCard, weekCards } from './render.js';
import {
  planIdFor, loadInputs, saveInputs, getDone, setDone, replaceDone, getLogs, replaceLogs,
  getWodMode, setWodMode, getWodResults, replaceWodResults, forgetUser,
} from './progress.js';
import { suggest, applySuggestion, fmtZone } from './hr.js';
import { loadWods, workoutFor, weekDates, addDays, pickMode, resultId, groupBenchmarks, scoreType, parseScore, boardId, checkUsername } from './wod.js';
import { weekStrip, wodCard, planNote, infoPanel, benchmarkHistory, todayTeaser, lockedWod, leaderboardCard } from './wodRender.js';
import { canUse } from './billing.js';
import * as cloud from './cloud.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#plan-form');
const dialog = $('#auth-dialog');

const state = {
  plan: null,
  suggestions: [],
  planId: null,
  user: null,
  tier: 'free',
  cloudPlans: [],
  authAvailable: true,
  saveAfterSignIn: false,
  createMode: false,
  profile: null, // { username, usernameKey } once chosen
};

const wod = { data: null, ymd: todayYmd(), savedMode: null, results: {} };
let stopTier = () => {};
let authKnown = false; // until Firebase reports, don't flash the signed-out WOD view

const uid = () => state.user?.uid || null;
const access = (feature) => canUse(feature, { user: state.user, tier: state.tier });

// ---------- form ----------

function setupForm() {
  $('#age').innerHTML = AGE_GROUPS.map((a) => `<option value="${a}"${a === '30-34' ? ' selected' : ''}>${a}</option>`).join('');
  $('#day-chips').innerHTML = WEEKDAYS.map((d, i) => `
    <label class="chip"><input type="checkbox" name="days" value="${i}"${i < 6 ? ' checked' : ''}><span>${d}</span></label>`).join('');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  $('#raceDate').min = todayYmd(tomorrow);
}

function readForm() {
  const fd = new FormData(form);
  const inp = {
    raceDate: fd.get('raceDate'),
    goal: normalizeTime(fd.get('goal')),
    division: fd.get('division'),
    age: fd.get('age'),
    fiveK: normalizeTime(fd.get('fiveK')),
    days: fd.getAll('days').map(Number),
    equipment: fd.getAll('equipment'),
    bodyWeight: String(fd.get('bodyWeight') || '').trim(),
  };
  const prev = state.plan?.inputs || loadInputs();
  // Heart-rate values now come from the 5k tests, not the form; they describe the athlete, so keep them.
  if (prev?.maxHR) inp.maxHR = prev.maxHR;
  if (prev?.hr5k) inp.hr5k = prev.hr5k;
  // Changes applied from heart-rate logs belong to this race's plan, so keep them on a rebuild.
  if (prev && planIdFor(prev) === planIdFor(inp)) {
    if (prev.paceAdjust) inp.paceAdjust = prev.paceAdjust;
    if (prev.dismissed) inp.dismissed = prev.dismissed;
  }
  return inp;
}

const TEXT_FIELDS = ['raceDate', 'goal', 'division', 'age', 'fiveK', 'bodyWeight'];

function fillForm(inp) {
  for (const k of TEXT_FIELDS) form.elements[k].value = inp[k] ?? '';
  const setChecks = (name, values) => {
    for (const el of form.querySelectorAll(`input[name="${name}"]`)) el.checked = values.includes(el.value) || values.includes(Number(el.value));
  };
  if (Array.isArray(inp.days)) setChecks('days', inp.days);
  setChecks('equipment', Array.isArray(inp.equipment) ? inp.equipment : MACHINES);
  updateDoublesHint();
}

function updateDoublesHint() {
  $('#doubles-hint').hidden = !DIVISIONS[form.elements.division.value]?.doubles;
}
form.elements.division.addEventListener('change', updateDoublesHint);

/** Once a plan exists, the form becomes the place to change it. */
function updateFormMode() {
  const has = !!state.plan;
  $('#form-title').textContent = has ? 'Update your plan' : 'Your details';
  $('#build-btn').textContent = has ? 'Update my plan' : 'Build my plan';
  $('#form-hint').hidden = !has;
}

// Phones have no ":" on the number pad: "130" becomes "1:30" as you type.
document.addEventListener('input', (e) => {
  if (!e.target.matches?.('input[data-time]')) return;
  const next = maskTime(e.target.value);
  if (next !== e.target.value) {
    e.target.value = next;
    e.target.setSelectionRange?.(next.length, next.length);
  }
});

// "25" becomes "25:00" (and "1" becomes "1:00") when the field loses focus.
document.addEventListener('focusout', (e) => {
  if (e.target.matches?.('input[data-time]')) e.target.value = normalizeTime(e.target.value);
});

function showErrors(errors) {
  for (const el of form.querySelectorAll('[data-error-for]')) {
    const msg = errors[el.dataset.errorFor] || '';
    el.textContent = msg;
    const input = form.elements[el.dataset.errorFor];
    if (input && input.setAttribute) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = readForm();
  const errors = validateInputs(inp);
  showErrors(errors);
  if (Object.keys(errors).length) {
    form.querySelector('[aria-invalid="true"], .chips')?.focus?.();
    return;
  }
  const updating = !!state.plan;
  saveInputs(inp);
  build(inp);
  $('#results').scrollIntoView({ behavior: 'smooth' });
  if (updating) toast('Plan updated. Your ticks and logs are kept.');
  if (state.user) syncCurrentPlan({ quiet: true });
});

// ---------- plan ----------

function build(inp) {
  state.plan = buildPlan(inp);
  state.planId = planIdFor(inp);
  render();
  updateFormMode();
}

/** Signed out: a preview (summary + first week). Signed in: the full plan with ticks, logs and suggestions. */
function render() {
  const { plan } = state;
  if (!plan) return;
  const locked = !access('fullPlan');
  const done = getDone(uid(), state.planId);
  const logs = getLogs(uid(), state.planId);
  state.suggestions = locked ? [] : suggest(plan, logs, plan.inputs.dismissed);
  $('#suggestions-out').innerHTML = suggestionCards(state.suggestions);
  $('#plan-out').innerHTML = summaryCard(plan) + noticeCards(plan) + splitsCard(plan) + pacesCard(plan) + swapCard(plan) + glossaryCard();
  $('#weeks-out').innerHTML = weekCards(plan, done, { locked, logs });
  $('#print-btn').hidden = locked;
  $('#results').hidden = false;
  updateSaveButton();
}

/** Rebuild after an input change, keeping open weeks open. */
function rebuild(inputs) {
  const openWeeks = [...document.querySelectorAll('details.week[open]')].map((d) => d.id);
  saveInputs(inputs);
  fillForm(inputs);
  build(inputs);
  for (const id of openWeeks) document.getElementById(id)?.setAttribute('open', '');
  syncCurrentPlan({ quiet: true });
}

function updateWeekCount(weekEl) {
  const boxes = weekEl.querySelectorAll('input[type="checkbox"]');
  const n = [...boxes].filter((b) => b.checked).length;
  weekEl.querySelector('.week-count').textContent = `${n}/${boxes.length} done`;
}

$('#weeks-out').addEventListener('change', (e) => {
  const box = e.target.closest('input[type="checkbox"][data-key]');
  if (!box) return;
  if (!state.user) return;
  const done = setDone(uid(), state.planId, box.dataset.key, box.checked);
  updateWeekCount(box.closest('details.week'));
  if (isSaved()) cloud.queueProgress(uid(), state.planId, done, getLogs(uid(), state.planId));
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-unlock]')) openAuth(true);
});

$('#weeks-out').addEventListener('click', (e) => {
  const logBtn = e.target.closest('[data-log]');
  if (logBtn) openLog(logBtn.dataset.log);
});

// ---------- session logs and 5k tests ----------

const logDialog = $('#log-dialog');
let loggingKey = null;

function findDay(key) {
  for (const w of state.plan.weeks) for (const d of w.days) if (d.key === key) return { w, d };
  return null;
}

function openLog(key) {
  const found = findDay(key);
  if (!found || !state.user) return;
  const { w, d } = found;
  loggingKey = key;
  const log = getLogs(uid(), state.planId)[key] || {};
  $('#log-session').textContent = `Week ${w.n} · ${d.weekday} · ${d.label}`;
  $('#log-fivek-field').hidden = !d.test;
  $('#log-fivek').value = log.fiveK || '';
  $('#log-hr').value = log.hr || '';
  const hrZone = d.zone && state.plan.hr[d.zone];
  $('#log-zone').textContent = d.test
    ? 'Your average from your watch for the 5 km. It sets your heart-rate zones.'
    : hrZone ? `Target for this session: ${fmtZone(hrZone)} bpm.` : 'Your average from your watch for the whole session.';
  for (const r of logDialog.querySelectorAll('input[name="feel"]')) r.checked = r.value === (log.feel || 'ok');
  $('#log-error').textContent = '';
  logDialog.showModal();
}

$('#log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const hr = $('#log-hr').value.trim();
  const fiveK = normalizeTime($('#log-fivek').value);
  const isTest = !$('#log-fivek-field').hidden;
  if (hr && !(Number(hr) >= 60 && Number(hr) <= 230)) { $('#log-error').textContent = 'Heart rate should be between 60 and 230.'; return; }
  if (isTest && fiveK && !/^\d{1,2}:[0-5]\d$/.test(fiveK)) { $('#log-error').textContent = 'Use minutes:seconds for the 5k, e.g. 24:30.'; return; }

  // A 5k test updates the plan right away (with Undo).
  let next = null;
  if (isTest && fiveK) {
    const s = { id: `test:${loggingKey}:${fiveK}:${hr || ''}`, apply: { kind: 'test', fiveK, hr5k: hr ? Number(hr) : null } };
    next = applySuggestion(state.plan.inputs, s);
    const errors = validateInputs(next);
    if (errors.fiveK || errors.hr5k) { $('#log-error').textContent = errors.fiveK || errors.hr5k; return; }
  }

  const entry = { feel: logDialog.querySelector('input[name="feel"]:checked')?.value || 'ok' };
  if (hr) entry.hr = Number(hr);
  if (isTest && fiveK) entry.fiveK = fiveK;
  const logs = { ...getLogs(uid(), state.planId), [loggingKey]: entry };
  replaceLogs(uid(), state.planId, logs);
  const done = setDone(uid(), state.planId, loggingKey, true);
  if (isSaved()) cloud.queueProgress(uid(), state.planId, done, logs);
  logDialog.close();

  if (next) {
    const before = state.plan.inputs;
    rebuild(next);
    toast(`Paces updated from your 5k test (${fiveK}${hr ? `, ${hr} bpm` : ''}).`, {
      action: 'Undo',
      onAction: () => { rebuild(before); toast('Back to your previous paces.'); },
    });
    return;
  }
  const openWeeks = [...document.querySelectorAll('details.week[open]')].map((d) => d.id);
  render();
  for (const id of openWeeks) document.getElementById(id)?.setAttribute('open', '');
  toast(state.suggestions.length ? 'Logged. We have a suggestion for your plan at the top.' : 'Logged.');
});

$('#suggestions-out').addEventListener('click', (e) => {
  const applyBtn = e.target.closest('[data-apply]');
  const dismissBtn = e.target.closest('[data-dismiss]');
  if (!applyBtn && !dismissBtn) return;
  const id = (applyBtn || dismissBtn).dataset[applyBtn ? 'apply' : 'dismiss'];
  const s = state.suggestions.find((x) => x.id === id);
  if (!s) return;
  const inputs = applyBtn
    ? applySuggestion(state.plan.inputs, s)
    : { ...state.plan.inputs, dismissed: [...(state.plan.inputs.dismissed || []), id] };
  saveInputs(inputs);
  fillForm(inputs);
  build(inputs);
  syncCurrentPlan({ quiet: true });
  toast(applyBtn ? 'Plan updated.' : 'Okay, we will keep your plan as it is.');
});

// ---------- toolbar ----------

$('#today-btn').addEventListener('click', () => {
  const today = todayYmd();
  const el = document.querySelector(`.day[data-ymd="${today}"]`);
  if (!el) {
    if (!access('fullPlan') && state.plan.weeks.some((w) => w.days.some((d) => d.ymd === today))) {
      toast('Sign in to see your full plan.');
      document.querySelector('.unlock')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const first = document.querySelector('details.week');
    toast(state.plan.currentWeek < 1 ? 'Your 12 weeks have not started yet. Here is week 1.' : 'No session today.');
    if (first) { first.open = true; first.scrollIntoView({ behavior: 'smooth' }); }
    return;
  }
  el.closest('details').open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
});

$('#edit-btn').addEventListener('click', () => {
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.focus({ preventScroll: true });
});

let openBeforePrint = [];
window.addEventListener('beforeprint', () => {
  openBeforePrint = [...document.querySelectorAll('details')].map((d) => d.open);
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details').forEach((d, i) => { d.open = openBeforePrint[i] ?? d.open; });
});
$('#print-btn').addEventListener('click', () => window.print());

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#save-btn').addEventListener('click', () => {
  if (state.user) syncCurrentPlan({ quiet: false });
  else openAuth(true);
});

// ---------- Plan / WOD views ----------

function route() {
  const isWod = location.hash === '#wod';
  $('#plan-view').hidden = isWod;
  $('#wod-view').hidden = !isWod;
  document.body.classList.toggle('wod-mode', isWod);
  for (const a of document.querySelectorAll('[data-tab]')) {
    if (a.dataset.tab === (isWod ? 'wod' : 'plan')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (isWod) {
    window.scrollTo(0, 0);
    showWod();
  }
}
window.addEventListener('hashchange', route);

async function getWods() {
  wod.data = await loadWods();
  return wod.data;
}

async function showWod() {
  const out = $('#wod-out');
  if (!authKnown) return; // "Loading…" stays until sign-in state is known
  if (!access('wod')) {
    out.innerHTML = lockedWod();
    return;
  }
  try {
    await getWods();
    renderWod();
  } catch (err) {
    console.error(err);
    out.innerHTML = '<p class="error">The workouts could not be loaded. Check your connection and try again.</p>';
  }
}

function currentWorkout() {
  const w = workoutFor(wod.data, wod.ymd);
  return { w, mode: pickMode(w, wod.savedMode) };
}

function planDayOn(ymd) {
  if (!state.plan || !access('fullPlan')) return null;
  for (const wk of state.plan.weeks) for (const d of wk.days) if (d.ymd === ymd) return d;
  return null;
}

function renderWod() {
  if (!wod.data || $('#wod-view').hidden) return;
  const { w, mode } = currentWorkout();
  const today = todayYmd();
  const result = wod.results[resultId(w.day, mode)] || null;
  $('#wod-out').innerHTML = weekStrip(weekDates(wod.ymd), wod.ymd, today)
    + wodCard(w, mode, wod.ymd, { result, today })
    + '<div id="leaderboard-out"></div>'
    + planNote(planDayOn(wod.ymd))
    + benchmarkHistory(groupBenchmarks(wod.results))
    + infoPanel(wod.data.meta);
  renderLeaderboard();
}

// ---------- leaderboard ----------

let boardRequest = 0;

async function renderLeaderboard() {
  const el = $('#leaderboard-out');
  if (!el) return;
  const { w, mode } = currentWorkout();
  const type = scoreType(w[mode]);
  const base = { type, mode, myUid: uid(), username: state.profile?.username, isFuture: wod.ymd > todayYmd() };
  const req = ++boardRequest; // any slower request for another day or mode is now stale
  el.innerHTML = leaderboardCard({ ...base, loading: true });
  if (!type || base.isFuture) { el.innerHTML = leaderboardCard(base); return; }
  try {
    const data = await cloud.getLeaderboard(boardId(wod.ymd, mode), type.better, uid());
    if (req !== boardRequest) return; // the user moved on to another day or mode
    $('#leaderboard-out').innerHTML = leaderboardCard({ ...base, data });
  } catch (err) {
    console.warn('Leaderboard:', err);
    if (req === boardRequest) $('#leaderboard-out').innerHTML = leaderboardCard({ ...base, error: true });
  }
}

// ---------- usernames ----------

const usernameDialog = $('#username-dialog');
let afterUsername = null;

function updateAccountUsername() {
  const name = state.profile?.username;
  $('#account-username').hidden = !name;
  $('#account-username').textContent = name ? `Username: ${name}` : '';
  $('#username-btn').hidden = !state.user || !!name;
}

/** Ask for a username; then() runs once one is saved. */
function openUsername(then = null) {
  if (!state.user || state.profile) { then?.(); return; }
  afterUsername = then;
  $('#username-error').textContent = '';
  usernameDialog.showModal();
}

$('#username-btn').addEventListener('click', () => { $('#account-menu').open = false; openUsername(); });
$('#username-later').addEventListener('click', () => usernameDialog.close());
// However the dialog closes, carry on with what was waiting (a skipped username just means the score stays private).
usernameDialog.addEventListener('close', () => {
  const then = afterUsername;
  afterUsername = null;
  then?.();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-choose-username]')) openUsername(() => renderLeaderboard());
});

$('#username-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const check = checkUsername($('#username').value);
  const err = $('#username-error');
  if (check.error) { err.textContent = check.error; return; }
  const btn = $('#username-submit');
  btn.disabled = true;
  err.textContent = '';
  try {
    if (!(await cloud.isUsernameFree(check.key))) { err.textContent = 'That username is taken. Please pick another.'; return; }
    state.profile = await cloud.claimUsername(uid(), check.name, check.key);
    updateAccountUsername();
    usernameDialog.close();
    toast(`Welcome, ${check.name}!`);
    const then = afterUsername;
    afterUsername = null;
    then?.();
    renderLeaderboard();
  } catch (error) {
    err.textContent = error.code === 'username-taken' ? 'That username is taken. Please pick another.' : 'Could not save your username. Please try again.';
  } finally {
    btn.disabled = false;
  }
});

/** The small card on the plan page (signed in only). */
async function renderTeaser() {
  const el = $('#wod-teaser');
  if (!access('wod')) { el.innerHTML = ''; return; }
  try {
    const data = await getWods();
    const w = workoutFor(data, todayYmd());
    el.innerHTML = todayTeaser(w, pickMode(w, wod.savedMode));
  } catch {
    el.innerHTML = '';
  }
}

$('#wod-out').addEventListener('click', (e) => {
  const day = e.target.closest('[data-wod-day]');
  const week = e.target.closest('[data-wod-week]');
  const mode = e.target.closest('[data-wod-mode]');
  if (day) { wod.ymd = day.dataset.wodDay; renderWod(); return; }
  if (week) { wod.ymd = addDays(wod.ymd, 7 * Number(week.dataset.wodWeek)); renderWod(); return; }
  if (mode) { setMode(mode.dataset.wodMode); return; }
  if (e.target.closest('[data-wod-copy]')) { copyWod(); return; }
  if (e.target.closest('[data-wod-log]')) openWodLog();
});

function setMode(m) {
  wod.savedMode = m;
  setWodMode(uid(), m);
  renderWod();
  renderTeaser();
  if (state.user) cloud.saveWodMode(uid(), m).catch((err) => console.warn('Could not save WOD mode:', err));
}

async function copyWod() {
  const { w, mode } = currentWorkout();
  try {
    await navigator.clipboard.writeText(`${w.title}\n${w[mode].text}`);
    toast('Workout copied.');
  } catch {
    toast('Could not copy. Select the text and copy it instead.');
  }
}

const wodLogDialog = $('#wod-log-dialog');
const wodLogForm = $('#wod-log-form');

function selectedWodLogMode() {
  return wodLogForm.querySelector('input[name="wod-mode"]:checked')?.value || 'solo';
}

/** Show the score fields that fit this workout: a time, rounds + reps, a count, or free text when it isn't ranked. */
function fillWodLog() {
  const { w } = currentWorkout();
  const mode = selectedWodLogMode();
  const type = scoreType(w[mode]);
  const r = wod.results[resultId(w.day, mode)] || {};
  const kind = type ? type.kind : 'text';
  for (const el of wodLogForm.querySelectorAll('[data-score]')) el.hidden = el.dataset.score !== kind;
  $('#wod-score-hint').textContent = type ? `Score: ${w[mode].scoring}` : 'No score to rank today: this session is about quality.';
  $('#wod-count-label').textContent = type?.kind === 'count' ? type.label : 'Total';
  const sameKind = r.kind === kind;
  $('#wod-time').value = sameKind && kind === 'time' ? r.score : '';
  $('#wod-rounds').value = sameKind && kind === 'rounds' ? Math.floor(r.value / 1000) : '';
  $('#wod-reps').value = sameKind && kind === 'rounds' ? r.value % 1000 || '' : '';
  $('#wod-count').value = sameKind && kind === 'count' ? r.value : '';
  $('#wod-score').value = kind === 'text' ? r.score || '' : '';
  const canShare = !!type && wod.ymd <= todayYmd();
  $('#wod-share-row').hidden = !canShare;
  $('#wod-share').checked = canShare && (r.shared ?? true);
  $('#wod-share-text').textContent = state.profile
    ? `Show my score on this day's ${mode === 'team' ? 'Team of 2' : 'Solo'} leaderboard as ${state.profile.username}`
    : `Show my score on this day's ${mode === 'team' ? 'Team of 2' : 'Solo'} leaderboard (you'll pick a username)`;
  $('#wod-partner').value = r.partner || '';
  $('#wod-weight').value = r.weight || '';
  $('#wod-notes').value = r.notes || '';
  $('#wod-partner-field').hidden = selectedWodLogMode() !== 'team';
}

function openWodLog() {
  if (!access('wodLog')) { openAuth(false); return; }
  const { w, mode } = currentWorkout();
  $('#wod-log-title').textContent = `Day ${w.day} · ${w.title}`;
  for (const r of wodLogForm.querySelectorAll('input[name="wod-mode"]')) r.checked = r.value === mode;
  fillWodLog();
  $('#wod-log-error').textContent = '';
  wodLogDialog.showModal();
}

wodLogForm.addEventListener('change', (e) => {
  if (e.target.name === 'wod-mode') fillWodLog();
});

wodLogForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { w } = currentWorkout();
  const mode = selectedWodLogMode();
  const type = scoreType(w[mode]);
  const result = { day: w.day, mode, title: w.title, benchmark: !!w.benchmark, date: wod.ymd };
  if (type) {
    const parsed = parseScore(type, { time: $('#wod-time').value, rounds: $('#wod-rounds').value, reps: $('#wod-reps').value, count: $('#wod-count').value });
    if (parsed.error) { $('#wod-log-error').textContent = parsed.error; return; }
    Object.assign(result, { score: parsed.display, value: parsed.value, kind: type.kind, shared: $('#wod-share').checked && wod.ymd <= todayYmd() });
  } else {
    result.score = $('#wod-score').value.trim() || 'Done';
  }
  const optional = { partner: mode === 'team' ? $('#wod-partner').value.trim() : '', weight: $('#wod-weight').value.trim(), notes: $('#wod-notes').value.trim() };
  for (const [k, v] of Object.entries(optional)) if (v) result[k] = v;

  // Sharing needs a username first.
  if (result.shared && !state.profile) {
    wodLogDialog.close();
    openUsername(() => saveWodLog(w, result));
    return;
  }
  wodLogDialog.close();
  saveWodLog(w, result);
});

async function saveWodLog(w, result) {
  if (result.shared && !state.profile) result.shared = false; // the user skipped choosing a username
  const id = resultId(w.day, result.mode);
  const before = wod.results[id];
  wod.results = { ...wod.results, [id]: result };
  replaceWodResults(uid(), wod.results);
  renderWod();
  try {
    await cloud.saveWodResult(uid(), id, result);
    const board = boardId(result.date, result.mode);
    if (result.shared) {
      await cloud.postScore(uid(), board, { username: state.profile.username, value: result.value, display: result.score, kind: result.kind, day: w.day, title: w.title });
      toast('Result saved and added to the leaderboard.');
    } else {
      if (before?.shared && before.date === result.date) await cloud.removeScore(uid(), board).catch(() => {});
      toast('Result saved.');
    }
    renderLeaderboard();
  } catch (err) {
    console.warn(err);
    toast('Saved on this device. It will sync to your account next time you sign in.');
  }
}

/** Merge the device cache with the account, then push anything that only exists on this device. */
async function loadWodData() {
  wod.savedMode = getWodMode(uid());
  wod.results = getWodResults(uid());
  try {
    const [settings, remote] = await Promise.all([cloud.getSettings(uid()), cloud.listWodResults(uid())]);
    if (settings.wodMode) wod.savedMode = settings.wodMode;
    else if (wod.savedMode) cloud.saveWodMode(uid(), wod.savedMode).catch(() => {});
    setWodMode(uid(), wod.savedMode);
    for (const [id, r] of Object.entries(wod.results)) if (!remote[id]) cloud.saveWodResult(uid(), id, r).catch(() => {});
    wod.results = { ...wod.results, ...remote };
    replaceWodResults(uid(), wod.results);
  } catch (err) {
    console.warn('Could not load WOD settings:', err);
  }
}

// ---------- accounts ----------

const isSaved = () => state.cloudPlans.some((p) => p.id === state.planId);

function updateSaveButton() {
  const btn = $('#save-btn');
  const saved = state.user && isSaved();
  btn.textContent = !state.user ? 'Sign in to save' : saved ? 'Saved ✓' : 'Save my plan';
  btn.disabled = !!saved;
}

/** Save the current plan to the account and merge progress both ways. */
async function syncCurrentPlan({ quiet }) {
  if (!state.user || !state.plan) return;
  try {
    const merged = await cloud.savePlan(uid(), state.planId, cleanInputs(state.plan.inputs), getDone(uid(), state.planId), getLogs(uid(), state.planId));
    replaceDone(uid(), state.planId, merged.done);
    replaceLogs(uid(), state.planId, merged.logs);
    await refreshPlanList();
    render();
    if (!quiet) toast('Plan saved to your account.');
  } catch (err) {
    console.error(err);
    toast('Could not save your plan right now. Your progress is still kept on this device.');
  }
}

async function refreshPlanList() {
  state.cloudPlans = await cloud.listPlans(state.user.uid);
  const picker = $('#plan-picker');
  picker.hidden = state.cloudPlans.length < 2;
  picker.innerHTML = state.cloudPlans.map((p) =>
    `<option value="${p.id}"${p.id === state.planId ? ' selected' : ''}>Race ${p.inputs.raceDate} · ${p.inputs.goal}</option>`).join('');
}

$('#plan-picker').addEventListener('change', (e) => {
  const p = state.cloudPlans.find((x) => x.id === e.target.value);
  if (!p) return;
  loadCloudPlan(p);
});

function loadCloudPlan(p) {
  fillForm(p.inputs);
  saveInputs(p.inputs);
  replaceDone(uid(), p.id, { ...getDone(uid(), p.id), ...(p.done || {}) });
  replaceLogs(uid(), p.id, { ...getLogs(uid(), p.id), ...(p.logs || {}) });
  build(p.inputs);
}

async function onUser(user) {
  authKnown = true;
  state.user = user;
  stopTier();
  stopTier = () => {};
  state.tier = 'free';
  $('#account').hidden = false;
  $('#account-email').textContent = user ? (user.email || 'Signed in') : '';
  $('#sign-in-btn').hidden = !!user;
  $('#account-menu').hidden = !user;
  $('#account-menu').open = false;
  if (!user) {
    state.profile = null;
    updateAccountUsername();
    state.cloudPlans = [];
    wod.savedMode = null;
    wod.results = {};
    $('#plan-picker').hidden = true;
    if (state.plan) render(); // back to the locked preview
    renderTeaser();
    if (location.hash === '#wod') showWod();
    return;
  }
  cloud.watchTier(user.uid, (tier) => {
    if (tier === state.tier) return;
    state.tier = tier;
    render();
  }).then((stop) => { stopTier = stop; });
  try {
    state.profile = await cloud.getProfile(user.uid).catch(() => null);
    updateAccountUsername();
    if (!state.profile && !sessionFlag('hybrid:usernameAsked')) openUsername();
    await loadWodData();
    renderTeaser();
    if (location.hash === '#wod') showWod();
    if (state.plan) {
      // Signing in unlocks the full plan and saves it to the account.
      render();
      await syncCurrentPlan({ quiet: !state.saveAfterSignIn });
    } else {
      await refreshPlanList();
      if (state.cloudPlans.length) loadCloudPlan(state.cloudPlans[0]);
    }
  } catch (err) {
    console.error(err);
    toast('Signed in, but your saved plans could not be loaded.');
  }
  state.saveAfterSignIn = false;
}

function openAuth(saveAfter) {
  if (!state.authAvailable) {
    toast('Sign-in is unavailable right now, please try again later.');
    return;
  }
  state.saveAfterSignIn = saveAfter;
  $('#auth-error').textContent = '';
  dialog.showModal();
}

$('#sign-in-btn').addEventListener('click', () => openAuth(false));
$('#sign-out-btn').addEventListener('click', () => cloud.signOutUser());

// Close the account menu when clicking elsewhere.
document.addEventListener('click', (e) => {
  const menu = $('#account-menu');
  if (menu.open && !menu.contains(e.target)) menu.open = false;
});

$('#export-btn').addEventListener('click', async () => {
  if (!state.user) return;
  try {
    const data = await cloud.exportMyData(state.user);
    download('hybrid-plan-builder-my-data.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    toast('Your data was downloaded.');
  } catch (err) {
    console.error(err);
    toast('Could not download your data right now. Please try again.');
  }
});

$('#delete-btn').addEventListener('click', async () => {
  const user = state.user;
  if (!user) return;
  if (!window.confirm('Delete your account and all your plans, logs and workout results? This cannot be undone.')) return;
  try {
    await cloud.deleteMyAccount(user);
    forgetUser(user.uid);
    toast('Your account and data were deleted.');
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      await cloud.signOutUser();
      openAuth(false);
      toast('For your security, sign in again, then choose Delete my account.');
    } else {
      console.error(err);
      toast('Could not delete your account right now. Email info@hybridprog.com and we will do it for you.');
    }
  }
});

$('#mode-toggle').addEventListener('click', () => {
  state.createMode = !state.createMode;
  $('#email-submit').textContent = state.createMode ? 'Create account' : 'Sign in';
  $('#mode-text').textContent = state.createMode ? 'Already have an account?' : 'New here?';
  $('#mode-toggle').textContent = state.createMode ? 'Sign in' : 'Create an account';
  $('#password').autocomplete = state.createMode ? 'new-password' : 'current-password';
  $('#agree-row').hidden = !state.createMode;
});

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email or password is wrong.',
  'auth/wrong-password': 'Email or password is wrong.',
  'auth/user-not-found': 'No account with that email. Create one below.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/invalid-email': 'That email address looks wrong.',
  'auth/popup-closed-by-user': 'Sign-in window was closed.',
  'auth/operation-not-allowed': 'This sign-in method is not switched on yet.',
};

async function runAuth(fn) {
  $('#auth-error').textContent = '';
  try {
    await fn();
    dialog.close();
  } catch (err) {
    $('#auth-error').textContent = AUTH_ERRORS[err.code] || 'Sign-in failed. Please try again.';
  }
}

$('#google-btn').addEventListener('click', () => runAuth(() => cloud.signInGoogle()));
$('#email-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.createMode && !$('#agree').checked) {
    $('#auth-error').textContent = 'Please agree to the Terms and Privacy Policy to create an account.';
    return;
  }
  runAuth(() => cloud.signInEmail($('#email').value.trim(), $('#password').value, state.createMode));
});

// ---------- misc ----------

/** Returns whether the flag was already set this browser session, and sets it. */
function sessionFlag(key) {
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, '1');
  } catch { /* storage blocked */ }
  return false;
}

/** Firestore rejects undefined values, so drop them before saving. */
function cleanInputs(inp) {
  return Object.fromEntries(Object.entries(inp).filter(([, v]) => v !== undefined));
}

let toastTimer;
/** A short message; pass { action, onAction } for a button such as Undo. */
function toast(msg, { action = null, onAction = null } = {}) {
  const el = $('#toast');
  const btn = $('#toast-action');
  $('#toast-msg').textContent = msg;
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = action ? () => { el.classList.remove('show'); onAction(); } : null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 3500);
}

// ---------- start ----------

setupForm();
const saved = loadInputs();
if (saved) {
  fillForm(saved);
  if (!Object.keys(validateInputs(saved)).length) build(saved);
}
route();
cloud.watchUser(onUser).then((ok) => {
  state.authAvailable = ok;
  if (!ok) { authKnown = true; route(); }
});

import { AGE_GROUPS, WEEKDAYS, DIVISIONS, MACHINES, buildPlan, validateInputs, todayYmd, normalizeTime } from './plan.js';
import { summaryCard, splitsCard, pacesCard, swapCard, suggestionCards, noticeCards, glossaryCard, weekCards } from './render.js';
import { planIdFor, loadInputs, saveInputs, getDone, setDone, replaceDone, getLogs, replaceLogs } from './progress.js';
import { suggest, applySuggestion, fmtZone } from './hr.js';
import { buildIcs } from './ics.js';
import * as cloud from './cloud.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#plan-form');
const dialog = $('#auth-dialog');

const state = {
  plan: null,
  suggestions: [],
  planId: null,
  user: null,
  cloudPlans: [],
  authAvailable: true,
  saveAfterSignIn: false,
  createMode: false,
};

const uid = () => state.user?.uid || null;

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
    maxHR: String(fd.get('maxHR') || '').trim(),
    hr5k: String(fd.get('hr5k') || '').trim(),
    startTest: fd.get('startTest') === 'on',
  };
  // Changes applied from heart-rate logs belong to this race's plan, so keep them on a rebuild.
  const prev = state.plan?.inputs;
  if (prev && planIdFor(prev) === planIdFor(inp)) {
    if (prev.paceAdjust) inp.paceAdjust = prev.paceAdjust;
    if (prev.dismissed) inp.dismissed = prev.dismissed;
  }
  return inp;
}

const TEXT_FIELDS = ['raceDate', 'goal', 'division', 'age', 'fiveK', 'maxHR', 'hr5k'];

function fillForm(inp) {
  for (const k of TEXT_FIELDS) form.elements[k].value = inp[k] ?? '';
  const setChecks = (name, values) => {
    for (const el of form.querySelectorAll(`input[name="${name}"]`)) el.checked = values.includes(el.value) || values.includes(Number(el.value));
  };
  if (Array.isArray(inp.days)) setChecks('days', inp.days);
  setChecks('equipment', Array.isArray(inp.equipment) ? inp.equipment : MACHINES);
  form.elements.startTest.checked = !!inp.startTest;
  if (inp.maxHR || inp.hr5k || inp.startTest) form.querySelector('.hr-section').open = true;
  updateDoublesHint();
}

function updateDoublesHint() {
  $('#doubles-hint').hidden = !DIVISIONS[form.elements.division.value]?.doubles;
}
form.elements.division.addEventListener('change', updateDoublesHint);

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
  saveInputs(inp);
  build(inp);
  $('#results').scrollIntoView({ behavior: 'smooth' });
  if (state.user) syncCurrentPlan({ quiet: true });
});

// ---------- plan ----------

function build(inp) {
  state.plan = buildPlan(inp);
  state.planId = planIdFor(inp);
  render();
}

/** Signed out: a preview (summary + first week). Signed in: the full plan with ticks, logs and suggestions. */
function render() {
  const { plan } = state;
  const locked = !state.user;
  const done = getDone(uid(), state.planId);
  const logs = getLogs(uid(), state.planId);
  state.suggestions = locked ? [] : suggest(plan, logs, plan.inputs.dismissed);
  $('#suggestions-out').innerHTML = suggestionCards(state.suggestions);
  $('#plan-out').innerHTML = summaryCard(plan) + noticeCards(plan) + splitsCard(plan) + pacesCard(plan) + swapCard(plan) + glossaryCard();
  $('#weeks-out').innerHTML = weekCards(plan, done, { locked, logs });
  $('#print-btn').hidden = locked;
  $('#ics-btn').hidden = locked;
  $('#results').hidden = false;
  updateSaveButton();
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

$('#weeks-out').addEventListener('click', (e) => {
  if (e.target.closest('[data-unlock]')) openAuth(true);
  const logBtn = e.target.closest('[data-log]');
  if (logBtn) openLog(logBtn.dataset.log);
});

// ---------- heart-rate logs ----------

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
  $('#log-zone').textContent = hrZone ? `Target for this session: ${fmtZone(hrZone)} bpm.` : 'Your average from your watch for the whole session.';
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
  const entry = { feel: logDialog.querySelector('input[name="feel"]:checked')?.value || 'ok' };
  if (hr) entry.hr = Number(hr);
  if (isTest && fiveK) entry.fiveK = fiveK;
  const logs = { ...getLogs(uid(), state.planId), [loggingKey]: entry };
  replaceLogs(uid(), state.planId, logs);
  const done = setDone(uid(), state.planId, loggingKey, true);
  if (isSaved()) cloud.queueProgress(uid(), state.planId, done, logs);
  logDialog.close();
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
    if (!state.user && state.plan.weeks.some((w) => w.days.some((d) => d.ymd === today))) {
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

let openBeforePrint = [];
window.addEventListener('beforeprint', () => {
  openBeforePrint = [...document.querySelectorAll('details')].map((d) => d.open);
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details').forEach((d, i) => { d.open = openBeforePrint[i] ?? d.open; });
});
$('#print-btn').addEventListener('click', () => window.print());

$('#ics-btn').addEventListener('click', () => {
  const blob = new Blob([buildIcs(state.plan, state.planId)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hyrox-plan-${state.plan.inputs.raceDate}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#save-btn').addEventListener('click', () => {
  if (state.user) syncCurrentPlan({ quiet: false });
  else openAuth(true);
});

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
  state.user = user;
  $('#account').hidden = false;
  $('#account-email').textContent = user ? (user.email || 'Signed in') : '';
  $('#sign-out-btn').title = user?.email ? `Signed in as ${user.email}` : '';
  $('#sign-in-btn').hidden = !!user;
  $('#sign-out-btn').hidden = !user;
  if (!user) {
    state.cloudPlans = [];
    $('#plan-picker').hidden = true;
    if (state.plan) render(); // back to the locked preview
    return;
  }
  try {
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

$('#mode-toggle').addEventListener('click', () => {
  state.createMode = !state.createMode;
  $('#email-submit').textContent = state.createMode ? 'Create account' : 'Sign in';
  $('#mode-text').textContent = state.createMode ? 'Already have an account?' : 'New here?';
  $('#mode-toggle').textContent = state.createMode ? 'Sign in' : 'Create an account';
  $('#password').autocomplete = state.createMode ? 'new-password' : 'current-password';
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
  runAuth(() => cloud.signInEmail($('#email').value.trim(), $('#password').value, state.createMode));
});

// ---------- misc ----------

/** Firestore rejects undefined values, so drop them before saving. */
function cleanInputs(inp) {
  return Object.fromEntries(Object.entries(inp).filter(([, v]) => v !== undefined));
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ---------- start ----------

setupForm();
const saved = loadInputs();
if (saved) {
  fillForm(saved);
  if (!Object.keys(validateInputs(saved)).length) build(saved);
}
cloud.watchUser(onUser).then((ok) => { state.authAvailable = ok; });

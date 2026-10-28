// The 12-week plan page (index.html): the plan form, the week view, 5k test logs and the list of race plans.
// Signing in, buying and the toast live in site.js. Only owners of the plan (a one-time purchase) see the
// form and their plan; everyone else sees the buy card and the information about the plan.
import { AGE_GROUPS, WEEKDAYS, DIVISIONS, MACHINES, UNITS, unitsOf, buildPlan, validateInputs, todayYmd, normalizeTime, maskTime, fmtLongDate, fmtTime, parseYmd } from './plan.js';
import { summaryCard, splitsCard, pacesCard, swapCard, noticeCards, glossaryCard, planWeek } from './render.js';
import { planIdFor, loadInputs, saveInputs, clearInputs, markUnsaved, isUnsaved, clearUnsaved, getUnits, setUnits, getLogs, replaceLogs, clearLogs, getWodMode } from './progress.js';
import { applyTest } from './hr.js';
import { loadWods, workoutFor, pickMode } from './wod.js';
import { todayTeaser } from './wodRender.js';
import { $, state as site, access, accessStatus, toast, startSite } from './site.js';
import * as cloud from './cloud.js';

const form = $('#plan-form');

const state = {
  plan: null,
  planId: null,
  cloudPlans: [],
  view: { weekIdx: 0, ymd: null }, // the week and day shown in the plan
};

let editMode = null; // null | 'edit' | 'new'
let plansLoadedFor = null; // the account whose saved plans were loaded
let plansLoading = false;

const uid = () => site.user?.uid || null;

// ---------- form ----------

// The age options are in the HTML, so the field never depends on this script loading.
function setupForm() {
  setUnitsRadio(getUnits());
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
    units: UNITS.includes(fd.get('units')) ? fd.get('units') : 'kg',
  };
  const prev = state.plan?.inputs || loadInputs();
  // Heart-rate values come from the 5k tests, not the form; they describe the athlete, so keep them.
  if (prev?.maxHR) inp.maxHR = prev.maxHR;
  if (prev?.hr5k) inp.hr5k = prev.hr5k;
  if (prev?.fiveKFromTest && prev.fiveK === inp.fiveK) inp.fiveKFromTest = true;
  // Older plans may carry pace changes from heart-rate suggestions; keep them for the same race.
  if (prev?.paceAdjust && planIdFor(prev) === planIdFor(inp)) inp.paceAdjust = prev.paceAdjust;
  return inp;
}

const TEXT_FIELDS = ['raceDate', 'goal', 'division', 'age', 'fiveK', 'bodyWeight'];

function fillForm(inp) {
  for (const k of TEXT_FIELDS) form.elements[k].value = inp[k] ?? '';
  // A saved plan with a missing or old value would leave a dropdown blank: fall back to the default.
  if (!AGE_GROUPS.includes(form.elements.age.value)) form.elements.age.value = '30-34';
  if (!DIVISIONS[form.elements.division.value]) form.elements.division.value = 'MO';
  setUnitsRadio(unitsOf(inp));
  const setChecks = (name, values) => {
    for (const el of form.querySelectorAll(`input[name="${name}"]`)) el.checked = values.includes(el.value) || values.includes(Number(el.value));
  };
  if (Array.isArray(inp.days)) setChecks('days', inp.days);
  setChecks('equipment', Array.isArray(inp.equipment) ? inp.equipment : MACHINES);
  updateDoublesHint();
}

function resetForm() {
  form.reset();
  form.elements.age.value = '30-34';
  setUnitsRadio(getUnits());
  showErrors({});
  updateDoublesHint();
}

function setUnitsRadio(units) {
  for (const r of form.querySelectorAll('input[name="units"]')) r.checked = r.value === units;
  for (const el of document.querySelectorAll('[data-unit-label]')) el.textContent = units;
}

const LB_PER_KG = 2.20462;
/** Body weight written in the other unit, to the nearest 0.5. */
function convertBodyWeight(value, to) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!n) return value ?? '';
  return String(Math.round((to === 'lb' ? n * LB_PER_KG : n / LB_PER_KG) * 2) / 2);
}

// Switching kg/lb in the form converts a body weight already typed in.
form.addEventListener('change', (e) => {
  if (e.target.name !== 'units') return;
  const to = e.target.value;
  if (document.querySelector('[data-unit-label]').textContent !== to) {
    form.elements.bodyWeight.value = convertBodyWeight(form.elements.bodyWeight.value, to);
  }
  setUnitsRadio(to);
});

const currentUnits = () => state.plan?.units || getUnits();

/** A saved plan's inputs in the kg/lb last picked on this device (the WOD page has a switch too). */
function inDeviceUnits(inp) {
  const units = getUnits(unitsOf(inp));
  return units === unitsOf(inp) ? inp : { ...inp, units, bodyWeight: convertBodyWeight(inp.bodyWeight, units) };
}

function updateDoublesHint() {
  $('#doubles-hint').hidden = !DIVISIONS[form.elements.division.value]?.doubles;
}
form.elements.division.addEventListener('change', updateDoublesHint);

/** Edit and New plan bring the form back in place of the plan. */
function setEditing(mode) {
  editMode = mode;
  $('#form-title').textContent = mode === 'edit' ? 'Update your plan' : mode === 'new' ? 'New plan' : 'Build your plan';
  $('#build-btn').textContent = mode === 'edit' ? 'Update my plan' : 'Build my plan';
  $('#form-hint').hidden = mode !== 'edit';
  $('#cancel-edit-btn').hidden = !mode;
  updateView();
  if (mode) {
    window.scrollTo(0, 0);
    form.focus({ preventScroll: true });
  }
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
  if (!access('fullPlan')) return;
  const inp = readForm();
  const errors = validateInputs(inp);
  showErrors(errors);
  if (Object.keys(errors).length) {
    form.querySelector('[aria-invalid="true"], .chips')?.focus?.();
    return;
  }
  const updating = editMode === 'edit';
  setUnits(inp.units);
  saveInputs(inp);
  build(inp);
  window.scrollTo(0, 0);
  if (updating) toast('Plan updated. Your 5k test results are kept.');
  syncCurrentPlan();
});

$('#cancel-edit-btn').addEventListener('click', () => {
  if (state.plan) fillForm(state.plan.inputs);
  setEditing(null);
});

// ---------- what the page shows ----------

const WAIT_TEXT = {
  loading: 'Loading your plan…',
  unlocking: 'Payment received. Unlocking your plan…',
  slow: 'Your payment went through, but unlocking is taking longer than usual. Refresh the page in a minute, or email info@hybridprog.com.',
};

/** One of: the buy card (with the page's information below it), a waiting card, the form, or the plan. */
function updateView() {
  let status = accessStatus('plan');
  const owns = status === 'owned';
  if (owns && !state.plan && plansLoading) status = 'loading'; // the account's saved plans are on their way
  const showPlan = owns && !!state.plan && !editMode;
  $('#plan-buy').hidden = status !== 'locked';
  $('#plan-info').hidden = status !== 'locked';
  $('#plan-wait').hidden = !WAIT_TEXT[status];
  $('#plan-wait').classList.toggle('slow', status === 'slow');
  if (WAIT_TEXT[status]) $('#plan-wait-text').textContent = WAIT_TEXT[status];
  form.hidden = status !== 'owned' || showPlan;
  $('#results').hidden = !showPlan;
  document.body.classList.toggle('owns-plan', owns);
  if (showPlan) render();
}

// ---------- plan ----------

/** The day to open on: today if it is in the plan, otherwise the first day shown. */
function defaultView(plan) {
  const idx = plan.weeks.findIndex((w) => w.days.some((d) => d.ymd === plan.today));
  return idx >= 0 ? { weekIdx: idx, ymd: plan.today } : { weekIdx: 0, ymd: plan.weeks[0].days[0].ymd };
}

function build(inp, { keepView = false } = {}) {
  const prev = state.view;
  state.plan = buildPlan(inp);
  state.planId = planIdFor(inp);
  const w = state.plan.weeks[prev.weekIdx];
  state.view = keepView && w?.days.some((d) => d.ymd === prev.ymd) ? prev : defaultView(state.plan);
  setEditing(null);
}

function render() {
  const { plan } = state;
  $('#plan-out').innerHTML = summaryCard(plan) + noticeCards(plan);
  renderWeek();
  $('#info-out').innerHTML = splitsCard(plan) + pacesCard(plan) + swapCard(plan) + glossaryCard();
  updatePicker();
}

function renderWeek() {
  $('#plan-week-out').innerHTML = planWeek(state.plan, { ...state.view, logs: getLogs(uid(), state.planId) });
}

/** Rebuild after an input change, keeping the day shown. */
function rebuild(inputs) {
  saveInputs(inputs);
  fillForm(inputs);
  build(inputs, { keepView: true });
  syncCurrentPlan();
}

/** No plan shown: owners get the empty form. */
function clearPlan() {
  state.plan = null;
  state.planId = null;
  resetForm();
  setEditing(null);
}

$('#plan-week-out').addEventListener('click', (e) => {
  const step = e.target.closest('[data-plan-week]');
  const day = e.target.closest('[data-plan-day]');
  const log = e.target.closest('[data-log]');
  if (step) {
    const weekIdx = state.view.weekIdx + Number(step.dataset.planWeek);
    const w = state.plan.weeks[weekIdx];
    if (!w) return;
    // A new week opens on its Monday.
    state.view = { weekIdx, ymd: w.days[0].ymd };
  } else if (day) {
    state.view = { ...state.view, ymd: day.dataset.planDay };
  } else if (e.target.closest('[data-plan-today]')) {
    state.view = defaultView(state.plan);
  } else if (log) {
    openLog(log.dataset.log);
    return;
  } else {
    return;
  }
  renderWeek();
});

// ---------- 5k test logs (the only thing a user logs) ----------

const logDialog = $('#log-dialog');
let loggingKey = null;

function findDay(key) {
  for (const w of state.plan.weeks) for (const d of w.days) if (d.key === key) return { w, d };
  return null;
}

function openLog(key) {
  const found = findDay(key);
  if (!found?.d.test || !access('fullPlan')) return;
  const { w, d } = found;
  loggingKey = key;
  const log = getLogs(uid(), state.planId)[key] || {};
  $('#log-session').textContent = `Week ${w.n} · ${d.weekday} · ${d.label}`;
  $('#log-fivek').value = log.fiveK || '';
  $('#log-hr').value = log.hr || '';
  $('#log-error').textContent = '';
  logDialog.showModal();
}

$('#log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const hr = $('#log-hr').value.trim();
  const fiveK = normalizeTime($('#log-fivek').value);
  if (!/^\d{1,2}:[0-5]\d$/.test(fiveK)) { $('#log-error').textContent = 'Enter your 5k time in minutes:seconds, e.g. 24:30.'; return; }
  if (hr && !(Number(hr) >= 60 && Number(hr) <= 230)) { $('#log-error').textContent = 'Heart rate should be between 60 and 230.'; return; }

  const next = applyTest(state.plan.inputs, { fiveK, hr5k: hr ? Number(hr) : null });
  const errors = validateInputs(next);
  if (errors.fiveK || errors.hr5k) { $('#log-error').textContent = errors.fiveK || errors.hr5k; return; }

  const key = loggingKey;
  const before = { inputs: state.plan.inputs, logs: getLogs(uid(), state.planId) };
  const entry = { fiveK };
  if (hr) entry.hr = Number(hr);
  replaceLogs(uid(), state.planId, { ...before.logs, [key]: entry });
  logDialog.close();
  rebuild(next);
  const p = state.plan.projection;
  toast(`Saved. Paces updated${p.time ? ` and your projected finish is now ${fmtTime(p.time)}` : ''}.`, {
    action: 'Undo',
    onAction: () => {
      // A first result is set to null rather than left out, so the account's copy drops it too (savePlan).
      replaceLogs(uid(), state.planId, { ...before.logs, [key]: before.logs[key] ?? null });
      rebuild(before.inputs);
      toast('Back to your previous result.');
    },
  });
});

// ---------- toolbar: switch, edit, new, delete ----------

$('#edit-btn').addEventListener('click', () => {
  if (!state.plan) return;
  fillForm(state.plan.inputs);
  setEditing('edit');
});

$('#new-btn').addEventListener('click', () => {
  resetForm();
  setEditing('new');
});

$('#delete-btn-plan').addEventListener('click', async () => {
  if (!state.plan) return;
  if (!window.confirm(`Delete your plan for the race on ${state.plan.raceLabel}? Your 5k test results for it are deleted too.`)) return;
  const id = state.planId;
  try {
    await saving; // a save still on its way would bring the plan back after the delete
    if (site.user && state.cloudPlans.some((p) => p.id === id)) await cloud.deletePlan(uid(), id);
  } catch (err) {
    console.error(err);
    toast('Could not delete the plan right now. Please try again.');
    return;
  }
  clearLogs(uid(), id);
  clearInputs();
  state.cloudPlans = state.cloudPlans.filter((p) => p.id !== id);
  if (state.cloudPlans.length) loadCloudPlan(state.cloudPlans[0]);
  else clearPlan();
  toast('Plan deleted.');
});

function updatePicker() {
  const picker = $('#plan-picker');
  const plans = state.cloudPlans;
  picker.hidden = !site.user || plans.length === 0;
  const label = (inp) => `Race ${fmtLongDate(parseYmd(inp.raceDate))} · ${inp.goal}`;
  const options = plans.map((p) => `<option value="${p.id}"${p.id === state.planId ? ' selected' : ''}>${label(p.inputs)}</option>`);
  // A plan built but not yet saved still shows in the list.
  if (state.plan && !isSaved()) options.unshift(`<option value="${state.planId}" selected>${label(state.plan.inputs)}</option>`);
  picker.innerHTML = options.join('');
}

$('#plan-picker').addEventListener('change', (e) => {
  const p = state.cloudPlans.find((x) => x.id === e.target.value);
  if (p) loadCloudPlan(p);
});

// ---------- the account's plans ----------

const isSaved = () => state.cloudPlans.some((p) => p.id === state.planId);

let saving = Promise.resolve();

/**
 * Save the current plan to the account and merge the 5k test logs both ways. Saves run one after another,
 * so a change (or its Undo) always lands after the one before it.
 */
function syncCurrentPlan() {
  if (!site.user || !state.plan || !access('fullPlan')) return saving;
  const { plan, planId } = state;
  // If the save never lands, the next visit saves this device's copy instead of opening the account's.
  markUnsaved(uid(), planId);
  saving = saving.then(() => savePlanNow(plan, planId));
  return saving;
}

async function savePlanNow(plan, planId) {
  if (!site.user) return;
  try {
    const logs = await cloud.savePlan(uid(), planId, cleanInputs(plan.inputs), getLogs(uid(), planId));
    // A change made meanwhile is saved next; until then this device's logs and mark stay as they are.
    if (state.plan === plan) {
      replaceLogs(uid(), planId, logs);
      clearUnsaved();
    }
    await refreshPlanList();
    updateView();
  } catch (err) {
    console.error(err);
    toast('Could not save your plan to your account right now. It is still kept on this device.');
  }
}

async function refreshPlanList() {
  state.cloudPlans = await cloud.listPlans(uid());
  updatePicker();
}

function loadCloudPlan(p, opts) {
  setUnits(unitsOf(p.inputs));
  fillForm(p.inputs);
  saveInputs(p.inputs);
  replaceLogs(uid(), p.id, { ...getLogs(uid(), p.id), ...(p.logs || {}) });
  build(p.inputs, opts);
}

/**
 * Once the plan is owned: open the account's copy of the plan on this device, or its newest plan. The account
 * wins, since the plan may have been changed or deleted on another device; this device's copy is saved
 * instead only when it has a change the account never got.
 */
async function loadAccountPlans() {
  plansLoadedFor = uid();
  plansLoading = true;
  try {
    if (state.plan && isUnsaved(uid(), state.planId)) {
      await syncCurrentPlan();
    } else {
      await refreshPlanList();
      const same = state.cloudPlans.find((p) => p.id === state.planId);
      // Deleted on another device: drop it here too, so it isn't saved back to the account.
      if (state.plan && !same) clearLogs(uid(), state.planId);
      const next = same ? { ...same, inputs: inDeviceUnits(same.inputs) } : state.cloudPlans[0];
      if (next) loadCloudPlan(next, { keepView: !!same });
      else if (state.plan) {
        clearInputs();
        clearPlan();
      }
    }
  } catch (err) {
    console.error(err);
    toast('Signed in, but your saved plans could not be loaded.');
  } finally {
    plansLoading = false;
    updateView();
  }
}

/** Firestore rejects undefined values, so drop them before saving. */
function cleanInputs(inp) {
  return Object.fromEntries(Object.entries(inp).filter(([, v]) => v !== undefined));
}

// ---------- Today's WOD (WOD subscribers) ----------

async function renderTeaser() {
  const el = $('#wod-teaser');
  if (!access('wod')) { el.innerHTML = ''; return; }
  try {
    const data = await loadWods();
    const w = workoutFor(data, todayYmd());
    el.innerHTML = todayTeaser(w, pickMode(w, getWodMode(uid())), currentUnits());
  } catch {
    el.innerHTML = '';
  }
}

// ---------- start ----------

function onUser(user, { signedOut }) {
  if (user) return; // the account's plans load once the plan is known to be owned (onAccess)
  state.cloudPlans = [];
  plansLoadedFor = null;
  if (signedOut) clearPlan();
}

function onAccess() {
  if (access('fullPlan') && plansLoadedFor !== uid()) loadAccountPlans();
  updateView();
  renderTeaser();
}

/** Back from the WOD page: follow a kg/lb switch made there (unless the form is open), and its Solo/Team choice. */
function onShow() {
  const units = getUnits(currentUnits());
  if (state.plan && !editMode && units !== state.plan.units) {
    rebuild({ ...state.plan.inputs, units, bodyWeight: convertBodyWeight(state.plan.inputs.bodyWeight, units) });
  }
  renderTeaser();
}

setupForm();
const saved = loadInputs();
if (saved) {
  // kg/lb picked on the WOD page since the plan was saved: show the plan in the same units.
  const inp = inDeviceUnits(saved);
  fillForm(inp);
  // Older saved plans may lack the age group or division: use the defaults fillForm picked.
  const repaired = { ...inp, age: form.elements.age.value, division: form.elements.division.value };
  if (!Object.keys(validateInputs(repaired)).length) {
    saveInputs(repaired);
    build(repaired);
  }
}
startSite({ page: 'plan', onUser, onAccess, onShow });

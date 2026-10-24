import { AGE_GROUPS, WEEKDAYS, DIVISIONS, MACHINES, UNITS, unitsOf, textToUnits, buildPlan, validateInputs, todayYmd, normalizeTime, maskTime, fmtLongDate, fmtTime, parseYmd } from './plan.js';
import { summaryCard, splitsCard, pacesCard, swapCard, noticeCards, glossaryCard, planWeek, dayStrip, paywall } from './render.js';
import { planIdFor, loadInputs, saveInputs, clearInputs, getUnits, setUnits, getLogs, replaceLogs, clearLogs, getWodMode, setWodMode, forgetUser } from './progress.js';
import { applyTest } from './hr.js';
import { loadWods, workoutFor, weekDates, pickMode, clampToWeek } from './wod.js';
import { wodCard, planNote, infoPanel, todayTeaser } from './wodRender.js';
import { canUse, hasSubscription, portalLoginUrl, PRODUCTS } from './billing.js';
import * as cloud from './cloud.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#plan-form');
const dialog = $('#auth-dialog');

const state = {
  plan: null,
  planId: null,
  user: null,
  subs: new Set(), // products the user has paid for: 'plan' (one-time), 'wod' (active subscription)
  subsKnown: false,
  cloudPlans: [],
  authAvailable: true,
  pendingProduct: null, // subscribe to this after signing in
  createMode: false,
  view: { weekIdx: 0, ymd: null }, // the week and day shown in the plan
};

const wod = { data: null, ymd: todayYmd(), savedMode: null };
let stopSubs = () => {};
let editMode = null; // null | 'edit' | 'new'
let signedInFromDialog = false;
let verify = null; // { user } while the dialog waits for a new account to confirm its email
let authKnown = false; // until Firebase reports, don't flash the signed-out WOD view

const uid = () => state.user?.uid || null;
const access = (feature) => canUse(feature, { user: state.user, subs: state.subs });

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

/** kg/lb picked on the WOD page: remember it and show the plan in the same units. */
function changeUnits(units) {
  setUnits(units);
  if (state.plan && state.plan.units !== units) {
    const inp = state.plan.inputs;
    rebuild({ ...inp, units, bodyWeight: convertBodyWeight(inp.bodyWeight, units) });
  }
  renderWod();
  renderTeaser();
}

const currentUnits = () => state.plan?.units || getUnits();

function updateDoublesHint() {
  $('#doubles-hint').hidden = !DIVISIONS[form.elements.division.value]?.doubles;
}
form.elements.division.addEventListener('change', updateDoublesHint);

/** With a plan built, the landing page and form are hidden; Edit and New plan bring the form back. */
function setEditing(mode) {
  editMode = mode;
  document.body.classList.toggle('editing', !!mode);
  $('#form-title').textContent = mode === 'edit' ? 'Update your plan' : mode === 'new' ? 'New plan' : 'Your details';
  $('#build-btn').textContent = mode === 'edit' ? 'Update my plan' : 'Build my plan';
  $('#form-hint').hidden = mode !== 'edit';
  $('#cancel-edit-btn').hidden = !mode;
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
  if (state.user) syncCurrentPlan();
});

$('#cancel-edit-btn').addEventListener('click', () => {
  if (state.plan) fillForm(state.plan.inputs);
  setEditing(null);
});

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
  document.body.classList.add('has-plan');
  setEditing(null);
  render();
}

/** Signed out or plan not bought: summary + the first week. Bought: every week. */
function render() {
  const { plan } = state;
  if (!plan) return;
  $('#plan-out').innerHTML = summaryCard(plan) + noticeCards(plan);
  renderWeek();
  $('#info-out').innerHTML = splitsCard(plan) + pacesCard(plan) + swapCard(plan) + glossaryCard();
  $('#results').hidden = false;
  updatePicker();
}

function renderWeek() {
  $('#plan-week-out').innerHTML = planWeek(state.plan, {
    ...state.view,
    locked: !access('fullPlan'),
    logs: getLogs(uid(), state.planId),
  });
}

/** Rebuild after an input change, keeping the day shown. */
function rebuild(inputs) {
  saveInputs(inputs);
  fillForm(inputs);
  build(inputs, { keepView: true });
  syncCurrentPlan();
}

$('#plan-week-out').addEventListener('click', (e) => {
  const step = e.target.closest('[data-plan-week]');
  const day = e.target.closest('[data-plan-day]');
  const log = e.target.closest('[data-log]');
  if (step) {
    const weekIdx = state.view.weekIdx + Number(step.dataset.planWeek);
    const w = state.plan.weeks[weekIdx];
    if (!w) return;
    // Keep the same weekday when changing week.
    const dayIdx = state.plan.weeks[state.view.weekIdx].days.findIndex((d) => d.ymd === state.view.ymd);
    state.view = { weekIdx, ymd: w.days[Math.max(0, dayIdx)].ymd };
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

  const before = { inputs: state.plan.inputs, logs: getLogs(uid(), state.planId) };
  const entry = { fiveK };
  if (hr) entry.hr = Number(hr);
  replaceLogs(uid(), state.planId, { ...before.logs, [loggingKey]: entry });
  logDialog.close();
  rebuild(next);
  const p = state.plan.projection;
  toast(`Saved. Paces updated${p.time ? ` and your projected finish is now ${fmtTime(p.time)}` : ''}.`, {
    action: 'Undo',
    onAction: () => {
      replaceLogs(uid(), state.planId, before.logs);
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
    if (state.user && isSaved()) await cloud.deletePlan(uid(), id);
  } catch (err) {
    console.error(err);
    toast('Could not delete the plan right now. Please try again.');
    return;
  }
  clearLogs(uid(), id);
  clearInputs();
  state.cloudPlans = state.cloudPlans.filter((p) => p.id !== id);
  if (state.cloudPlans.length) {
    loadCloudPlan(state.cloudPlans[0]);
  } else {
    showLanding();
  }
  toast('Plan deleted.');
});

/** Back to the empty landing page: no plan shown, empty form. */
function showLanding() {
  state.plan = null;
  state.planId = null;
  $('#results').hidden = true;
  document.body.classList.remove('has-plan');
  resetForm();
  setEditing(null);
  renderTeaser();
}

/** The home page: the Plan tab, scrolled to the top, without the #wod hash. */
function goHome() {
  if (location.hash) history.pushState(null, '', `${location.pathname}${location.search}`);
  route();
  window.scrollTo(0, 0);
}

function updatePicker() {
  const picker = $('#plan-picker');
  const plans = state.cloudPlans;
  picker.hidden = !state.user || plans.length === 0;
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

// ---------- purchases ----------

async function subscribe(product) {
  if (!state.user) {
    state.pendingProduct = product;
    openAuth();
    return;
  }
  if (state.subs.has(product)) { toast(`You already have the ${PRODUCTS[product].name}.`); return; }
  toast('Opening secure checkout…');
  try {
    await cloud.startCheckout(product);
  } catch (err) {
    console.error(err);
    toast(fnError(err, 'Could not open checkout right now. Please try again.'));
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-subscribe]');
  if (btn) subscribe(btn.dataset.subscribe);
});

$('#billing-btn').addEventListener('click', async () => {
  try {
    toast('Opening your subscription settings…');
    await cloud.openBillingPortal();
  } catch (err) {
    console.error(err);
    const url = portalLoginUrl(state.user?.email);
    if (url) toast('Could not open your subscription settings here.', { action: 'Open Stripe', onAction: () => window.open(url, '_blank', 'noopener') });
    else toast('Could not open your subscription settings. Email info@hybridprog.com and we will help.');
  }
});

/** The fallback links to Stripe's portal login (account menu and footer), with the user's email filled in. */
function updatePortalLinks() {
  const url = portalLoginUrl(state.user?.email);
  document.querySelectorAll('[data-portal-link]').forEach((el) => {
    el.hidden = !url;
    if (el.tagName === 'A' && url) el.href = url;
  });
}

/** Back from Stripe Checkout: ?paid=plan or ?paid=wod. */
function checkPaidReturn() {
  const params = new URLSearchParams(location.search);
  const paid = params.get('paid');
  if (!paid || !PRODUCTS[paid]) return;
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
  toast(`Thanks! Your ${PRODUCTS[paid].name} unlocks in a few seconds.`);
}

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
  if (!authKnown || (state.user && !state.subsKnown)) return; // "Loading…" stays until access is known
  if (!access('wod')) {
    out.innerHTML = paywall('wod');
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

/** Only the current week's workouts are shown. */
function renderWod() {
  if (!wod.data || $('#wod-view').hidden || !access('wod')) return;
  const today = todayYmd();
  wod.ymd = clampToWeek(wod.ymd, today);
  const { w, mode } = currentWorkout();
  $('#wod-out').innerHTML = dayStrip(weekDates(today), { selected: wod.ymd, today, attr: 'wod-day' })
    + wodCard(w, mode, wod.ymd, { today, units: currentUnits() })
    + planNote(planDayOn(wod.ymd))
    + infoPanel(wod.data.meta, currentUnits());
}

/** The small card on the landing page (WOD subscribers only). */
async function renderTeaser() {
  const el = $('#wod-teaser');
  if (!access('wod')) { el.innerHTML = ''; return; }
  try {
    const data = await getWods();
    const w = workoutFor(data, todayYmd());
    el.innerHTML = todayTeaser(w, pickMode(w, wod.savedMode), currentUnits());
  } catch {
    el.innerHTML = '';
  }
}

$('#wod-out').addEventListener('click', (e) => {
  const day = e.target.closest('[data-wod-day]');
  const mode = e.target.closest('[data-wod-mode]');
  const units = e.target.closest('[data-wod-units]');
  if (day) { wod.ymd = day.dataset.wodDay; renderWod(); return; }
  if (mode) { setMode(mode.dataset.wodMode); return; }
  if (units) { changeUnits(units.dataset.wodUnits); return; }
  if (e.target.closest('[data-wod-copy]')) copyWod();
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
    await navigator.clipboard.writeText(`${w.title}\n${textToUnits(w[mode].text, currentUnits())}`);
    toast('Workout copied.');
  } catch {
    toast('Could not copy. Select the text and copy it instead.');
  }
}

/** The Solo/Team choice, from the account (or this device). */
async function loadWodMode() {
  wod.savedMode = getWodMode(uid());
  try {
    const settings = await cloud.getSettings(uid());
    if (settings.wodMode) wod.savedMode = settings.wodMode;
    else if (wod.savedMode) cloud.saveWodMode(uid(), wod.savedMode).catch(() => {});
    setWodMode(uid(), wod.savedMode);
  } catch (err) {
    console.warn('Could not load WOD settings:', err);
  }
}

// ---------- accounts ----------

const isSaved = () => state.cloudPlans.some((p) => p.id === state.planId);

/** Save the current plan to the account and merge the 5k test logs both ways. */
async function syncCurrentPlan() {
  if (!state.user || !state.plan) return;
  try {
    const logs = await cloud.savePlan(uid(), state.planId, cleanInputs(state.plan.inputs), getLogs(uid(), state.planId));
    replaceLogs(uid(), state.planId, logs);
    await refreshPlanList();
    render();
  } catch (err) {
    console.error(err);
    toast('Could not save your plan to your account right now. It is still kept on this device.');
  }
}

async function refreshPlanList() {
  state.cloudPlans = await cloud.listPlans(state.user.uid);
  updatePicker();
}

function loadCloudPlan(p) {
  fillForm(p.inputs);
  saveInputs(p.inputs);
  replaceLogs(uid(), p.id, { ...getLogs(uid(), p.id), ...(p.logs || {}) });
  build(p.inputs);
}

/** Purchases changed (or first arrived): re-render whatever they unlock. */
function onSubs(subs) {
  state.subs = subs;
  state.subsKnown = true;
  $('#billing-btn').hidden = !hasSubscription(subs);
  render();
  renderTeaser();
  if (location.hash === '#wod') showWod();
  if (state.pendingProduct) {
    const p = state.pendingProduct;
    state.pendingProduct = null;
    subscribe(p);
  }
}

async function onUser(user) {
  if (cloud.needsVerify(user)) {
    // Not signed in until the email is confirmed (Firestore refuses until then).
    startVerify(user);
    user = null;
  }
  const signedOut = !!state.user && !user;
  authKnown = true;
  state.user = user;
  stopSubs();
  stopSubs = () => {};
  state.subs = new Set();
  state.subsKnown = false;
  $('#account').hidden = false;
  $('#account-email').textContent = user ? (user.email || 'Signed in') : '';
  $('#sign-in-btn').hidden = !!user;
  $('#account-menu').hidden = !user;
  $('#account-menu').open = false;
  $('#billing-btn').hidden = true;
  updatePortalLinks();
  if (!user) {
    state.cloudPlans = [];
    wod.savedMode = null;
    if (signedOut) {
      // Signing out goes home and leaves nothing of the account's plan on this device.
      clearInputs();
      showLanding();
      goHome();
      return;
    }
    if (state.plan) render(); // the locked preview of a plan built without an account
    renderTeaser();
    if (location.hash === '#wod') showWod();
    return;
  }
  cloud.watchSubs(user.uid, onSubs).then((stop) => { stopSubs = stop; });
  try {
    await loadWodMode();
    if (state.plan) {
      await syncCurrentPlan();
    } else {
      await refreshPlanList();
      if (state.cloudPlans.length) loadCloudPlan(state.cloudPlans[0]);
    }
  } catch (err) {
    console.error(err);
    toast('Signed in, but your saved plans could not be loaded.');
  }
}

function openAuth() {
  if (!state.authAvailable) {
    toast('Sign-in is unavailable right now, please try again later.');
    return;
  }
  $('#auth-error').textContent = '';
  $('#auth-note').hidden = true;
  showPassword(false);
  dialog.showModal();
}

/** The eye in the password box: shows the password as text, or hides it again. */
function showPassword(show) {
  $('#password').type = show ? 'text' : 'password';
  $('#pw-toggle').setAttribute('aria-pressed', String(show));
  $('#pw-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

$('#pw-toggle').addEventListener('click', () => {
  showPassword($('#password').type === 'password');
  $('#password').focus();
});

dialog.addEventListener('close', () => {
  // Closed without signing in: forget the subscribe that was waiting for it.
  if (!signedInFromDialog) state.pendingProduct = null;
  signedInFromDialog = false;
  if (verify) {
    // Closed before confirming the email: the account doesn't stay half signed in.
    cloud.signOutUser();
    verify = null;
  }
  showAuthStep('main');
});

$('#sign-in-btn').addEventListener('click', () => openAuth());
$('#sign-out-btn').addEventListener('click', () => cloud.signOutUser());

// Close the account menu when clicking elsewhere.
document.addEventListener('click', (e) => {
  const menu = $('#account-menu');
  if (menu.open && !menu.contains(e.target)) menu.open = false;
});

$('#delete-btn').addEventListener('click', async () => {
  const user = state.user;
  if (!user) return;
  if (!window.confirm('Delete your account and all your plans and 5k results? This cannot be undone. Cancel any subscription first under Manage subscription.')) return;
  try {
    await cloud.deleteMyAccount(user);
    forgetUser(user.uid);
    toast('Your account and data were deleted.');
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      await cloud.signOutUser();
      openAuth();
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
  $('#forgot-btn').hidden = state.createMode;
});

$('#forgot-btn').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  $('#auth-error').textContent = '';
  $('#auth-note').hidden = true;
  if (!$('#email').checkValidity() || !email) {
    $('#auth-error').textContent = 'Enter your email above, then choose Forgot password.';
    $('#email').focus();
    return;
  }
  try {
    await cloud.sendPasswordReset(email);
  } catch (err) {
    // Unknown emails succeed too (functions/index.js), so the form can't tell who has an account.
    $('#auth-error').textContent = fnError(err, 'Could not send the email. Please try again.');
    return;
  }
  $('#auth-note').textContent = `If ${email} has an account, a link to reset your password is on its way. Check your spam folder too.`;
  $('#auth-note').hidden = false;
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
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
};

async function runAuth(fn) {
  $('#auth-error').textContent = '';
  try {
    const { user } = await fn();
    if (cloud.needsVerify(user)) {
      startVerify(user, true);
      return;
    }
    signedInFromDialog = true;
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

// ---------- email verification ----------

/** The message one of our Cloud Functions sent, or the fallback for anything unexpected. */
const fnError = (err, fallback) => (err.code && err.code !== 'functions/internal' && err.message) || fallback;

function showAuthStep(step) {
  $('#auth-main').hidden = step !== 'main';
  $('#verify-step').hidden = step !== 'verify';
}

async function sendVerifyLink() {
  $('#verify-error').textContent = '';
  $('#verify-text').textContent = 'Sending a link to your email…';
  try {
    const email = await cloud.sendVerifyEmail();
    $('#verify-text').textContent = `We emailed a link to ${email}. Open it to confirm your email, then come back here. Check your junk or spam folder too.`;
  } catch (err) {
    $('#verify-text').textContent = '';
    $('#verify-error').textContent = fnError(err, 'Could not send the email. Please try again.');
  }
}

/** Ask a new email and password account to confirm its address, emailing the link if send. */
function startVerify(user, send = false) {
  if (verify?.user.uid !== user.uid) {
    verify = { user };
    $('#verify-error').textContent = '';
    $('#verify-text').textContent = `Confirm ${user.email} to finish signing in. We can email you a link.`;
    showAuthStep('verify');
    if (!dialog.open) dialog.showModal();
  }
  if (send) sendVerifyLink();
}

/** Once the link was opened (often in another tab): finish signing in. */
async function finishVerify({ quiet = false } = {}) {
  if (!verify) return;
  const { user } = verify;
  $('#verify-error').textContent = '';
  try {
    if (!(await cloud.checkVerified(user))) {
      if (!quiet) $('#verify-error').textContent = 'Your email is not confirmed yet. Open the link we sent, then try again.';
      return;
    }
  } catch {
    if (!quiet) $('#verify-error').textContent = 'Could not check right now. Please try again.';
    return;
  }
  if (verify?.user !== user) return;
  verify = null;
  signedInFromDialog = true;
  dialog.close();
  toast('Email confirmed. You are signed in.');
  onUser(user);
}

$('#verify-done').addEventListener('click', () => finishVerify());
$('#verify-resend').addEventListener('click', () => sendVerifyLink());
// Coming back from the tab where the link was opened.
window.addEventListener('focus', () => finishVerify({ quiet: true }));

// ---------- misc ----------

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
  // Older saved plans may lack the age group or division: use the defaults fillForm picked.
  const repaired = { ...saved, age: form.elements.age.value, division: form.elements.division.value };
  if (!Object.keys(validateInputs(repaired)).length) {
    saveInputs(repaired);
    build(repaired);
  }
}
checkPaidReturn();
updatePortalLinks();
route();
cloud.watchUser(onUser).then((ok) => {
  state.authAvailable = ok;
  if (!ok) { authKnown = true; route(); }
});

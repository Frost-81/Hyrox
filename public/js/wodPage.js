// The Workout of the Day page (wod.html). Signing in, buying and the toast live in site.js.
// Subscribers see the current week's workouts; everyone else sees the buy card and the information below it.
import { todayYmd, textToUnits, buildPlan, validateInputs } from './plan.js';
import { dayStrip } from './render.js';
import { getUnits, setUnits, getWodMode, setWodMode, loadInputs, planIdFor, isUnsaved } from './progress.js';
import { loadWods, workoutFor, weekDates, pickMode, clampToWeek, wodWeekAnchor } from './wod.js';
import { wodCard, planNote, infoPanel } from './wodRender.js';
import { $, state as site, access, accessStatus, toast, startSite } from './site.js';
import * as cloud from './cloud.js';

const wod = { data: null, ymd: todayYmd(), savedMode: null };
let plan = null; // the athlete's 12-week plan, for "Your plan today"
let planLookedUpFor = null; // the account whose saved plans were looked up

const uid = () => site.user?.uid || null;
const currentUnits = () => getUnits(plan?.units);

const WAIT_TEXT = {
  loading: 'Loading your workouts…',
  unlocking: 'Payment received. Unlocking the Workout of the Day…',
  slow: 'Your payment went through, but unlocking is taking longer than usual. Refresh the page in a minute, or email info@hybridprog.com.',
};

/** The buy card (with the page's information below it), a waiting card, or this week's workouts. */
function updateView() {
  const status = accessStatus('wod');
  $('#wod-buy').hidden = status !== 'locked';
  $('#wod-info').hidden = status !== 'locked';
  $('#wod-wait').hidden = !WAIT_TEXT[status];
  $('#wod-wait').classList.toggle('slow', status === 'slow');
  if (WAIT_TEXT[status]) $('#wod-wait-text').textContent = WAIT_TEXT[status];
  $('#wod-out').hidden = status !== 'owned';
  document.body.classList.toggle('owns-wod', status === 'owned');
  if (status === 'owned') showWod();
}

async function showWod() {
  try {
    wod.data ??= await loadWods();
    renderWod();
  } catch (err) {
    console.error(err);
    $('#wod-out').innerHTML = '<p class="card error">The workouts could not be loaded. Check your connection and try again.</p>';
  }
}

function currentWorkout() {
  const w = workoutFor(wod.data, wod.ymd);
  return { w, mode: pickMode(w, wod.savedMode) };
}

function planDayOn(ymd) {
  if (!plan || !access('fullPlan')) return null;
  for (const wk of plan.weeks) for (const d of wk.days) if (d.ymd === ymd) return d;
  return null;
}

/** Only the current week's workouts are shown; from Sunday 6 pm, next week's (wodWeekAnchor). */
function renderWod() {
  if (!wod.data || !access('wod')) return;
  const today = todayYmd();
  const anchor = wodWeekAnchor();
  wod.ymd = clampToWeek(wod.ymd, anchor);
  const { w, mode } = currentWorkout();
  const units = currentUnits();
  $('#wod-out').innerHTML = dayStrip(weekDates(anchor), { selected: wod.ymd, today, attr: 'wod-day' })
    + wodCard(w, mode, wod.ymd, { today, units })
    + planNote(planDayOn(wod.ymd))
    + infoPanel(wod.data.meta, units);
}

$('#wod-out').addEventListener('click', (e) => {
  const day = e.target.closest('[data-wod-day]');
  const mode = e.target.closest('[data-wod-mode]');
  const units = e.target.closest('[data-wod-units]');
  if (day) { wod.ymd = day.dataset.wodDay; renderWod(); return; }
  if (mode) { setMode(mode.dataset.wodMode); return; }
  if (units) { setUnits(units.dataset.wodUnits); renderWod(); return; } // the plan page follows this choice too
  if (e.target.closest('[data-wod-copy]')) copyWod();
});

function setMode(m) {
  wod.savedMode = m;
  setWodMode(uid(), m);
  renderWod();
  if (site.user) cloud.saveWodMode(uid(), m).catch((err) => console.warn('Could not save WOD mode:', err));
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
  renderWod();
}

/** The plan on this device, if it is still valid. */
function localPlan() {
  const saved = loadInputs();
  return saved && !Object.keys(validateInputs(saved)).length ? buildPlan(saved) : null;
}

/**
 * The account's copy of the plan on this device, which may have been changed or deleted on another device,
 * or the account's newest plan (e.g. on a new phone). A change the account never got stays as it is here.
 */
async function lookUpPlan() {
  planLookedUpFor = uid();
  try {
    const plans = await cloud.listPlans(uid());
    const local = loadInputs();
    const id = local && planIdFor(local);
    if (id && isUnsaved(uid(), id)) return;
    const p = plans.find((x) => x.id === id) || plans[0];
    plan = p ? buildPlan(p.inputs) : null;
    renderWod();
  } catch (err) {
    console.warn('Could not load your plan:', err);
  }
}

// ---------- start ----------

function onUser(user, { signedOut }) {
  if (!user) {
    wod.savedMode = null;
    planLookedUpFor = null;
    if (signedOut) plan = null;
    return;
  }
  loadWodMode();
}

function onAccess() {
  updateView();
  if (access('fullPlan') && planLookedUpFor !== uid()) lookUpPlan();
}

/** Back from the plan page, which may have built, changed or deleted the plan, or switched kg/lb. */
function onShow() {
  plan = localPlan();
  if (!plan) planLookedUpFor = null; // no plan on this device: look in the account again
  onAccess();
}

plan = localPlan();
startSite({ page: 'wod', onUser, onAccess, onShow });

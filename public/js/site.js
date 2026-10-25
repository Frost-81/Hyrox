// What every page shares: the account menu, signing in (with email confirmation and the Terms),
// buying, the toast, and moving between the Plan and WOD pages without reloading. Each page module
// (app.js for the plan, wodPage.js for the WOD) calls startSite() with its own hooks.
import { canUse, hasSubscription, portalLoginUrl, PRODUCTS } from './billing.js';
import { clearInputs, forgetUser, getAccessHint, setAccessHint } from './progress.js';
import * as cloud from './cloud.js';
import { trackPageView } from './analytics.js';

export const $ = (sel) => document.querySelector(sel);

export const state = {
  user: null,
  subs: new Set(), // products the user has paid for: 'plan' (one-time), 'wod' (active subscription)
  subsKnown: false,
  authKnown: false, // until Firebase reports, a page doesn't know what a returning visitor owns
  authAvailable: true,
  pendingProduct: null, // buy this once signed in
};

export const access = (feature) => canUse(feature, state);

const pages = []; // the hooks of every page module started so far: { page, onUser, onAccess, onShow }
const notifyUser = (user, info) => pages.forEach((p) => p.onUser?.(user, info));
const notifyAccess = () => pages.forEach((p) => p.onAccess?.());
let stopSubs = () => {};
let paid = null; // { product, slow, timer }: back from Stripe Checkout, until the purchase unlocks
let resolveAuth;
const authReady = new Promise((r) => { resolveAuth = r; });

/**
 * What a page shows for a product: 'owned'; 'locked' (the buy card); 'loading' (this device saw the user
 * own it and sign-in is still loading); 'unlocking' (just paid, waiting for Stripe) or 'slow' (still waiting).
 */
export function accessStatus(product) {
  if (state.user && state.subs.has(product)) return 'owned';
  const known = state.authKnown && (!state.user || state.subsKnown);
  if (known && !state.user) return 'locked';
  if (paid?.product === product) return paid.slow ? 'slow' : 'unlocking';
  if (!known && getAccessHint().includes(product)) return 'loading';
  return 'locked';
}

/** The message one of our Cloud Functions sent, or the fallback for anything unexpected. */
export const fnError = (err, fallback) => (err.code && err.code !== 'functions/internal' && err.message) || fallback;

// ---------- markup shared by every page ----------

const AGREE_TEXT = 'I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>, including storing the training data and heart rates I enter.';
const GOOGLE_G = '<svg class="google-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const EYE = `
  <svg class="eye-open" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
  <svg class="eye-closed" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/></svg>`;

document.body.insertAdjacentHTML('beforeend', `
  <dialog id="auth-dialog" class="auth-dialog no-print" aria-labelledby="auth-title">
    <form method="dialog" class="dialog-close"><button class="btn small ghost" aria-label="Close">✕</button></form>

    <div id="auth-main" class="auth-step">
      <h2 id="auth-title">Sign in</h2>
      <button type="button" class="btn big google" id="google-btn">${GOOGLE_G}Continue with Google</button>
      <p class="or"><span>or</span></p>
      <form id="email-form" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="password">Password <span class="muted" id="pw-rule" hidden>(6+ characters)</span></label>
          <div class="password-wrap">
            <input type="password" id="password" autocomplete="current-password" minlength="6" required>
            <button type="button" class="pw-toggle" id="pw-toggle" aria-label="Show password" aria-pressed="false">${EYE}</button>
          </div>
          <button type="button" class="btn link small forgot" id="forgot-btn">Forgot password?</button>
        </div>
        <div id="agree-row" class="agree-box" hidden>
          <label class="check-row small"><input type="checkbox" id="agree"><span>${AGREE_TEXT}</span></label>
          <p class="error" id="agree-error" role="alert"></p>
        </div>
        <p class="error" id="auth-error" role="alert"></p>
        <button type="submit" class="btn primary big" id="email-submit">Sign in</button>
      </form>
      <p class="small center auth-switch"><span id="mode-text">New here?</span> <button type="button" class="btn link" id="mode-toggle">Create an account</button></p>
    </div>

    <div id="reset-step" class="auth-step" hidden>
      <h2>Reset your password</h2>
      <p class="muted">Enter the email of your account and we'll send you a link to choose a new password.</p>
      <form id="reset-form" novalidate>
        <div class="field">
          <label for="reset-email">Email</label>
          <input type="email" id="reset-email" autocomplete="email" required>
        </div>
        <p class="error" id="reset-error" role="alert"></p>
        <p class="note ok small" id="reset-note" role="status" hidden></p>
        <button type="submit" class="btn primary big" id="reset-submit">Send reset link</button>
      </form>
      <p class="small center auth-switch"><button type="button" class="btn link" id="reset-back">Back to sign in</button></p>
    </div>

    <div id="verify-step" class="auth-step" hidden>
      <h2>Confirm your email</h2>
      <p class="muted" id="verify-text"></p>
      <p class="waiting small"><span class="spinner" aria-hidden="true"></span>Waiting for you to open the link…</p>
      <p class="error" id="verify-error" role="alert"></p>
      <button type="button" class="btn primary big" id="verify-done">I've confirmed my email</button>
      <p class="small center auth-switch">
        <button type="button" class="btn link" id="verify-resend">Send a new link</button>
        <span class="muted" aria-hidden="true">·</span>
        <button type="button" class="btn link" id="verify-other">Use a different email</button>
      </p>
    </div>

    <div id="terms-step" class="auth-step" hidden>
      <h2>One last step</h2>
      <p class="muted">Welcome! To finish creating your account, please agree to the Terms and Privacy Policy.</p>
      <div class="agree-box">
        <label class="check-row small"><input type="checkbox" id="terms-agree"><span>${AGREE_TEXT}</span></label>
        <p class="error" id="terms-error" role="alert"></p>
      </div>
      <button type="button" class="btn primary big" id="terms-done">Continue</button>
      <p class="small muted center">Close this window to cancel. No account is kept.</p>
    </div>
  </dialog>

  <div id="toast" class="toast" role="status" aria-live="polite"><span id="toast-msg"></span><button type="button" class="btn small" id="toast-action" hidden></button></div>`);

const dialog = $('#auth-dialog');

// ---------- toast ----------

let toastTimer;
/** A short message; pass { action, onAction } for a button such as Undo. */
export function toast(msg, { action = null, onAction = null } = {}) {
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

// ---------- small helpers for the dialog buttons ----------

/** Runs fn with the button disabled (and showing busyText, if given) so it can't be pressed twice. */
async function withBusy(btn, fn, busyText = null) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  if (busyText) btn.textContent = busyText;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (busyText) btn.innerHTML = label;
  }
}

const cooldowns = new Map();
/** After an email is sent, its button rests for a few seconds so it isn't sent twice by accident. */
function cooldown(btn, label, secs = 30) {
  clearInterval(cooldowns.get(btn));
  btn.disabled = true;
  const tick = () => {
    if (secs <= 0) {
      clearInterval(cooldowns.get(btn));
      btn.disabled = false;
      btn.textContent = label;
      return;
    }
    btn.textContent = `${label} (${secs--})`;
  };
  tick();
  cooldowns.set(btn, setInterval(tick, 1000));
}

// ---------- the sign-in dialog ----------

let authMode = 'signin'; // 'signin' | 'create'
let signedInFromDialog = false;
let verify = null; // { user, timer } while a new email account confirms its address
let termsUser = null; // a brand-new Google account, until the Terms are accepted

/** Open the dialog. mode: 'signin' | 'create'; step: 'main' or 'reset' (Forgot password). */
export function openAuth({ mode = 'signin', step = 'main' } = {}) {
  if (!state.authAvailable) {
    toast('Sign-in is unavailable right now, please try again later.');
    return;
  }
  setAuthMode(mode);
  $('#agree').checked = false;
  showPassword(false);
  if (step === 'reset') openReset();
  else showAuthStep('main');
  if (!dialog.open) dialog.showModal();
}

function showAuthStep(step) {
  for (const s of ['main', 'reset', 'verify', 'terms']) $(`#${s === 'main' ? 'auth-main' : `${s}-step`}`).hidden = s !== step;
}

/** Sign in and Create account share the form; only Create asks for the Terms. */
function setAuthMode(mode) {
  authMode = mode;
  const create = mode === 'create';
  $('#auth-title').textContent = create ? 'Create your account' : 'Sign in';
  $('#agree-row').hidden = !create;
  $('#forgot-btn').hidden = create;
  $('#pw-rule').hidden = !create;
  $('#email-submit').textContent = create ? 'Create account' : 'Sign in';
  $('#password').autocomplete = create ? 'new-password' : 'current-password';
  $('#mode-text').textContent = create ? 'Already have an account?' : 'New here?';
  $('#mode-toggle').textContent = create ? 'Sign in' : 'Create an account';
  $('#auth-error').textContent = '';
  setAgreeError('');
}

function setAgreeError(msg) {
  $('#agree-error').textContent = msg;
  $('#agree-row').classList.toggle('invalid', !!msg);
}

/** Creating an account needs the Terms box ticked, whichever way the user signs up. */
function agreed() {
  if (authMode !== 'create' || $('#agree').checked) return true;
  setAgreeError('Please agree to the Terms and Privacy Policy to create an account.');
  $('#agree').focus();
  return false;
}
$('#agree').addEventListener('change', () => { if ($('#agree').checked) setAgreeError(''); });

$('#mode-toggle').addEventListener('click', () => setAuthMode(authMode === 'create' ? 'signin' : 'create'));

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

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email or password is wrong.',
  'auth/wrong-password': 'Email or password is wrong.',
  'auth/user-not-found': 'No account with that email. Create one below.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/invalid-email': 'That email address looks wrong.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not switched on yet.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
};
// Closing the Google window is a choice, not an error.
const QUIET_ERRORS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

async function runAuth(fn) {
  $('#auth-error').textContent = '';
  try {
    const { user, isNew } = await fn();
    if (cloud.needsVerify(user)) {
      startVerify(user, true);
      return;
    }
    // A new Google account made from Sign in hasn't seen the Terms yet.
    if (isNew && authMode !== 'create') {
      startTerms(user);
      return;
    }
    finishSignIn();
  } catch (err) {
    if (!QUIET_ERRORS.includes(err.code)) $('#auth-error').textContent = AUTH_ERRORS[err.code] || 'Sign-in failed. Please try again.';
  }
}

function finishSignIn() {
  signedInFromDialog = true;
  dialog.close();
  runPending();
}

$('#google-btn').addEventListener('click', (e) => {
  if (agreed()) withBusy(e.currentTarget, () => runAuth(() => cloud.signInGoogle()));
});

$('#email-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!agreed()) return;
  const create = authMode === 'create';
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !$('#email').checkValidity()) {
    $('#auth-error').textContent = 'Enter your email address.';
    $('#email').focus();
    return;
  }
  if (password.length < (create ? 6 : 1)) {
    $('#auth-error').textContent = create ? 'Use at least 6 characters for your password.' : 'Enter your password.';
    $('#password').focus();
    return;
  }
  withBusy($('#email-submit'), () => runAuth(() => cloud.signInEmail(email, password, create)), create ? 'Creating account…' : 'Signing in…');
});

dialog.addEventListener('close', () => {
  // Closed without signing in: forget the purchase that was waiting for it.
  if (!signedInFromDialog) state.pendingProduct = null;
  signedInFromDialog = false;
  if (verify) {
    // Closed before confirming the email: the account doesn't stay half signed in.
    stopVerify();
    cloud.signOutUser();
  }
  if (termsUser) {
    // Closed without accepting the Terms: the new account is removed again.
    const user = termsUser;
    termsUser = null;
    cloud.deleteNewUser(user).catch(() => cloud.signOutUser()).finally(() => toast('No account was created.'));
  }
  showAuthStep('main');
});

// ---------- forgot password ----------

function openReset() {
  $('#reset-email').value = $('#email').value.trim();
  $('#reset-error').textContent = '';
  $('#reset-note').hidden = true;
  showAuthStep('reset');
  $('#reset-email').focus();
}

$('#forgot-btn').addEventListener('click', openReset);

$('#reset-back').addEventListener('click', () => {
  if ($('#reset-email').value.trim()) $('#email').value = $('#reset-email').value.trim();
  setAuthMode('signin');
  showAuthStep('main');
});

$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#reset-email');
  const email = input.value.trim();
  $('#reset-error').textContent = '';
  $('#reset-note').hidden = true;
  if (!email || !input.checkValidity()) {
    $('#reset-error').textContent = 'Enter the email address of your account.';
    input.focus();
    return;
  }
  const btn = $('#reset-submit');
  try {
    // Unknown emails succeed too (functions/index.js), so the form can't tell who has an account.
    await withBusy(btn, () => cloud.sendPasswordReset(email), 'Sending…');
  } catch (err) {
    $('#reset-error').textContent = fnError(err, 'Could not send the email. Please try again.');
    return;
  }
  $('#reset-note').textContent = `If ${email} has an account, a link to choose a new password is on its way. Check your spam folder too.`;
  $('#reset-note').hidden = false;
  cooldown(btn, 'Send again');
});

// ---------- email confirmation ----------

/** The page the confirmation link leads back to. */
const thisPage = () => (document.body.dataset.page === 'wod' ? '/wod' : '/');

async function sendVerifyLink() {
  $('#verify-error').textContent = '';
  $('#verify-text').textContent = 'Sending a link to your email…';
  try {
    const email = await cloud.sendVerifyEmail(thisPage());
    $('#verify-text').textContent = `We emailed a link to ${email}. Open it to confirm your email and this window finishes signing you in. Check your junk or spam folder too.`;
    cooldown($('#verify-resend'), 'Send a new link');
  } catch (err) {
    $('#verify-text').textContent = '';
    $('#verify-error').textContent = fnError(err, 'Could not send the email. Please try again.');
  }
}

/** Ask a new email and password account to confirm its address, emailing the link if send. */
function startVerify(user, send = false) {
  if (verify?.user.uid !== user.uid) {
    stopVerify();
    // Check every few seconds, so the sign-in finishes by itself once the link is opened (often on a phone).
    verify = { user, timer: setInterval(() => finishVerify({ quiet: true }), 5000) };
    $('#verify-error').textContent = '';
    $('#verify-text').textContent = `Confirm ${user.email} to finish signing in. We can email you a link.`;
    showAuthStep('verify');
    if (!dialog.open) dialog.showModal();
  }
  if (send) sendVerifyLink();
}

function stopVerify() {
  if (verify) clearInterval(verify.timer);
  verify = null;
}

/** Once the link was opened (another tab or device): finish signing in. */
async function finishVerify({ quiet = false } = {}) {
  if (!verify) return;
  const { user } = verify;
  if (!quiet) $('#verify-error').textContent = '';
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
  stopVerify();
  signedInFromDialog = true;
  dialog.close();
  toast('Email confirmed. You are signed in.');
  handleUser(user);
}

$('#verify-done').addEventListener('click', (e) => withBusy(e.currentTarget, () => finishVerify(), 'Checking…'));
$('#verify-resend').addEventListener('click', () => sendVerifyLink());
$('#verify-other').addEventListener('click', async () => {
  stopVerify();
  await cloud.signOutUser();
  $('#password').value = '';
  setAuthMode('create');
  showAuthStep('main');
  $('#email').select();
});
// Coming back from the tab where the link was opened.
window.addEventListener('focus', () => finishVerify({ quiet: true }));

// ---------- Terms for a new Google account ----------

function startTerms(user) {
  termsUser = user;
  $('#terms-agree').checked = false;
  $('#terms-error').textContent = '';
  showAuthStep('terms');
}

$('#terms-agree').addEventListener('change', () => { if ($('#terms-agree').checked) $('#terms-error').textContent = ''; });
$('#terms-done').addEventListener('click', () => {
  if (!$('#terms-agree').checked) {
    $('#terms-error').textContent = 'Tick the box to agree, or close this window to cancel.';
    return;
  }
  termsUser = null;
  finishSignIn();
});

// ---------- account menu ----------

/** The footer link to Stripe's portal login, with the email filled in: only for a subscription (the WOD), not the one-time plan. */
function updatePortalLinks() {
  const url = hasSubscription(state.subs) ? portalLoginUrl(state.user?.email) : '';
  document.querySelectorAll('[data-portal-link]').forEach((el) => {
    el.hidden = !url;
    if (el.tagName === 'A' && url) el.href = url;
  });
}

function updateAccountUi() {
  const { user } = state;
  $('#account').hidden = false;
  $('#account-email').textContent = user ? (user.email || 'Signed in') : '';
  $('#sign-in-btn').hidden = !!user;
  $('#account-menu').hidden = !user;
  $('#account-menu').open = false;
  $('#billing-btn').hidden = !hasSubscription(state.subs);
  updatePortalLinks();
}

$('#sign-in-btn').addEventListener('click', () => openAuth({ mode: 'signin' }));
$('#sign-out-btn').addEventListener('click', () => cloud.signOutUser());

// Close the account menu when clicking elsewhere.
document.addEventListener('click', (e) => {
  const menu = $('#account-menu');
  if (menu.open && !menu.contains(e.target)) menu.open = false;
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
      openAuth({ mode: 'signin' });
      toast('For your security, sign in again, then choose Delete my account.');
    } else {
      console.error(err);
      toast('Could not delete your account right now. Email info@hybridprog.com and we will do it for you.');
    }
  }
});

// ---------- purchases ----------

/** Buy a product: signs in (or creates an account) first if needed, then opens Stripe Checkout. */
export async function subscribe(product) {
  await authReady;
  if (!state.user) {
    state.pendingProduct = product;
    openAuth({ mode: 'create' });
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

/** The purchase that was waiting for sign-in, once we know what the user already has. */
function runPending() {
  if (!state.pendingProduct || !state.user || !state.subsKnown || termsUser || dialog.open) return;
  const product = state.pendingProduct;
  state.pendingProduct = null;
  subscribe(product);
}

/** Puts the address bar back without the parameters we just read. */
function replaceQuery(params) {
  const q = params.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
}

/** Back from Stripe Checkout with ?paid=plan or ?paid=wod: wait for the purchase to unlock. */
function checkPaidReturn() {
  const params = new URLSearchParams(location.search);
  const product = params.get('paid');
  if (!product) return;
  params.delete('paid');
  replaceQuery(params);
  if (!PRODUCTS[product]) return;
  paid = {
    product,
    slow: false,
    timer: setTimeout(() => {
      if (!paid) return;
      paid.slow = true;
      notifyAccess();
    }, 30000),
  };
  toast(`Thanks! Unlocking your ${PRODUCTS[product].name}…`);
}

/** ?signin=1 or ?signin=reset (links from our email page) opens the dialog once sign-in is known. */
function signInLinkStep() {
  const params = new URLSearchParams(location.search);
  const step = params.get('signin');
  if (!step) return null;
  params.delete('signin');
  replaceQuery(params);
  return step === 'reset' ? 'reset' : 'main';
}

/** Purchases changed (or first arrived). */
function onSubs(subs) {
  state.subs = subs;
  state.subsKnown = true;
  setAccessHint([...subs]);
  $('#billing-btn').hidden = !hasSubscription(subs);
  updatePortalLinks();
  if (paid && subs.has(paid.product)) {
    toast(`Your ${PRODUCTS[paid.product].name} is unlocked.`);
    clearTimeout(paid.timer);
    paid = null;
  }
  notifyAccess();
  runPending();
}

// ---------- sign-in state ----------

let userSeq = 0;

async function handleUser(user) {
  const seq = ++userSeq;
  if (cloud.needsVerify(user)) {
    // It may have been confirmed elsewhere (another tab, a phone) since this session started.
    const confirmed = await cloud.checkVerified(user).catch(() => false);
    if (seq !== userSeq) return;
    if (!confirmed) {
      // Not signed in until the email is confirmed (Firestore refuses until then).
      startVerify(user);
      user = null;
    }
  }
  const signedOut = !!state.user && !user;
  state.authKnown = true;
  state.user = user;
  stopSubs();
  stopSubs = () => {};
  state.subs = new Set();
  state.subsKnown = false;
  updateAccountUi();
  if (!user) {
    setAccessHint([]);
    // Signing out leaves nothing of the account's plan on this device.
    if (signedOut) clearInputs();
  }
  notifyUser(user, { signedOut });
  notifyAccess();
  if (user) {
    cloud.watchSubs(user.uid, onSubs).then((stop) => {
      if (state.user?.uid === user.uid) stopSubs = stop;
      else stop();
    });
  }
  resolveAuth();
}

// ---------- moving between the pages ----------
// Plan (/) and WOD (/wod) are two real pages, each with its own title, description and FAQ data for search
// engines. Moving between them stays in this document: the other page's view (its <div class="view">) is
// fetched once and kept, and its module started, so the header, sign-in and purchases don't load again.

const PAGES = {
  plan: { path: '/', module: './app.js' },
  wod: { path: '/wod', module: './wodPage.js' },
};
// What the head says about a page, swapped along with the view (the browser's Share button uses the canonical link).
const PAGE_HEAD = 'meta[name="description"], meta[name="keywords"], link[rel="canonical"], meta[property^="og:"], script[type="application/ld+json"]';

let current = null; // the page shown
const fetches = {}; // page → its HTML
const loaded = {}; // page → { title, head } once its view is in this document and its module started
const scrollOf = {}; // page → how far down it was, for Back and Forward
let navSeq = 0;

/** The page at a path ('/', '/index.html', '/wod', '/wod.html'), or null for any other path. */
function pageAt(pathname) {
  const path = pathname.replace(/(\/index)?\.html$/, '').replace(/\/+$/, '') || '/';
  return Object.keys(PAGES).find((k) => PAGES[k].path === path) || null;
}

/** The page a link leads to, if it can be shown here; null for every other link. */
function navTarget(el) {
  const a = el.closest?.('a[href]');
  if (!a || a.origin !== location.origin || a.search || a.getAttribute('href').includes('#')) return null;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  return pageAt(a.pathname);
}

function fetchPage(name) {
  if (!fetches[name]) {
    fetches[name] = fetch(PAGES[name].path).then((r) => {
      if (!r.ok) throw new Error(`${PAGES[name].path}: ${r.status}`);
      return r.text();
    });
    fetches[name].catch(() => { delete fetches[name]; }); // allow a retry
  }
  return fetches[name];
}

/** Put a page's view into this document (hidden) and start its module, once. */
function loadPage(name) {
  if (!loaded[name]) {
    loaded[name] = (async () => {
      const doc = new DOMParser().parseFromString(await fetchPage(name), 'text/html');
      const view = doc.querySelector(`.view[data-view="${name}"]`);
      if (!view) throw new Error(`${PAGES[name].path} has no view`);
      view.hidden = true;
      $('.site-footer').before(document.adoptNode(view));
      try {
        await import(PAGES[name].module); // the module finds its view in the document, so it goes in first
      } catch (err) {
        view.remove();
        throw err;
      }
      return { title: doc.title, head: [...doc.head.querySelectorAll(PAGE_HEAD)].map((el) => document.adoptNode(el)) };
    })();
    loaded[name].catch(() => { delete loaded[name]; });
  }
  return loaded[name];
}

/** Show a page in place of the current one. push: a link was clicked (rather than Back or Forward). */
async function showPage(name, { push = true } = {}) {
  const seq = ++navSeq;
  if (name === current) {
    if (push) window.scrollTo(0, 0);
    return;
  }
  let info;
  try {
    info = await loadPage(name);
  } catch (err) {
    console.error(err);
    if (seq === navSeq) location.assign(PAGES[name].path); // open it the usual way instead
    return;
  }
  if (seq !== navSeq) return; // another link was clicked in the meantime
  const leaving = $(`.view[data-view="${current}"]`);
  const focusLost = leaving.contains(document.activeElement); // e.g. the "Open today's WOD" button
  scrollOf[current] = window.scrollY;
  if (push) {
    history.scrollRestoration = 'manual'; // scrollOf puts it back
    history.pushState(null, '', PAGES[name].path);
  }
  current = name;
  for (const el of document.querySelectorAll('.view[data-view]')) el.hidden = el.dataset.view !== name;
  document.body.dataset.page = name;
  document.head.querySelectorAll(PAGE_HEAD).forEach((el) => el.remove());
  document.head.append(...info.head);
  document.title = info.title;
  trackPageView();
  markTab();
  $('#account-menu').open = false;
  window.scrollTo({ top: push ? 0 : scrollOf[name] ?? 0, behavior: 'instant' }); // a new page, not a glide
  if (focusLost) {
    const h1 = $(`.view[data-view="${name}"] h1`);
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  }
  pages.filter((p) => p.page === name).forEach((p) => p.onShow?.());
}

function markTab() {
  for (const a of document.querySelectorAll('.tabs a')) {
    if (pageAt(a.pathname) === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function startNav() {
  current = document.body.dataset.page;
  if (!PAGES[current] || !$(`.view[data-view="${current}"]`)) return;
  loaded[current] = Promise.resolve({ title: document.title, head: [...document.head.querySelectorAll(PAGE_HEAD)] });
  document.addEventListener('click', (e) => {
    const name = navTarget(e.target);
    if (!name || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    showPage(name);
  });
  // Fetch the other page as soon as the pointer (or focus) is on its link, so the click shows it at once.
  const prefetch = (e) => {
    const name = navTarget(e.target);
    if (name && !loaded[name]) fetchPage(name).catch(() => {});
  };
  document.addEventListener('pointerover', prefetch);
  document.addEventListener('focusin', prefetch);
  window.addEventListener('popstate', () => {
    const name = pageAt(location.pathname);
    if (name) showPage(name, { push: false });
  });
}

/**
 * Start a page module. page: 'plan' | 'wod'. onUser(user | null, { signedOut }) runs when the sign-in
 * changes; onAccess() whenever what the page should show may have changed (see accessStatus); onShow()
 * each time the page is shown in place of the other one, which may have changed what both use (kg/lb,
 * the plan, Solo/Team). The first page also starts the shared parts; a page opened later catches up.
 */
export function startSite(hooks) {
  pages.push(hooks);
  if (pages.length > 1) {
    if (state.authKnown) hooks.onUser?.(state.user, { signedOut: false });
    hooks.onAccess?.();
    return;
  }
  startNav();
  checkPaidReturn();
  let linkStep = signInLinkStep();
  updatePortalLinks();
  notifyAccess();
  authReady.then(() => {
    if (linkStep && !state.user && !verify && !dialog.open) openAuth({ mode: 'signin', step: linkStep });
    linkStep = null;
  });
  cloud.watchUser(handleUser).then((ok) => {
    state.authAvailable = ok;
    if (ok) return;
    state.authKnown = true;
    resolveAuth();
    notifyAccess();
  });
}

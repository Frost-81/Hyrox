// The page our emails link to (/auth-action): confirms an email address or sets a new password, then
// leads back to the site. The links are made in functions/index.js (actionLink) and carry
// ?mode=verifyEmail|resetPassword&oobCode=…, plus &next=/wod when the user signed up on the WOD page.
import * as cloud from './cloud.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const code = params.get('oobCode');
const next = params.get('next') === '/wod' ? '/wod' : '/';
const card = $('#action-card');

/** A result: a tick (ok) or an exclamation mark, a heading, a line of text and one button. */
function message({ ok, title, text, button, href }) {
  card.innerHTML = `
    <div class="action-icon${ok ? ' ok' : ''}" aria-hidden="true">${ok ? '✓' : '!'}</div>
    <h1>${esc(title)}</h1>
    <p>${esc(text)}</p>
    <a class="btn primary big" href="${esc(href)}">${esc(button)}</a>`;
  card.querySelector('a').focus({ preventScroll: true });
}

const expired = (what) => ({
  title: 'This link has expired',
  text: `${what} links work once and expire after a while.`,
});

// ---------- confirm an email address ----------

async function confirmEmail() {
  let email;
  try {
    email = await cloud.actionCodeEmail(code);
    await cloud.applyEmailCode(code);
  } catch {
    // Already used (often opened twice, or by a mail scanner): fine if the address is confirmed anyway.
    const user = await cloud.currentUser().catch(() => null);
    const confirmed = user && (await cloud.checkVerified(user).catch(() => false));
    if (confirmed) {
      message({ ok: true, title: 'Email confirmed', text: `${user.email} is already confirmed. You're signed in.`, button: 'Continue', href: next });
    } else {
      message({ ...expired('Confirmation'), text: `${expired('Confirmation').text} Sign in and we'll send you a new one.`, button: 'Sign in', href: `${next}?signin=1` });
    }
    return;
  }
  // Signed in on this browser too: refresh the session so it knows the address is confirmed.
  const user = await cloud.currentUser().catch(() => null);
  const here = user?.email?.toLowerCase() === email?.toLowerCase() && (await cloud.checkVerified(user).catch(() => false));
  message(here
    ? { ok: true, title: 'Email confirmed', text: `Thanks! ${email} is confirmed and you're signed in.`, button: 'Continue', href: next }
    : { ok: true, title: 'Email confirmed', text: `Thanks! ${email} is confirmed. If you signed up in another tab or on another device, it finishes signing you in by itself. Or sign in here.`, button: 'Sign in', href: `${next}?signin=1` });
}

// ---------- choose a new password ----------

const EYE = `
  <svg class="eye-open" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
  <svg class="eye-closed" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/></svg>`;

const RESET_ERRORS = {
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
};

async function resetPassword() {
  let email;
  try {
    email = await cloud.resetCodeEmail(code);
  } catch {
    message({ ...expired('Reset'), text: `${expired('Reset').text} Ask for a new one and use it within an hour.`, button: 'Send a new link', href: `${next}?signin=reset` });
    return;
  }
  card.innerHTML = `
    <h1>Choose a new password</h1>
    <p class="muted">For ${esc(email)}</p>
    <form id="new-pw-form" novalidate>
      <input type="email" autocomplete="username" value="${esc(email)}" hidden>
      <div class="field">
        <label for="new-pw">New password <span class="muted">(6+ characters)</span></label>
        <div class="password-wrap">
          <input type="password" id="new-pw" autocomplete="new-password" minlength="6" required>
          <button type="button" class="pw-toggle" id="pw-toggle" aria-label="Show password" aria-pressed="false">${EYE}</button>
        </div>
      </div>
      <p class="error" id="new-pw-error" role="alert"></p>
      <button type="submit" class="btn primary big" id="new-pw-btn">Save new password</button>
    </form>`;
  const input = $('#new-pw');
  const toggle = $('#pw-toggle');
  input.focus();
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    input.focus();
  });
  $('#new-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = input.value;
    const error = $('#new-pw-error');
    const btn = $('#new-pw-btn');
    error.textContent = '';
    if (password.length < 6) {
      error.textContent = 'Use at least 6 characters.';
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await cloud.setNewPassword(code, password);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save new password';
      if (err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code') {
        message({ ...expired('Reset'), text: `${expired('Reset').text} Ask for a new one and use it within an hour.`, button: 'Send a new link', href: `${next}?signin=reset` });
      } else {
        error.textContent = RESET_ERRORS[err.code] || 'Could not save your password. Please try again.';
      }
      return;
    }
    // Sign straight in with the new password, so the next page opens signed in.
    const signedIn = await cloud.signInEmail(email, password, false).then(() => true, () => false);
    if (signedIn) {
      message({ ok: true, title: 'Password changed', text: "You're signed in with your new password. Taking you back…", button: 'Continue', href: next });
      setTimeout(() => location.assign(next), 2000);
    } else {
      message({ ok: true, title: 'Password changed', text: 'Sign in with your new password.', button: 'Sign in', href: `${next}?signin=1` });
    }
  });
}

// ---------- start ----------

if (code && mode === 'verifyEmail') confirmEmail();
else if (code && mode === 'resetPassword') resetPassword();
else message({ title: "This link isn't valid", text: 'It may be incomplete. Copy the whole link from the email, or ask for a new one.', button: 'Go to the site', href: '/' });

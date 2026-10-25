// Cookie and storage consent bar (Quebec Loi 25: privacy by default, clear choice, easy to change).
// Essential storage (sign-in, saved plan) is always on. Optional categories (Google Analytics, see
// analytics.js) are off until the visitor accepts them: check hasConsent('optional'), and listen for
// the window 'consentchange' event to follow a change of mind.

const KEY = 'hybrid:consent';
const VERSION = 2; // 2: Google Analytics added, so earlier answers are asked again

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.v === VERSION ? v : null;
  } catch {
    return null;
  }
}

function write(optional) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, optional, date: new Date().toISOString() }));
  } catch { /* storage blocked: the bar shows again next visit */ }
  window.dispatchEvent(new Event('consentchange'));
}

/** 'essential' is always true; 'optional' only after the visitor accepted it. */
export function hasConsent(category) {
  if (category === 'essential') return true;
  return !!read()?.optional;
}

let bar = null;

function show() {
  if (bar) { bar.hidden = false; return; }
  bar = document.createElement('div');
  bar.className = 'consent-bar no-print';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Cookie choices');
  bar.innerHTML = `
    <p>We use essential cookies and browser storage to sign you in and save your plan. If you accept, Google Analytics
      also counts visits so we can improve the site. No ads. <a href="/privacy#cookies">Privacy</a></p>
    <div class="consent-btns">
      <button type="button" class="btn small ghost" data-consent="essential">Essential only</button>
      <button type="button" class="btn small primary" data-consent="all">Accept</button>
    </div>`;
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-consent]');
    if (!b) return;
    write(b.dataset.consent === 'all');
    bar.hidden = true;
  });
  document.body.append(bar);
}

/** Show the bar if no choice is stored; any [data-cookie-settings] link reopens it. */
export function initConsent() {
  if (!read()) show();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-cookie-settings]')) return;
    e.preventDefault();
    show();
  });
}

initConsent();

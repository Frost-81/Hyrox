// Cookie and storage consent bar (Quebec Loi 25: privacy by default, clear choice, easy to change).
// The site only uses essential storage today (sign-in, saved plan). Optional categories are off
// until the visitor accepts them; check hasConsent('optional') before adding analytics or similar.

const KEY = 'hybrid:consent';
const VERSION = 1;

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
    <p>We use only essential cookies and browser storage to sign you in and save your plan. No ads, no tracking.
      <a href="/privacy#cookies">Privacy</a></p>
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

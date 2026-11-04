// HTML for the Workout of the Day view. All content comes from wods.json and goes through esc();
// weights in it are written in kg and rewritten in lb when the athlete picks pounds.
import { esc, sheetRow } from './render.js';
import { cap, wodLine } from './lines.js';
import { fmtDate, parseYmd, textToUnits, UNITS } from './plan.js';

const INTENSITY = { hard: 'Hard', moderate: 'Moderate', easy: 'Easy', recovery: 'Recovery' };
// Same colours as the plan: hard red, moderate orange/yellow, easy green, recovery grey (rest).
const INTENSITY_CLASS = { hard: 'effort-hard', moderate: 'effort-moderate', easy: 'effort-easy', recovery: 'effort-rest' };
const MODE_TEXT = { solo: 'Solo', team: 'Team of 2' };
// Monday first, matching plan.js.
const FULL_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The real weekday of the date shown (the workout's own weekday can differ outside the first 365-day cycle). */
const dayName = (ymd) => FULL_DAY[(new Date(parseYmd(ymd)).getUTCDay() + 6) % 7];

function chip(text, cls = '') {
  return `<span class="tag${cls ? ` ${cls}` : ''}">${esc(text)}</span>`;
}

/** Escaped text with its weights in the athlete's units. */
const txt = (s, units) => esc(textToUnits(s, units));

/**
 * The heading of one part of a workout: { title, side, sub }. "Part A (15 min)" with "Every 2.5 min x 6 sets, heavy
 * but unbroken" -> 'Part A · 15 min', 'Every 2.5 min x 6 sets', 'Heavy but unbroken'.
 */
export function blockHead(b) {
  const [, base, inner] = /^(.*?) \((.*)\)$/.exec(b.label || '') || [null, b.label || '', ''];
  const scheme = b.scheme ? cap(b.scheme) : '';
  const join = (...parts) => parts.filter(Boolean).join(' · ');
  let title = join(base, inner);
  let side = '';
  let sub = '';
  if (scheme && scheme.length <= 16 && !/[,;]/.test(scheme)) {
    // Short enough to go in the title. "Part B (28 min)" + "AMRAP 28 min" says 28 min once.
    title = join(base, scheme.toLowerCase().includes(inner.toLowerCase()) ? '' : inner, scheme);
  } else if (scheme.includes(';') || scheme.length > 46) {
    sub = scheme;
  } else if (scheme.length > 32 && scheme.includes(', ')) {
    const comma = scheme.indexOf(', ');
    side = scheme.slice(0, comma);
    sub = cap(scheme.slice(comma + 2));
  } else {
    side = scheme;
  }
  return title ? { title, side, sub } : { title: side, side: '', sub };
}

/** The line under the title: no "Team of 2:", which the toggle already says, and no Part A: / Part B:. */
const headlineText = (h) => cap(h.replace(/^Team of 2:\s*/, '').replace(/ \| /g, ' + ').replace(/Part [A-Z]:\s*/g, ''));

/** How the workout is scored, or '' when it isn't. */
function scoreText(s) {
  return /^none$/i.test(s) ? '' : cap(s.replace(/^none,\s*/i, ''));
}

function part(b, mode, units) {
  const t = (x) => textToUnits(x, units);
  const { title, side, sub } = blockHead({ label: b.label && t(b.label), scheme: b.scheme && t(b.scheme) });
  const head = title ? `
      <div class="sheet-part-head">
        <h3>${esc(title)}</h3>
        ${side ? `<p class="sheet-part-side">${esc(side)}</p>` : ''}
      </div>` : '';
  return `
    <div class="sheet-part">${head}
      ${sub ? `<p class="sheet-part-sub">${esc(sub)}</p>` : ''}
      ${mode === 'team' && b.teamNote ? `<p class="sheet-part-sub">${esc(t(b.teamNote))}</p>` : ''}
      <ul class="sheet-rows">${b.items.map((i) => sheetRow(wodLine(textToUnits(i, units)))).join('')}
      </ul>
    </div>
    ${b.rest ? `<p class="sheet-rest">${esc(t(b.rest))}</p>` : ''}`;
}

/** The workout card, in the design of our social posts: title, parts in panels, score and copy. */
export function wodCard(w, mode, ymd, { today = null, units = 'kg' } = {}) {
  const v = w[mode];
  const t = (x) => txt(x, units);
  const isToday = ymd === today;
  const score = scoreText(v.scoring);
  const effort = INTENSITY[w.intensity] || w.intensity;
  // Once each: a recovery day's format is also "Recovery". The weekly theme "Team of 2" says nothing about
  // the version on screen, which the toggle shows.
  const meta = [...new Set([w.format, w.theme !== MODE_TEXT.team && w.theme].filter((m) => m && m !== effort))];
  return `
  <section class="card wod-sheet" aria-live="polite">
    <div class="sheet-top">
      <p class="sheet-day"><span class="sheet-mark" aria-hidden="true"><img src="/img/logo.png" alt="" width="34" height="34"></span>${isToday ? 'Today · ' : ''}${dayName(ymd)} ${esc(fmtDate(parseYmd(ymd)))}</p>
      <span class="sheet-pill">${esc(w.durationMin)} min</span>
    </div>
    <h2>${esc(w.title)}</h2>
    <p class="sheet-headline">${esc(headlineText(textToUnits(v.headline, units)))}${v.scheme ? ` <span>· ${t(v.scheme)}</span>` : ''}</p>
    <p class="sheet-meta"><span class="dot ${INTENSITY_CLASS[w.intensity] || ''}"></span>${esc(effort)}${meta.map((m) => ` · ${esc(m)}`).join('')}</p>
    <div class="sheet-controls no-print">
      <div class="seg" role="radiogroup" aria-label="Workout version">
        ${['solo', 'team'].map((m) => `<button type="button" role="radio" aria-checked="${m === mode}" class="${m === mode ? 'on' : ''}" data-wod-mode="${m}">${MODE_TEXT[m]}</button>`).join('')}
      </div>
      <div class="seg" role="radiogroup" aria-label="Weight units">
        ${UNITS.map((u) => `<button type="button" role="radio" aria-checked="${u === units}" class="${u === units ? 'on' : ''}" data-wod-units="${u}">${u}</button>`).join('')}
      </div>
    </div>
    ${v.howTo ? `<p class="sheet-howto">${t(v.howTo)}</p>` : ''}
    ${v.blocks.map((b) => part(b, mode, units)).join('')}
    <div class="sheet-foot">
      <div>
        ${score ? `<p class="sheet-score"><strong>Score</strong> ${esc(textToUnits(score, units))}</p>` : ''}
        <p class="sheet-extra">Plus a 10 min warm-up and 5 min cool-down.</p>
      </div>
      <button type="button" class="btn primary sheet-copy no-print" data-wod-copy>Copy workout</button>
    </div>
  </section>`;
}

/** The athlete's plan session for the same day, if they have a plan. */
export function planNote(day) {
  if (!day) return '';
  const what = day.effort === 'rest' ? 'a rest day' : `<strong>${esc(day.label)}</strong>`;
  return `
  <section class="card info plan-today">
    <h2>Your plan today</h2>
    <p>Your plan has ${what} on this day.</p>
    <p class="small">Your plan comes first. Use the WOD on days the plan says strength/station work, or as a swap.</p>
  </section>`;
}

export function infoPanel(meta, units = 'kg') {
  const list = (obj) => Object.entries(obj || {}).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${txt(v, units)}</dd></div>`).join('');
  return `
  <details class="card glossary wod-info">
    <summary><h2>How to read the WOD</h2></summary>
    ${meta.note ? `<p class="muted small">${esc(meta.note)}</p>` : ''}
    <h3>Notation</h3><dl>${list(meta.notation)}</dl>
    <h3>The weekly rotation</h3><dl>${list(meta.weeklyRotation)}</dl>
    ${meta.cycle ? `<p class="small">${esc(meta.cycle)}</p>` : ''}
    <h3>No equipment? Swap it</h3><dl>${list(meta.substitutions)}</dl>
  </details>`;
}

/** Small "Today's WOD" card on the plan page. */
export function todayTeaser(w, mode, units = 'kg') {
  return `
  <section class="card wod-teaser no-print">
    <p class="eyebrow">Today's WOD</p>
    <h2>${esc(w.title)}</h2>
    <div class="tags">${chip(MODE_TEXT[mode], 'mode')}${chip(`${w.durationMin} min`)}${chip(w.format)}${chip(INTENSITY[w.intensity] || w.intensity, INTENSITY_CLASS[w.intensity] || '')}</div>
    <p class="small">${txt(w[mode].headline, units)}</p>
    <a class="btn primary" href="/">Open today's WOD</a>
  </section>`;
}

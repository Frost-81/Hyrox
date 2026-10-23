// HTML for the Workout of the Day view. All content comes from wods.json and goes through esc();
// weights in it are written in kg and rewritten in lb when the athlete picks pounds.
import { esc } from './render.js';
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

function block(b, mode, units) {
  const t = (x) => txt(x, units);
  const head = b.label
    ? `<p class="wod-block-label"><strong>${t(b.label)}</strong>${b.scheme ? ` <em>${t(b.scheme)}</em>` : ''}</p>`
    : b.scheme ? `<p class="wod-block-label"><em>${t(b.scheme)}</em></p>` : '';
  return `
    <div class="wod-block">
      ${head}
      ${mode === 'team' && b.teamNote ? `<p class="team-note"><em>${t(b.teamNote)}</em></p>` : ''}
      <ul class="lines">${b.items.map((i) => `<li>${t(i)}</li>`).join('')}</ul>
      ${b.rest ? `<p class="wod-rest">${t(b.rest)}</p>` : ''}
    </div>`;
}

/** The workout card: toggle, chips, headline, how-to, blocks, score and copy. */
export function wodCard(w, mode, ymd, { today = null, units = 'kg' } = {}) {
  const v = w[mode];
  const t = (x) => txt(x, units);
  const isToday = ymd === today;
  return `
  <section class="card wod-card" aria-live="polite">
    <div class="wod-top">
      <div>
        <p class="wod-day">${isToday ? 'Today · ' : ''}${dayName(ymd)} ${esc(fmtDate(parseYmd(ymd)))} · Day ${w.day}</p>
        <h2>${esc(w.title)}</h2>
      </div>
      <div class="seg" role="radiogroup" aria-label="Workout version">
        ${['solo', 'team'].map((m) => `<button type="button" role="radio" aria-checked="${m === mode}" class="${m === mode ? 'on' : ''}" data-wod-mode="${m}">${MODE_TEXT[m]}</button>`).join('')}
      </div>
      <div class="seg" role="radiogroup" aria-label="Weight units">
        ${UNITS.map((u) => `<button type="button" role="radio" aria-checked="${u === units}" class="${u === units ? 'on' : ''}" data-wod-units="${u}">${u}</button>`).join('')}
      </div>
    </div>
    <div class="tags">
      ${chip(MODE_TEXT[mode], 'mode')}
      ${chip(`${w.durationMin} min`)}
      ${chip(w.format)}
      ${chip(w.theme)}
      ${chip(INTENSITY[w.intensity] || w.intensity, INTENSITY_CLASS[w.intensity] || '')}
      ${w.benchmark ? chip('Benchmark', 'bench') : ''}
    </div>
    <p class="wod-headline"><strong>${t(v.headline)}</strong></p>
    ${v.howTo ? `<p class="howto${mode === 'team' ? ' team' : ''}">${t(v.howTo)}</p>` : ''}
    ${v.scheme ? `<p class="wod-scheme"><em>${t(v.scheme)}</em></p>` : ''}
    ${v.blocks.map((b) => block(b, mode, units)).join('')}
    <p class="wod-score"><strong>Score:</strong> ${t(v.scoring)}</p>
    <p class="muted small">Plus a 10 min warm-up and 5 min cool-down.</p>
    <div class="row-btns">
      <button type="button" class="btn" data-wod-copy>Copy</button>
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
    <a class="btn primary" href="#wod">Open today's WOD</a>
  </section>`;
}

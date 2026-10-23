// HTML for the Workout of the Day view. All content comes from wods.json and goes through esc().
import { esc } from './render.js';
import { fmtDate, parseYmd } from './plan.js';

const INTENSITY = { hard: 'Hard', moderate: 'Moderate', easy: 'Easy', recovery: 'Recovery' };
// Same colours as the plan: hard red, moderate orange/yellow, easy green, recovery grey (rest).
const INTENSITY_CLASS = { hard: 'effort-hard', moderate: 'effort-moderate', easy: 'effort-easy', recovery: 'effort-rest' };
const MODE_TEXT = { solo: 'Solo', team: 'Team of 2' };
// Monday first, matching plan.js.
const FULL_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The real weekday of the date shown (the workout's own weekday can differ outside the first 365-day cycle). */
const dayName = (ymd) => FULL_DAY[(new Date(parseYmd(ymd)).getUTCDay() + 6) % 7];

export function weekStrip(days, selected, today) {
  return `
  <nav class="week-strip" aria-label="Pick a day">
    <button type="button" class="btn small ghost strip-arrow" data-wod-week="-1" aria-label="Previous week">‹</button>
    <ol>
      ${days.map((d) => `
      <li><button type="button" class="strip-day${d.ymd === selected ? ' selected' : ''}${d.ymd === today ? ' today' : ''}"
        data-wod-day="${d.ymd}" aria-pressed="${d.ymd === selected}"${d.ymd === today ? ' aria-current="date"' : ''}>
        <span class="strip-wd">${d.weekday}</span><span class="strip-date">${d.date}</span>
      </button></li>`).join('')}
    </ol>
    <button type="button" class="btn small ghost strip-arrow" data-wod-week="1" aria-label="Next week">›</button>
  </nav>`;
}

function chip(text, cls = '') {
  return `<span class="tag${cls ? ` ${cls}` : ''}">${esc(text)}</span>`;
}

function block(b, mode) {
  const head = b.label
    ? `<p class="wod-block-label"><strong>${esc(b.label)}</strong>${b.scheme ? ` <em>${esc(b.scheme)}</em>` : ''}</p>`
    : b.scheme ? `<p class="wod-block-label"><em>${esc(b.scheme)}</em></p>` : '';
  return `
    <div class="wod-block">
      ${head}
      ${mode === 'team' && b.teamNote ? `<p class="team-note"><em>${esc(b.teamNote)}</em></p>` : ''}
      <ul class="lines">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      ${b.rest ? `<p class="wod-rest">${esc(b.rest)}</p>` : ''}
    </div>`;
}

/** The workout card: toggle, chips, headline, how-to, blocks, score and actions. */
export function wodCard(w, mode, ymd, { result = null, today = null } = {}) {
  const v = w[mode];
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
    </div>
    <div class="tags">
      ${chip(MODE_TEXT[mode], 'mode')}
      ${chip(`${w.durationMin} min`)}
      ${chip(w.format)}
      ${chip(w.theme)}
      ${chip(INTENSITY[w.intensity] || w.intensity, INTENSITY_CLASS[w.intensity] || '')}
      ${w.benchmark ? chip('Benchmark', 'bench') : ''}
    </div>
    <p class="wod-headline"><strong>${esc(v.headline)}</strong></p>
    ${v.howTo ? `<p class="howto${mode === 'team' ? ' team' : ''}">${esc(v.howTo)}</p>` : ''}
    ${v.scheme ? `<p class="wod-scheme"><em>${esc(v.scheme)}</em></p>` : ''}
    ${v.blocks.map((b) => block(b, mode)).join('')}
    <p class="wod-score"><strong>Score:</strong> ${esc(v.scoring)}</p>
    <p class="muted small">Plus a 10 min warm-up and 5 min cool-down.</p>
    ${result ? `<p class="logged small">✓ Logged ${esc(MODE_TEXT[result.mode])}: ${esc(result.score)}${result.partner ? ` with ${esc(result.partner)}` : ''}${result.weight ? ` · ${esc(result.weight)}` : ''}</p>` : ''}
    <div class="row-btns">
      <button type="button" class="btn primary" data-wod-log>${result ? 'Edit result' : 'Log result'}</button>
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

export function infoPanel(meta) {
  const list = (obj) => Object.entries(obj || {}).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
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

export function benchmarkHistory(groups) {
  const body = groups.length
    ? groups.map((g) => `
      <div class="bench-group">
        <h3>${esc(g.title)}</h3>
        <ul class="bench-list">${g.items.map((r) => `<li><span>${esc(r.date)}</span><strong>${esc(r.score)}</strong>${r.partner ? ` <span class="muted">with ${esc(r.partner)}</span>` : ''}</li>`).join('')}</ul>
      </div>`).join('')
    : '<p class="muted">Log a Benchmark workout (every 4th Friday) to compare your Front Half and Back Half times over the year.</p>';
  return `
  <section class="card">
    <h2>Benchmark history</h2>
    ${body}
  </section>`;
}

/** Small "Today's WOD" card on the plan page. */
export function todayTeaser(w, mode) {
  return `
  <section class="card wod-teaser no-print">
    <p class="eyebrow">Today's WOD</p>
    <h2>${esc(w.title)}</h2>
    <div class="tags">${chip(MODE_TEXT[mode], 'mode')}${chip(`${w.durationMin} min`)}${chip(w.format)}${chip(INTENSITY[w.intensity] || w.intensity, INTENSITY_CLASS[w.intensity] || '')}</div>
    <p class="small">${esc(w[mode].headline)}</p>
    <a class="btn primary" href="#wod">Open today's WOD</a>
  </section>`;
}

export function lockedWod() {
  return `
  <section class="card unlock">
    <h2>🔒 Workout of the Day</h2>
    <p>A new hybrid workout every day, solo or with a partner. Sign in (free) to see it and log your scores.</p>
    <button type="button" class="btn primary big" data-unlock>Sign in to see today's WOD</button>
  </section>`;
}

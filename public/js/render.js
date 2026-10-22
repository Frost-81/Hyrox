// HTML builders for the plan output. Everything user-supplied goes through esc().
import { fmtTime, SWAP_CHART } from './plan.js';
import { fmtZone } from './hr.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EFFORT_TEXT = { hard: 'Hard', moderate: 'Moderate', easy: 'Easy', rest: 'Rest' };
const FEEL_TEXT = { easy: 'felt easy', ok: 'felt OK', hard: 'felt hard' };

/** A slim photo strip between sections. */
export function banner(src, alt) {
  return `<figure class="banner no-print"><img src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async"></figure>`;
}

export function summaryCard(plan) {
  const days = plan.daysToRace;
  return `
  <section class="card summary">
    <h2>Your plan</h2>
    <dl class="stats">
      <div><dt>Goal time</dt><dd>${fmtTime(plan.splits.goal)}</dd></div>
      <div><dt>Race day</dt><dd>${esc(plan.raceLabel)}</dd></div>
      <div><dt>Countdown</dt><dd>${days} day${days === 1 ? '' : 's'}</dd></div>
      <div><dt>Division</dt><dd>${esc(plan.division.name)}</dd></div>
      <div><dt>Threshold HR</dt><dd>${plan.hr.lthr} bpm${plan.hr.source === 'estimate' ? ' <span class="muted small">est.</span>' : ''}</dd></div>
      <div><dt>Average run pace</dt><dd>${fmtTime(plan.paces.race)}/km</dd></div>
    </dl>
  </section>`;
}

export function splitsCard(plan) {
  const s = plan.splits;
  const rows = s.perStation.map((st) => `<tr><td>${esc(st.name)} <span class="muted">${esc(st.dist)}</span></td><td>${fmtTime(st.time)}</td></tr>`).join('');
  return `
  <section class="card">
    <h2>Your race splits</h2>
    <p class="muted">What a ${fmtTime(s.goal)} race looks like, split into its parts.</p>
    <table class="splits">
      <tbody>
        <tr class="group"><th>Running (8 x 1 km)</th><th>${fmtTime(s.run)}</th></tr>
        <tr><td>Average per km</td><td>${fmtTime(s.runPerKm)}</td></tr>
        <tr class="group"><th>Stations${plan.division.doubles ? ' <span class="muted small">(team time, you share the work)</span>' : ''}</th><th>${fmtTime(s.stations)}</th></tr>
        ${rows}
        <tr class="group"><th>Roxzone</th><th>${fmtTime(s.roxzone)}</th></tr>
      </tbody>
    </table>
    <p class="muted small"><strong>Roxzone:</strong> the transition area between each run and station. Moving briskly here is free time.</p>
  </section>`;
}

export function pacesCard(plan) {
  const p = plan.paces;
  const hr = plan.hr;
  const zone = (name, value, hrZone, help) => `
    <li>
      <span class="zone">${name}</span>
      <span class="pace">${value}</span>
      <span class="hr">${hrZone ? `${fmtZone(hrZone)} bpm` : '—'}</span>
      <span class="help">${help}</span>
    </li>`;
  const hrNote = {
    test: `Heart-rate zones come from your 5k test (threshold ${hr.lthr} bpm).`,
    max: `Heart-rate zones come from your max heart rate (${hr.maxHR} bpm).`,
    estimate: `Heart-rate zones are <strong>estimated</strong> from your age (max ${hr.maxHR} bpm). Add your max heart rate or a 5k test heart rate for accurate zones.`,
  }[hr.source];
  return `
  <section class="card">
    <h2>Your training paces</h2>
    ${p.estimated ? '<p class="note">No 5k time given, so your 5k pace is estimated from your goal. Add a 5k time for more accurate paces.</p>' : ''}
    ${p.adjusted ? '<p class="note ok">Your paces include changes you applied from your heart-rate logs.</p>' : ''}
    <ul class="zones">
      <li class="zones-head"><span>Zone</span><span>Pace</span><span>Heart rate</span></li>
      ${zone('Easy', `${fmtTime(p.easy[0])}–${fmtTime(p.easy[1])}/km`, hr.easy, 'Conversational. You can talk in full sentences.')}
      ${zone('Steady', `${fmtTime(p.steady)}/km`, hr.steady, 'Comfortably hard, short phrases only.')}
      ${zone('Threshold', `${fmtTime(p.thr)}/km`, hr.thr, 'The fastest pace you could hold for about an hour.')}
      ${zone('Race pace', `${fmtTime(p.race)}/km`, null, 'Your average 1 km pace on race day.')}
      ${zone('5k pace', `${fmtTime(p.fiveK)}/km`, hr.fiveK, 'Hard. Used for short fast repeats.')}
    </ul>
    <p class="muted small">${hrNote}</p>
    <p class="muted small">Row and SkiErg splits in the plan are a rough guide per 500 m; go by feel if they don't suit you.</p>
  </section>`;
}

/** The user's swap chart (meters only), shown when a machine is missing. */
export function swapCard(plan) {
  if (!plan.missingMachines.length) return '';
  const sex = plan.division.sex;
  const pick = (m, f) => (sex === 'm' ? m : sex === 'f' ? f : `${m}/${f}`);
  const rows = SWAP_CHART.map(([run, rowM, rowF, bikeM, bikeF]) =>
    `<tr><td>${run} m</td><td>${pick(rowM, rowF)} m</td><td>${pick(bikeM, bikeF)} m</td></tr>`).join('');
  const missing = plan.missingMachines.map((k) => (k === 'row' ? 'rower' : 'SkiErg')).join(' or ');
  return `
  <section class="card">
    <h2>Machine swaps</h2>
    <p>You don't have a ${missing}, so those sessions are swapped using this chart. Each row is the same amount of work${sex === 'x' ? ' (men/women)' : ''}. No SkiErg? Use the rower for the same distance.</p>
    <table class="swap">
      <thead><tr><th>Run</th><th>Row</th><th>Bike</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

/** Heart-rate suggestions with Apply / Dismiss buttons (signed in only). */
export function suggestionCards(suggestions) {
  return suggestions.map((s) => `
  <section class="card suggestion no-print" data-suggestion="${esc(s.id)}">
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.text)}</p>
    <div class="row-btns">
      <button type="button" class="btn primary" data-apply="${esc(s.id)}">Apply</button>
      <button type="button" class="btn" data-dismiss="${esc(s.id)}">Not now</button>
    </div>
  </section>`).join('');
}

export function noticeCards(plan) {
  let html = '';
  if (plan.preBlock) {
    html += `
    <section class="card info">
      <h2>Before your 12 weeks</h2>
      <p>Your 12-week plan starts on <strong>${esc(plan.preBlock.start)}</strong>, in ${plan.preBlock.weeksUntil} week${plan.preBlock.weeksUntil === 1 ? '' : 's'}. Until then, build your base:</p>
      <ul>${plan.preBlock.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>`;
  }
  if (plan.shortened) {
    html += `
    <section class="card warn">
      <h2>Your race is less than 12 weeks away</h2>
      <p>You have ${plan.shortened.weeksLeft} week${plan.shortened.weeksLeft === 1 ? '' : 's'} left, so the plan starts at week ${plan.shortened.firstWeek}. The early build weeks are skipped. The taper is kept in full.</p>
      <p class="small">If you are new to this kind of training, go easier on the first two weeks shown.</p>
    </section>`;
  }
  if (plan.recoveryTips) {
    html += `
    <section class="card info">
      <h2>Recovery tips (45+)</h2>
      <ul>${plan.recoveryTips.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>`;
  }
  return html;
}

export function glossaryCard() {
  const item = (t, d) => `<div><dt>${t}</dt><dd>${d}</dd></div>`;
  return `
  <details class="card glossary">
    <summary><h2>Words used in the plan</h2></summary>
    <dl>
      ${item('AMRAP', 'As many reps as possible, with good form.')}
      ${item('Romanian deadlift', 'A deadlift where you keep the legs nearly straight and hinge at the hips.')}
      ${item('Mock HYROX block', 'A run + station combo done back-to-back, to practise running on tired legs.')}
      ${item('Full simulation', 'The whole race in order: 8 x 1 km runs, each followed by a station.')}
      ${item('Overload', 'Training a bit heavier than race weight so race day feels lighter.')}
      ${item('Taper', 'Cutting training down before the race so you start fresh.')}
      ${item('WOD', 'Workout of the day: a short CrossFit-style workout done after the skill work.')}
      ${item('EMOM', 'Every minute on the minute: start the set at the top of each minute and rest for what is left of it.')}
      ${item('For time', 'Finish the work as fast as you can. The time cap is when you stop, even if you are not done.')}
      ${item('Chipper', 'A long list of exercises done once each, "chipping" through them in order.')}
      ${item('Threshold heart rate', 'Roughly the highest heart rate you can hold for about an hour. Your zones are set from it.')}
    </dl>
  </details>`;
}

/**
 * Week cards. When locked (signed out), only the first week is shown in full,
 * without checkboxes; the other weeks show just their titles behind a sign-in prompt.
 */
export function weekCards(plan, done, { locked = false, logs = {} } = {}) {
  return plan.weeks.map((w, i) => {
    if (locked && i > 0) return (i === 1 ? unlockCta(plan.weeks.length - 1) : '') + lockedWeek(w);
    const open = locked || w.current || (plan.currentWeek < 1 && i === 0);
    const doneCount = w.days.filter((d) => d.key && done[d.key]).length;
    const total = w.days.filter((d) => d.key).length;
    return `
    <details class="week${w.current ? ' current' : ''}" id="week-${w.n}" ${open ? 'open' : ''}>
      <summary>
        <span class="week-label">${esc(w.label)}${w.current ? ' <span class="badge">This week</span>' : ''}</span>
        <span class="week-sub">${esc(w.phaseName)} · ${esc(w.title)}</span>
        ${locked ? '<span class="week-count">Preview</span>' : `<span class="week-count">${doneCount}/${total} done</span>`}
      </summary>
      ${w.clash ? '<p class="note small">Your chosen days put two hard sessions back-to-back this week. Take the second one a little easier if you feel flat.</p>' : ''}
      <ol class="days">
        ${w.days.map((d) => dayItem(d, done, plan.today, locked, logs[d.key])).join('')}
      </ol>
    </details>`;
  }).join('');
}

function unlockCta(hiddenWeeks) {
  return `
  <section class="card unlock no-print">
    <h2>🔒 Unlock your full plan</h2>
    <p>That was your first week. Sign in (free) to see all ${hiddenWeeks} remaining weeks, save your plan, tick off sessions and add them to your calendar.</p>
    <button type="button" class="btn primary big" data-unlock>Sign in to unlock your full plan</button>
  </section>`;
}

function lockedWeek(w) {
  return `
  <div class="week locked" id="week-${w.n}" aria-label="${esc(w.label)}, locked">
    <span class="week-label">🔒 ${esc(w.label)}${w.current ? ' <span class="badge">This week</span>' : ''}</span>
    <span class="week-sub">${esc(w.phaseName)} · ${esc(w.title)}</span>
  </div>`;
}

function dayItem(d, done, today, locked, log) {
  const isToday = d.ymd === today;
  const head = `<span class="day-name">${d.weekday} <span class="muted">${d.ymd.slice(8).replace(/^0/, '')}</span></span>
    <span class="day-title">${esc(d.label)}</span>
    <span class="effort-tag">${EFFORT_TEXT[d.effort]}</span>`;
  if (d.effort === 'rest') {
    return `<li class="day effort-rest${isToday ? ' today' : ''}" data-ymd="${d.ymd}"><div class="day-head">${head}</div></li>`;
  }
  const id = `chk-${d.key}`;
  const check = locked ? '' : `
      <span class="day-actions">
        <button type="button" class="btn small log-btn" data-log="${esc(d.key)}">${log ? 'Edit log' : 'Log'}</button>
        <label class="check" for="${id}"><input type="checkbox" id="${id}" data-key="${esc(d.key)}" ${done[d.key] ? 'checked' : ''}><span>Done</span></label>
      </span>`;
  const logLine = !locked && log
    ? `<p class="logged small">❤ Logged: ${[log.fiveK && `5k ${esc(log.fiveK)}`, log.hr && `${esc(log.hr)} bpm`, FEEL_TEXT[log.feel]].filter(Boolean).join(' · ')}</p>`
    : '';
  return `
  <li class="day effort-${d.effort}${isToday ? ' today' : ''}" data-ymd="${d.ymd}">
    <div class="day-head">
      ${head}
      ${check}
    </div>
    ${d.note ? `<p class="note small">${esc(d.note)}</p>` : ''}
    <ul class="lines">${d.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${d.wod ? wodBlock(d.wod) : ''}
    ${logLine}
  </li>`;
}

function wodBlock(wod) {
  return `
    <div class="wod">
      <p class="wod-title">Then: CrossFit WOD · ${esc(wod.title)}</p>
      <ul class="lines">${wod.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${wod.note ? `<p class="small muted">${esc(wod.note)}</p>` : ''}
    </div>`;
}

// HTML builders for the plan output. Everything user-supplied goes through esc().
import { fmtTime, fmtDate, SWAP_CHART } from './plan.js';
import { fmtZone } from './hr.js';
import { PRODUCTS } from './billing.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EFFORT_TEXT = { hard: 'Hard', moderate: 'Moderate', easy: 'Easy', rest: 'Rest' };
const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

/** A collapsible card, like "How to read the WOD". */
function fold(title, body) {
  return `
  <details class="card glossary">
    <summary><h2>${title}</h2></summary>
    <div class="fold-body">${body}</div>
  </details>`;
}

/**
 * Seven day buttons, shared by the plan and the WOD.
 * days: [{ ymd, weekday, date, effort? }]; attr: the data attribute set on each button.
 */
export function dayStrip(days, { selected, today, attr }) {
  return `
  <nav class="week-strip" aria-label="Pick a day">
    <ol>
      ${days.map((d) => `
      <li><button type="button" class="strip-day${d.ymd === selected ? ' selected' : ''}${d.ymd === today ? ' today' : ''}"
        data-${attr}="${d.ymd}" aria-pressed="${d.ymd === selected}"${d.ymd === today ? ' aria-current="date"' : ''}>
        <span class="strip-wd">${d.weekday}</span><span class="strip-date">${d.date}</span>
        ${d.effort ? `<span class="strip-bar effort-${d.effort}" aria-hidden="true"></span>` : ''}
      </button></li>`).join('')}
    </ol>
  </nav>`;
}

const PAYWALL_TEXT = {
  plan: { title: 'Unlock your full plan', text: 'Week 1 is your free preview. Unlock all 12 weeks, log your 5k tests to keep your paces and projected finish up to date, and keep your plan on any device.', button: 'Unlock', fine: 'One-time payment. No subscription.' },
  wod: { title: 'Workout of the Day', text: 'A new hybrid workout every day, solo or with a partner. Subscribe to see this week\'s workouts.', button: 'Subscribe', fine: 'Cancel any time.' },
};

/** The lock card for a product, with its buy button. */
export function paywall(product) {
  const t = PAYWALL_TEXT[product];
  return `
  <section class="card unlock no-print">
    <h2>🔒 ${esc(t.title)}</h2>
    <p>${esc(t.text)}</p>
    <button type="button" class="btn primary big" data-subscribe="${product}">${esc(t.button)} · ${esc(PRODUCTS[product].price)}</button>
    <p class="small muted">${esc(t.fine)}</p>
  </section>`;
}

function minutesText(sec) {
  const min = Math.round(Math.abs(sec) / 60);
  if (min === 0) return 'right on your goal';
  return `${min} min ${sec < 0 ? 'faster' : 'slower'} than your goal`;
}

export function summaryCard(plan) {
  const days = plan.daysToRace;
  const p = plan.projection;
  const note = {
    test: `From your latest 5k test (${esc(plan.inputs.fiveK)}): ${minutesText(p.vsGoal)}. A rough estimate that updates after each 5k test.`,
    entered: `From the 5k time you entered (${esc(plan.inputs.fiveK)}): ${minutesText(p.vsGoal)}. Log your 5k tests to update it.`,
    null: 'Log your 5k test to see your projected finish time.',
  }[p.from];
  return `
  <section class="card summary">
    <h2>Your plan</h2>
    <dl class="stats">
      <div><dt>Goal time</dt><dd>${fmtTime(plan.splits.goal)}</dd></div>
      <div><dt>Projected finish</dt><dd>${p.time ? fmtTime(p.time) : '—'}</dd></div>
      <div><dt>Race day</dt><dd>${esc(plan.raceLabel)}</dd></div>
      <div><dt>Countdown</dt><dd>${days} day${days === 1 ? '' : 's'}</dd></div>
      <div><dt>Division</dt><dd>${esc(plan.division.name)}</dd></div>
      <div><dt>Average run pace</dt><dd>${fmtTime(plan.paces.race)}/km</dd></div>
    </dl>
    <p class="muted small projection-note">${note}</p>
  </section>`;
}

export function splitsCard(plan) {
  const s = plan.splits;
  const rows = s.perStation.map((st) => `<tr><td>${esc(st.name)} <span class="muted">${esc(st.dist)}</span></td><td>${fmtTime(st.time)}</td></tr>`).join('');
  return fold('Your race splits', `
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
    <p class="muted small"><strong>Roxzone:</strong> the transition area between each run and station. Moving briskly here is free time.</p>`);
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
    estimate: `Heart-rate zones are <strong>estimated</strong> from your age (max ${hr.maxHR} bpm). Log your week 1 5k test with your average heart rate for accurate zones.`,
  }[hr.source];
  return fold('Your training paces', `
    ${p.estimated ? '<p class="note">No 5k time given, so your 5k pace is estimated from your goal. Log your 5k test for more accurate paces.</p>' : ''}
    <ul class="zones">
      <li class="zones-head"><span>Zone</span><span>Pace</span><span>Heart rate</span></li>
      ${zone('Easy', `${fmtTime(p.easy[0])}–${fmtTime(p.easy[1])}/km`, hr.easy, 'Conversational. You can talk in full sentences.')}
      ${zone('Steady', `${fmtTime(p.steady)}/km`, hr.steady, 'Comfortably hard, short phrases only.')}
      ${zone('Threshold', `${fmtTime(p.thr)}/km`, hr.thr, 'The fastest pace you could hold for about an hour.')}
      ${zone('Race pace', `${fmtTime(p.race)}/km`, null, 'Your average 1 km pace on race day.')}
      ${zone('5k pace', `${fmtTime(p.fiveK)}/km`, hr.fiveK, 'Hard. Used for short fast repeats.')}
    </ul>
    <p class="muted small">${hrNote}</p>
    <p class="muted small">Row and SkiErg splits in the plan are a rough guide per 500 m; go by feel if they don't suit you.</p>`);
}

/** The user's swap chart (meters only), shown when a machine is missing. */
export function swapCard(plan) {
  if (!plan.missingMachines.length) return '';
  const sex = plan.division.sex;
  const pick = (m, f) => (sex === 'm' ? m : sex === 'f' ? f : `${m}/${f}`);
  const rows = SWAP_CHART.map(([run, rowM, rowF, bikeM, bikeF]) =>
    `<tr><td>${run} m</td><td>${pick(rowM, rowF)} m</td><td>${pick(bikeM, bikeF)} m</td></tr>`).join('');
  const missing = plan.missingMachines.map((k) => (k === 'row' ? 'rower' : 'SkiErg')).join(' or ');
  return fold('Machine swaps', `
    <p>You don't have a ${missing}, so those sessions are swapped using this chart. Each row is the same amount of work${sex === 'x' ? ' (men/women)' : ''}. No SkiErg? Use the rower for the same distance.</p>
    <table class="swap">
      <thead><tr><th>Run</th><th>Row</th><th>Bike</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

export function noticeCards(plan) {
  let html = '';
  if (plan.preBlock) {
    // Folded, so the week view stays near the top of the page.
    html += `
    <details class="card info glossary">
      <summary><h2>Before your 12 weeks</h2></summary>
      <div class="fold-body">
        <p>Your 12-week plan starts on <strong>${esc(plan.preBlock.start)}</strong>, in ${plan.preBlock.weeksUntil} week${plan.preBlock.weeksUntil === 1 ? '' : 's'}. Until then, build your base:</p>
        <ul>${plan.preBlock.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </div>
    </details>`;
  }
  if (plan.shortened) {
    html += `
    <section class="card warn">
      <h2>Your race is less than 12 weeks away</h2>
      <p>You have ${plan.shortened.weeksLeft} week${plan.shortened.weeksLeft === 1 ? '' : 's'} left, so your plan starts at week ${plan.shortened.firstWeek} and the earlier weeks are left out. ${plan.shortened.firstWeek < 11 ? 'Your first week includes a 5k test to set your paces. ' : ''}The taper is kept in full.</p>
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
  return fold('Words used in the plan', `
    <dl>
      ${item('AMRAP', 'As many reps as possible, with good form.')}
      ${item('Romanian deadlift', 'A deadlift where you keep the legs nearly straight and hinge at the hips.')}
      ${item('Mock race block', 'A run + station combo done back-to-back, to practise running on tired legs.')}
      ${item('Full simulation', 'The whole race in order: 8 x 1 km runs, each followed by a station.')}
      ${item('Overload', 'Training a bit heavier than race weight so race day feels lighter.')}
      ${item('% of body weight', 'Your target for the working sets of a lift, set from your body weight, your division, the reps and the week. It is a starting guide: pick a weight that leaves about 2 good reps in the tank, and go lighter if your form breaks down. New to a lift? Start 10-20% lighter.')}
      ${item('Taper', 'Cutting training down before the race so you start fresh.')}
      ${item('WOD', 'Workout of the day: a short workout done after the skill work.')}
      ${item('EMOM', 'Every minute on the minute: start the set at the top of each minute and rest for what is left of it.')}
      ${item('For time', 'Finish the work as fast as you can. The time cap is when you stop, even if you are not done.')}
      ${item('Threshold heart rate', 'Roughly the highest heart rate you can hold for about an hour. Your zones are set from it.')}
    </dl>`);
}

/**
 * One week at a time, like the WOD page: a week header with arrows, a day strip, and the chosen day's card.
 * locked: weeks after the first one shown are behind the plan paywall.
 */
export function planWeek(plan, { weekIdx, ymd, locked, logs = {} }) {
  const w = plan.weeks[weekIdx];
  const today = plan.today;
  const day = w.days.find((d) => d.ymd === ymd) || w.days[0];
  const isLocked = locked && weekIdx > 0;
  const days = w.days.map((d) => ({ ymd: d.ymd, weekday: d.weekday, date: Number(d.ymd.slice(8)), effort: d.effort }));
  const todayInPlan = plan.weeks.some((x) => x.days.some((d) => d.ymd === today));
  const arrow = (dir, label, disabled) =>
    `<button type="button" class="btn small ghost strip-arrow" data-plan-week="${dir}" aria-label="${label}"${disabled ? ' disabled' : ''}>${dir < 0 ? '‹' : '›'}</button>`;
  return `
  <section class="card plan-week" id="plan-week">
    <div class="plan-week-head">
      ${arrow(-1, 'Previous week', weekIdx === 0)}
      <div class="plan-week-title">
        <p class="wod-day">Week ${w.n} of 12 · ${esc(w.label.split(' · ')[1])}${w.current ? ' <span class="badge">This week</span>' : ''}</p>
        <h2>${esc(w.title)}</h2>
        <p class="muted small">${esc(w.phaseName)}</p>
      </div>
      ${arrow(1, 'Next week', weekIdx === plan.weeks.length - 1)}
    </div>
    ${dayStrip(days, { selected: day.ymd, today, attr: 'plan-day' })}
    <p class="legend small">
      <span class="dot effort-hard"></span>Hard
      <span class="dot effort-moderate"></span>Moderate
      <span class="dot effort-easy"></span>Easy
      <span class="dot effort-rest"></span>Rest
      ${todayInPlan && day.ymd !== today ? '<button type="button" class="btn link" data-plan-today>Back to today</button>' : ''}
    </p>
    ${w.clash && !isLocked ? '<p class="note small">Your chosen days put two hard sessions back-to-back this week. Take the second one a little easier if you feel flat.</p>' : ''}
  </section>
  ${isLocked ? paywall('plan') : dayCard(day, w, today, logs[day.key], locked)}`;
}

function dayCard(d, w, today, log, locked) {
  const when = `${d.ymd === today ? 'Today · ' : ''}${FULL_DAY[d.weekday]} ${esc(fmtDate(d.date))} · Week ${w.n}`;
  if (d.effort === 'rest') {
    return `
  <section class="card wod-card day-card" aria-live="polite">
    <p class="wod-day">${when}</p>
    <h2>Rest</h2>
    <div class="tags"><span class="tag effort-rest">Rest</span></div>
    <p>No training today. Sleep well, eat well, and go for an easy walk if you like.</p>
  </section>`;
  }
  const testLog = d.test ? `
    ${log?.fiveK ? `<p class="logged small">✓ Logged: 5k ${esc(log.fiveK)}${log.hr ? ` · ${esc(log.hr)} bpm` : ''}</p>` : ''}
    <div class="row-btns">
      ${locked
        ? '<button type="button" class="btn primary" data-subscribe="plan">Unlock to log your 5k</button>'
        : `<button type="button" class="btn primary" data-log="${esc(d.key)}">${log?.fiveK ? 'Edit 5k result' : 'Log 5k result'}</button>`}
    </div>` : '';
  return `
  <section class="card wod-card day-card" aria-live="polite">
    <p class="wod-day">${when}</p>
    <h2>${esc(d.label)}</h2>
    <div class="tags">
      <span class="tag effort-${d.effort}">${EFFORT_TEXT[d.effort]}</span>
      <span class="tag">${esc(w.phaseName)}</span>
      ${d.test ? '<span class="tag bench">5k test</span>' : ''}
    </div>
    ${d.note ? `<p class="note small">${esc(d.note)}</p>` : ''}
    <ul class="lines">${d.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${d.wod ? wodBlock(d.wod) : ''}
    ${testLog}
  </section>`;
}

function wodBlock(wod) {
  return `
    <div class="wod">
      <p class="wod-title">Then: WOD · ${esc(wod.title)}</p>
      <ul class="lines">${wod.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${wod.note ? `<p class="small muted">${esc(wod.note)}</p>` : ''}
    </div>`;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, validateInputs, fmtTime, parseHM, normalizeTime, maskTime, DIVISIONS, liftShare, projectFinish } from '../public/js/plan.js';
import { hrProfile, applyTest } from '../public/js/hr.js';
import { readFileSync } from 'node:fs';
import { wodIndex, workoutFor, weekDates, addDays, pickMode, clampToWeek } from '../public/js/wod.js';
import { canUse, hasSubscription } from '../public/js/billing.js';
import { planIdFor } from '../public/js/progress.js';

const TODAY = '2026-10-22';
const example = { raceDate: '2027-04-24', goal: '1:05', division: 'MO', age: '45-49', fiveK: '20:00', days: [0, 1, 2, 3, 4, 5] };

const dayOf = (plan, ymd) => plan.weeks.flatMap((w) => w.days).find((d) => d.ymd === ymd);

test('spec example: dates, race pace, wall ball target', () => {
  const p = buildPlan(example, TODAY);
  assert.equal(p.weeks[0].n, 1);
  assert.equal(p.weeks[0].days[0].ymd, '2027-02-01');
  assert.equal(p.weeks[0].days[0].weekday, 'Mon');
  assert.equal(p.weeks[2].label, 'Week 3 · Feb 15–21');
  assert.equal(fmtTime(p.paces.race), '4:05');
  assert.equal(fmtTime(p.splits.perStation.find((s) => s.key === 'wb').time), '4:50');
  assert.equal(dayOf(p, '2027-04-24').label, 'RACE DAY!');
  assert.ok(p.preBlock, 'race is >12 weeks away so the before-12-weeks card shows');
  assert.equal(p.shortened, null);
});

test('splits add up to the goal time', () => {
  const p = buildPlan(example, TODAY);
  const s = p.splits;
  assert.ok(Math.abs(s.run + s.stations + s.roxzone - parseHM('1:05')) < 1);
  const stationSum = s.perStation.reduce((a, x) => a + x.time, 0);
  // The spec's station shares add up to 100.1%, so allow a couple of seconds.
  assert.ok(Math.abs(stationSum - s.stations) < 3);
});

test('paces from the 5k time', () => {
  const p = buildPlan(example, TODAY);
  assert.equal(p.paces.fiveK, 240);
  assert.deepEqual(p.paces.easy, [330, 360]);
  assert.equal(p.paces.steady, 290);
  assert.equal(p.paces.thr, 260);
  const thu = p.weeks[1].days[3]; // week 2 Thursday hybrid: 800 m runs @ threshold
  assert.match(thu.lines[1], /800 m run @ 4:20\/km/);
});

test('no 5k given: 5k pace = race pace - 15 s', () => {
  const p = buildPlan({ ...example, fiveK: '' }, TODAY);
  assert.equal(p.paces.fiveK, p.paces.race - 15);
  assert.ok(p.paces.estimated);
});

test('45+: at most two hard days a week and calf work on strength days', () => {
  const p = buildPlan(example, TODAY);
  for (const w of p.weeks) {
    const hard = w.days.filter((d) => d.effort === 'hard').length;
    assert.ok(hard <= 2, `week ${w.n} has ${hard} hard days`);
  }
  for (const w of p.weeks.filter((x) => x.n < 11)) {
    const tue = w.days[1];
    assert.equal(tue.label, 'Strength');
    assert.ok(tue.lines.some((l) => /Calf raises/.test(l)), `week ${w.n} strength has calf work`);
  }
  assert.ok(p.recoveryTips);
});

test('under 45: no age changes', () => {
  const p = buildPlan({ ...example, age: '30-34' }, TODAY);
  assert.equal(p.recoveryTips, null);
  const w5 = p.weeks[4];
  assert.equal(w5.days.filter((d) => d.effort === 'hard').length, 3);
  assert.ok(!w5.days[1].lines.some((l) => /Calf raises/.test(l)));
});

test('weekly layout: Mon endurance, Tue strength, Wed recovery, Thu hybrid, Fri skill + WOD, Sat long, Sun rest', () => {
  const p = buildPlan({ ...example, age: '30-34' }, TODAY);
  for (const w of p.weeks.filter((x) => x.n <= 10)) {
    const keys = w.days.map((d) => d.key && d.key.split('-')[1]);
    assert.deepEqual(keys, ['end', 'str', 'rec', 'hyb', 'skl', 'long', null], `week ${w.n}`);
    assert.equal(w.days[2].label, 'Active Recovery');
    assert.equal(w.days[2].effort, 'easy');
    assert.ok(w.days[4].wod, `week ${w.n} Friday has a WOD`);
  }
  assert.equal(p.weeks[0].days[0].label, '5k Test');
  assert.equal(p.weeks[1].days[0].label, 'Endurance');
});

test('5 custom days: Wednesday recovery dropped, station work stays on Friday, long day last', () => {
  const p = buildPlan({ ...example, age: '30-34', days: [0, 1, 3, 4, 6] }, TODAY);
  const w5 = p.weeks[4];
  const trained = w5.days.filter((d) => d.effort !== 'rest');
  assert.equal(trained.length, 5);
  assert.ok(!trained.some((d) => d.key === 'w5-rec'));
  const skl = trained.find((d) => d.key === 'w5-skl');
  assert.ok(skl.lines.some((l) => /Sled Push/.test(l)), 'station work is on the skill session');
  assert.equal(w5.days[6].key, 'w5-long', 'long session on Sunday');
  assert.equal(w5.days[2].effort, 'rest');
  assert.equal(w5.days[5].effort, 'rest');
  // No back-to-back hard days when a swap was possible.
  for (const w of p.weeks.filter((x) => x.n < 11)) {
    for (let i = 0; i < 6; i++) {
      if (w.days[i].effort === 'hard' && w.days[i + 1].effort === 'hard') assert.ok(w.clash, `week ${w.n} has an unflagged clash`);
    }
  }
});

test('race less than 12 weeks away: cut from the start, taper kept', () => {
  const p = buildPlan({ ...example, raceDate: '2026-12-19' }, TODAY);
  assert.ok(p.shortened);
  assert.equal(p.weeks[0].n, p.shortened.firstWeek);
  assert.equal(p.weeks.at(-1).n, 12);
  assert.ok(p.weeks.some((w) => w.n === 11));
  assert.ok(p.weeks.find((w) => w.n === p.currentWeek).current);
});

test('race on a Sunday: race week shifts with it', () => {
  const p = buildPlan({ ...example, raceDate: '2027-04-25' }, TODAY);
  assert.equal(dayOf(p, '2027-04-25').label, 'RACE DAY!');
  assert.equal(dayOf(p, '2027-04-20').label, 'Activation');
  assert.equal(dayOf(p, '2027-04-24').label, 'Light Mobility & Hydration');
});

test('race on a Tuesday: taper days reach back into week 11', () => {
  const p = buildPlan({ ...example, raceDate: '2027-04-20' }, TODAY);
  assert.equal(dayOf(p, '2027-04-20').label, 'RACE DAY!');
  assert.equal(dayOf(p, '2027-04-15').label, 'Activation');
  assert.equal(dayOf(p, '2027-04-17').effort, 'rest');
  assert.equal(dayOf(p, '2027-04-19').label, 'Light Mobility & Hydration');
});

test('every token is replaced', () => {
  for (const division of ['MO', 'WO', 'MP', 'WP']) {
    const p = buildPlan({ ...example, division }, TODAY);
    for (const w of p.weeks) for (const d of w.days) for (const l of d.lines) assert.doesNotMatch(l, /\{[^}]+\}/, l);
  }
});

test('validation', () => {
  assert.deepEqual(validateInputs(example, TODAY), {});
  const e = validateInputs({ raceDate: '2026-10-01', goal: '0:40', division: 'X', age: '1', fiveK: 'abc', days: [1, 2] }, TODAY);
  assert.deepEqual(Object.keys(e).sort(), ['age', 'days', 'division', 'fiveK', 'goal', 'raceDate']);
  assert.ok(validateInputs({ ...example, goal: '2:31' }, TODAY).goal);
  assert.ok(!validateInputs({ ...example, goal: '2:30' }, TODAY).goal);
});

const allDays = (plan) => plan.weeks.flatMap((w) => w.days.map((d) => ({ ...d, week: w.n })));

test('WODs follow every Skill and Skill/Strength session', () => {
  const p = buildPlan({ ...example, age: '30-34' }, TODAY);
  for (const d of allDays(p).filter((x) => x.week <= 11)) {
    const isSkill = /^Skill/.test(d.label);
    assert.equal(!!d.wod, isSkill, `week ${d.week} ${d.label}`);
    if (d.wod) {
      assert.ok(d.lines.length > 0, 'station / strength work is kept before the WOD');
      assert.ok(d.wod.lines.length > 0);
    }
  }
  const fridays = allDays(p).filter((d) => d.key && /-skl$/.test(d.key));
  assert.equal(fridays.length, 11);
  const recovery = allDays(p).filter((d) => d.key && /-rec$/.test(d.key));
  assert.equal(recovery.length, 11);
  for (const d of recovery) {
    assert.ok(!d.wod, `week ${d.week} active recovery has no WOD`);
    assert.equal(d.label, 'Active Recovery');
  }
});

test('WOD loads are filled in for every division', () => {
  for (const division of ['MO', 'WO', 'MP', 'WP']) {
    const p = buildPlan({ ...example, division }, TODAY);
    for (const d of allDays(p)) {
      for (const l of [d.wod?.title, ...(d.wod?.lines || [])].filter(Boolean)) assert.doesNotMatch(l, /\{[^}]+\}/, l);
    }
  }
  const wo = buildPlan({ ...example, division: 'WO' }, TODAY);
  assert.ok(allDays(wo).find((d) => d.key === 'w5-skl').wod.lines.includes('8 KB swings @ 16 kg'));
});

test('5-day plan: only one WOD on the merged Friday session', () => {
  const p = buildPlan({ ...example, age: '30-34', days: [0, 1, 3, 4, 5] }, TODAY);
  for (const w of p.weeks.filter((x) => x.n <= 11)) {
    const wods = w.days.filter((d) => d.wod);
    assert.equal(wods.length, 1, `week ${w.n}`);
  }
});

test('45+: WODs carry the note and stay within two hard days', () => {
  const p = buildPlan(example, TODAY);
  const wods = allDays(p).filter((d) => d.wod);
  assert.ok(wods.length > 0);
  for (const d of wods) {
    assert.match(d.wod.note, /45\+/);
    assert.notEqual(d.effort, 'hard');
  }
});

// ---------- form defaults, divisions ----------

test('normalizeTime fills in :00', () => {
  assert.equal(normalizeTime('25'), '25:00');
  assert.equal(normalizeTime(' 1 '), '1:00');
  assert.equal(normalizeTime('22.30'), '22:30');
  assert.equal(normalizeTime('24:45'), '24:45');
  assert.equal(normalizeTime(''), '');
  assert.deepEqual(validateInputs({ ...example, fiveK: '25', goal: '3' }, TODAY), { goal: 'Goal must be between 0:55 and 2:30.' });
  assert.deepEqual(validateInputs({ ...example, fiveK: '25' }, TODAY), {});
  assert.equal(buildPlan({ ...example, fiveK: '25' }, TODAY).paces.fiveK, 300);
});

test('Doubles divisions use Open weights', () => {
  assert.equal(DIVISIONS.MD.push, 152);
  assert.equal(DIVISIONS.WD.push, 102);
  assert.equal(DIVISIONS.XD.pull, 103);
  for (const division of ['MD', 'WD', 'XD']) {
    const p = buildPlan({ ...example, division }, TODAY);
    assert.ok(p.division.doubles);
    assert.equal(p.weeks.length, 12);
  }
});

// ---------- plan upgrades ----------

const linesOf = (plan, key) => allDays(plan).find((d) => d.key === key).lines.join(' / ');

test('upgrades: longer easy runs, SkiErg weeks, more sled pull', () => {
  const p = buildPlan({ ...example, age: '30-34' }, TODAY);
  const expectRun = { 'w2-end': 40, 'w4-end': 35, 'w6-end': 60, 'w8-end': 65, 'w10-end': 70, 'w1-long': 50, 'w2-long': 55, 'w3-long': 60 };
  for (const [key, min] of Object.entries(expectRun)) assert.match(linesOf(p, key), new RegExp(`Run: ${min} minutes`), key);
  for (const n of [2, 4, 6, 8, 10]) assert.match(linesOf(p, `w${n}-end`), /SkiErg: /, `week ${n}`);
  for (const n of [3, 5, 7, 9, 11]) assert.match(linesOf(p, `w${n}-end`), /Row: /, `week ${n}`); // week 1 Monday is the 5k test
  for (const n of [7, 8, 9]) assert.match(linesOf(p, `w${n}-skl`), /Sled Pull: 3 x 50 m/, `week ${n}`);
});

// ---------- machine swaps ----------

test('machine swaps follow the chart', () => {
  const all = { ...example, age: '30-34' };
  const p = buildPlan(all, TODAY);
  assert.match(linesOf(p, 'w5-long'), /\+ 1000 m row \+/);

  const menNoRow = buildPlan({ ...all, equipment: ['ski', 'bike'] }, TODAY);
  assert.match(linesOf(menNoRow, 'w5-long'), /800 m run or 2000 m bike \(no rower\)/);
  assert.match(linesOf(menNoRow, 'w3-end'), /Bike: 2 x 10 min hard \(no rower\)/);

  const womenNoRow = buildPlan({ ...all, division: 'WO', equipment: [] }, TODAY);
  assert.match(linesOf(womenNoRow, 'w5-long'), /1000 m run \(no rower\)/);
  assert.match(linesOf(womenNoRow, 'w3-end'), /Run: 2 x 10 min @ .*\/km \(no rower\)/);

  const noSki = buildPlan({ ...all, equipment: ['row'] }, TODAY);
  assert.match(linesOf(noSki, 'w2-end'), /Row: 20 min .*\(no SkiErg\)/);
  assert.match(linesOf(noSki, 'w6-long'), /1000 m row \(no SkiErg\)/);

  const mixed = buildPlan({ ...all, division: 'XD', equipment: [] }, TODAY);
  assert.match(linesOf(mixed, 'w5-long'), /800\/1000 m \(men\/women\) run/);

  const none = buildPlan({ ...all, equipment: [] }, TODAY);
  // Race day lists the race's own station targets, which include the SkiErg and row.
  for (const d of allDays(none).filter((x) => x.key !== 'w12-race')) {
    for (const l of [...d.lines, ...(d.wod?.lines || [])]) assert.doesNotMatch(l.replace(/\(no [^)]+\)/g, ''), /\b(row|SkiErg|bike)\b/i, `${d.key}: ${l}`);
  }
});

test('no machine tokens left for any division and equipment', () => {
  for (const division of Object.keys(DIVISIONS)) {
    for (const equipment of [['row', 'ski', 'bike'], ['row'], ['bike'], []]) {
      const p = buildPlan({ ...example, division, equipment }, TODAY);
      for (const d of allDays(p)) for (const l of [...d.lines, ...(d.wod?.lines || [])]) assert.doesNotMatch(l, /\{[^}]+\}/, l);
    }
  }
});

// ---------- heart rate ----------

test('heart-rate zones from a 5k test and from max HR', () => {
  const fromTest = hrProfile({ ...example, hr5k: '170' });
  assert.equal(fromTest.source, 'test');
  assert.equal(fromTest.lthr, 167);
  assert.deepEqual(fromTest.easy, [null, 149]);
  assert.deepEqual(fromTest.thr, [159, 167]);
  const fromMax = hrProfile({ ...example, maxHR: '190' });
  assert.equal(fromMax.source, 'max');
  assert.equal(fromMax.lthr, 169);
  const est = hrProfile({ ...example, age: '30-34' });
  assert.equal(est.source, 'estimate');
  assert.equal(est.maxHR, 186);

  const withHr = buildPlan({ ...example, hr5k: '170' }, TODAY);
  assert.match(linesOf(withHr, 'w1-end'), /5:30–6:00\/km, HR under 149/);
  const noHr = buildPlan(example, TODAY);
  assert.doesNotMatch(linesOf(noHr, 'w1-end'), /HR/);
  assert.ok(validateInputs({ ...example, maxHR: '300' }, TODAY).maxHR);
  assert.ok(validateInputs({ ...example, maxHR: '180', hr5k: '190' }, TODAY).hr5k);
});

test('5k tests in weeks 1, 4 and 8', () => {
  const p = buildPlan(example, TODAY);
  const tests = allDays(p).filter((d) => d.test);
  assert.deepEqual(tests.map((d) => d.key), ['w1-end', 'w4-long', 'w8-long']);
  const mon = tests[0];
  assert.equal(mon.label, '5k Test');
  assert.equal(mon.weekday, 'Mon');
  assert.ok(mon.hrTest);
  // A test is run at 5k effort, so its heart rate never counts as an easy run.
  assert.ok(tests.every((d) => d.zone === 'fiveK'));
  // 5-day plans and 45+ plans keep the week 1 test too.
  const five = buildPlan({ ...example, days: [0, 1, 3, 4, 5] }, TODAY);
  assert.ok(allDays(five).find((d) => d.key === 'w1-end').test);
});

test('a logged 5k test updates the plan, keeps its id and sets the projection', () => {
  const inp = { ...example, age: '30-34' };
  const p = buildPlan(inp, TODAY);
  assert.equal(p.projection.from, 'entered');
  const next = applyTest(inp, { fiveK: '19:00', hr5k: 176 });
  assert.equal(next.fiveK, '19:00');
  assert.equal(next.hr5k, '176');
  assert.deepEqual(validateInputs(next, TODAY), {});
  assert.equal(planIdFor(next), planIdFor(inp));
  const p2 = buildPlan(next, TODAY);
  assert.equal(p2.paces.fiveK, 228);
  assert.equal(p2.hr.source, 'test');
  assert.equal(p2.hr.lthr, 172);
  assert.ok(p2.paces.fiveK < p.paces.fiveK);
  assert.equal(p2.projection.from, 'test');
  assert.ok(p2.projection.time < p.projection.time, 'a faster 5k gives a faster projected finish');
  assert.equal(p2.projection.vsGoal, p2.projection.time - parseHM('1:05'));
  // Time only: heart rate stays as it was.
  assert.equal(applyTest(inp, { fiveK: '21:10' }).hr5k, undefined);
});

test('projected finish from a 5k time', () => {
  assert.equal(fmtTime(projectFinish(20 * 60)), '1:14:00');
  assert.equal(fmtTime(projectFinish(25 * 60)), '1:33:00');
  assert.ok(projectFinish(19 * 60) < projectFinish(20 * 60));
  const none = buildPlan({ ...example, fiveK: '' }, TODAY);
  assert.deepEqual(none.projection, { time: null, from: null, vsGoal: null });
});

// ---------- time input mask ----------

test('maskTime adds the colon as you type', () => {
  assert.equal(maskTime('1'), '1');
  assert.equal(maskTime('13'), '13');
  assert.equal(maskTime('130'), '1:30');
  assert.equal(maskTime('2500'), '25:00');
  assert.equal(maskTime('25001'), '25:00');
  assert.equal(maskTime('1:3'), '1:3');
  assert.equal(maskTime('1:30'), '1:30');
  assert.equal(maskTime('1:305'), '13:05');
  assert.equal(maskTime('22.30'), '22:30');
  assert.equal(maskTime(''), '');
  assert.equal(normalizeTime(maskTime('130')), '1:30');
  assert.equal(normalizeTime(maskTime('25')), '25:00');
});

// ---------- Workout of the Day ----------

const WODS = JSON.parse(readFileSync(new URL('../public/data/wods.json', import.meta.url), 'utf8'));

test('WOD picks by local date from 2026-11-02', () => {
  assert.equal(WODS.workouts.length, 365);
  const first = workoutFor(WODS, '2026-11-02');
  assert.equal(first.day, 1);
  assert.equal(first.title, 'Blackout Pull');
  assert.equal(first.weekday, 'Monday');
  assert.equal(first.solo.headline, 'EMOM 44');
  assert.equal(first.team.headline, 'Team of 2: EMOM 44');
  assert.equal(workoutFor(WODS, '2027-11-02').day, 1);
  assert.equal(workoutFor(WODS, '2026-11-03').day, 2);
  assert.equal(wodIndex('2026-11-01'), 364);
  assert.equal(workoutFor(WODS, '2026-10-22').day, 355);
  // Every index in range across a leap year boundary.
  for (let i = 0; i < 800; i++) {
    const idx = wodIndex(addDays('2026-01-01', i));
    assert.ok(idx >= 0 && idx < 365);
  }
});

test('WOD: weekly rotation, default modes and team version has more work', () => {
  const week = weekDates('2026-11-04');
  assert.deepEqual(week.map((d) => d.ymd), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  for (const w of WODS.workouts) {
    assert.ok(w.durationMin >= 40 && w.durationMin <= 48);
    assert.ok(w.solo && w.team && w.solo.text && w.team.text);
    if (w.weekday === 'Wednesday') assert.equal(w.defaultMode, 'team');
  }
  const wed = workoutFor(WODS, '2026-11-04');
  assert.equal(pickMode(wed, null), 'team');
  assert.equal(pickMode(wed, 'solo'), 'solo');
  assert.equal(pickMode(workoutFor(WODS, '2026-11-02'), null), 'solo');
  assert.equal(workoutFor(WODS, '2026-11-07').intensity, 'easy');
  assert.doesNotMatch(JSON.stringify(WODS), /hyrox/i);
});

test('WOD shows only the current week', () => {
  assert.equal(clampToWeek('2026-11-06', '2026-11-04'), '2026-11-06');
  assert.equal(clampToWeek('2026-11-09', '2026-11-04'), '2026-11-04', 'next week is pulled back to today');
  assert.equal(clampToWeek('2026-11-01', '2026-11-04'), '2026-11-04', 'last week is pulled back to today');
});

test('feature gates: one-time plan, WOD subscription', () => {
  const user = { uid: 'u' };
  assert.equal(canUse('fullPlan', { user: null, subs: new Set(['plan']) }), false);
  assert.equal(canUse('fullPlan', { user }), false);
  assert.equal(canUse('fullPlan', { user, subs: new Set(['plan']) }), true);
  assert.equal(canUse('wod', { user, subs: new Set(['plan']) }), false);
  assert.equal(canUse('wod', { user, subs: new Set(['wod']) }), true);
  assert.equal(canUse('fullPlan', { user, subs: new Set(['wod']) }), false);
  assert.equal(canUse('unknown-feature', { user, subs: new Set(['plan', 'wod']) }), false);
  assert.equal(hasSubscription(new Set(['plan'])), false, 'the plan is a one-time payment');
  assert.equal(hasSubscription(new Set(['plan', 'wod'])), true);
});

test('no trademark in user-facing plan text', () => {
  const p = buildPlan(example, TODAY);
  const text = allDays(p).flatMap((d) => [d.label, ...d.lines, ...(d.wod?.lines || [])]).join(' ') + p.weeks.map((w) => w.title).join(' ');
  assert.doesNotMatch(text, /hyrox/i);
});

test('race under 12 weeks away: earlier weeks dropped, first week shown includes a 5k test', () => {
  const eight = buildPlan({ ...example, raceDate: '2026-12-12' }, TODAY);
  assert.deepEqual(eight.weeks.map((w) => w.n), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(eight.shortened, { firstWeek: 5, weeksLeft: 8 });
  assert.equal(eight.preBlock, null);
  const tests = allDays(eight).filter((d) => d.test).map((d) => d.key);
  assert.deepEqual(tests, ['w5-end', 'w8-long']);
  // Starting in week 4 or 8: that week already has its test, so no second one.
  const nine = buildPlan({ ...example, raceDate: '2026-12-19' }, TODAY);
  assert.equal(nine.weeks[0].n, 4);
  assert.deepEqual(allDays(nine).filter((d) => d.test && d.week === 4).map((d) => d.key), ['w4-long']);
  // In the taper there is no extra test.
  const two = buildPlan({ ...example, raceDate: '2026-11-01' }, TODAY);
  assert.equal(two.weeks[0].n, 11);
  assert.equal(allDays(two).filter((d) => d.test).length, 0);
});

test('race more than 12 weeks away: full plan and the start date is shown', () => {
  const p = buildPlan(example, TODAY);
  assert.equal(p.weeks[0].n, 1);
  assert.equal(p.shortened, null);
  assert.equal(p.preBlock.start, 'Mon Feb 1, 2027');
  assert.equal(p.preBlock.weeksUntil, 15);
});

test('5k tests have no target pace: they measure where the athlete is today', () => {
  for (const fiveK of ['', '20:00']) {
    const p = buildPlan({ ...example, goal: '1:15', fiveK }, TODAY);
    for (const d of allDays(p).filter((x) => x.test)) {
      const main = d.lines.find((l) => /^5 km test/.test(l));
      assert.ok(main, d.key);
      assert.doesNotMatch(main, /\d:\d\d\/km|aim/, d.key);
    }
  }
});

// ---------- strength targets ----------

const liftLines = (p, key) => allDays(p).find((d) => d.key === key).lines.filter((l) => /body weight/.test(l));

test('strength targets: % of body weight by lift and men/women, kg when body weight is given', () => {
  const men = buildPlan({ ...example, age: '30-34', bodyWeight: '80' }, TODAY);
  assert.deepEqual(liftLines(men, 'w1-str'), [
    'Back Squat: 3 sets of 8-10 reps @ 60 kg, about 75% of body weight',
    'Bench Press: 3 sets of 8-10 reps @ 47.5 kg, about 60% of body weight',
    'Romanian Deadlifts: 3 sets of 10-12 reps @ 52.5 kg, about 65% of body weight',
  ]);
  const women = buildPlan({ ...example, age: '30-34', division: 'WO', bodyWeight: '62' }, TODAY);
  assert.match(liftLines(women, 'w1-str')[1], /Bench Press: .* @ 25 kg, about 40% of body weight/);
  // No body weight: percentages only.
  const noBw = buildPlan({ ...example, age: '30-34' }, TODAY);
  assert.equal(liftLines(noBw, 'w1-str')[1], 'Bench Press: 3 sets of 8-10 reps @ about 60% of body weight');
  // Mixed doubles shows both; dumbbells are per hand; notes in brackets stay after the target.
  const mixed = buildPlan({ ...example, age: '30-34', division: 'XD', bodyWeight: '75' }, TODAY);
  assert.match(linesOf(mixed, 'w3-str'), /Incline Dumbbell Press: 3 sets of 8-10 reps @ 2 x \d+\/\d+ kg \(men\/women\), about \d+%\/\d+% of body weight each/);
  assert.match(linesOf(mixed, 'w8-str'), /Deadlifts: 3 sets of 3-5 reps @ [\d.]+\/[\d.]+ kg \(men\/women\), about \d+%\/\d+% of body weight \(heavy, focus on form\)/);
  // Bodyweight squats, sandbag work and pull-ups get no % target.
  for (const d of allDays(men)) for (const l of d.lines) if (/^(Bodyweight Squats|Sandbag|Pull-ups)/.test(l)) assert.doesNotMatch(l, /body weight/, l);
});

test('strength targets: heavier for fewer reps and for Pro, lighter for 45+ and taper weeks', () => {
  const at = (line, sex = 'm', o) => liftShare(line, sex, o).share;
  assert.ok(at('Back Squat: 3 sets of 5 reps') > at('Back Squat: 3 sets of 8-10 reps'));
  assert.ok(at('Back Squat: 3 sets of 5 reps', 'm', { pro: true }) > at('Back Squat: 3 sets of 5 reps'));
  assert.ok(at('Back Squat: 3 sets of 5 reps', 'm', { is45: true }) < at('Back Squat: 3 sets of 5 reps'));
  assert.ok(at('Back Squat: 3 sets of 5 reps (lighter weight)') < at('Back Squat: 3 sets of 5 reps'));
  assert.ok(at('Bench Press: 3 sets of 8 reps', 'f') < at('Bench Press: 3 sets of 8 reps', 'm'));
  assert.equal(liftShare('Plank: 3 sets, hold for 45 seconds', 'm'), null);
  // Every week's weighted lifts get a target, and no target is silly.
  for (const division of Object.keys(DIVISIONS)) {
    const p = buildPlan({ ...example, division, bodyWeight: '70' }, TODAY);
    for (const d of allDays(p)) for (const l of d.lines) {
      const m = /about (\d+)%(?:\/(\d+)%)? of body weight/.exec(l);
      if (m) for (const v of [m[1], m[2]].filter(Boolean)) assert.ok(+v >= 5 && +v <= 140, `${division}: ${l}`);
    }
  }
  assert.ok(validateInputs({ ...example, bodyWeight: '20' }, TODAY).bodyWeight);
  assert.deepEqual(validateInputs({ ...example, bodyWeight: '72.5' }, TODAY), {});
  assert.deepEqual(validateInputs({ ...example, bodyWeight: '' }, TODAY), {});
});

// ---------- kg / lb ----------

test('pounds: station loads, lift targets, WOD text and body weight range', async () => {
  const { textToUnits, lbFromKg } = await import('../public/js/plan.js');
  assert.equal(lbFromKg(24), 53);
  assert.equal(lbFromKg(152), 335);
  assert.equal(textToUnits('KB swings (24/16 kg)', 'lb'), 'KB swings (53/35 lb)');
  assert.equal(textToUnits('farmers carry (2x24/2x16 kg)', 'lb'), 'farmers carry (2x53/2x35 lb)');
  assert.equal(textToUnits('wall balls (6/4 kg)', 'kg'), 'wall balls (6/4 kg)');
  assert.equal(textToUnits('box jump-overs (24/20 in)', 'lb'), 'box jump-overs (24/20 in)');

  const lb = buildPlan({ ...example, age: '30-34', bodyWeight: '176', units: 'lb' }, TODAY);
  assert.equal(lb.units, 'lb');
  assert.match(linesOf(lb, 'w1-str'), /Back Squat: 3 sets of 8-10 reps @ 130 lb, about 75% of body weight/);
  assert.match(linesOf(lb, 'w5-skl'), /Farmer's Carry: 4 x 50 m @ 2 x 44 lb/);
  for (const d of allDays(lb)) for (const l of [...d.lines, ...(d.wod?.lines || [])]) assert.doesNotMatch(l, /\bkg\b/, l);
  // The same athlete in kg gets the same % and about the same weight.
  const kg = buildPlan({ ...example, age: '30-34', bodyWeight: '80' }, TODAY);
  assert.match(linesOf(kg, 'w1-str'), /@ 60 kg, about 75%/);

  assert.ok(validateInputs({ ...example, units: 'lb', bodyWeight: '60' }, TODAY).bodyWeight);
  assert.deepEqual(validateInputs({ ...example, units: 'lb', bodyWeight: '300' }, TODAY), {});
  assert.ok(validateInputs({ ...example, bodyWeight: '300' }, TODAY).bodyWeight, '300 kg is out of range');
});

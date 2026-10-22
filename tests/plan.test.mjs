import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, validateInputs, fmtTime, parseHM, normalizeTime, DIVISIONS } from '../public/js/plan.js';
import { hrProfile, suggest, applySuggestion } from '../public/js/hr.js';
import { buildIcs } from '../public/js/ics.js';

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
  const tue = p.weeks[1].days[3]; // week 2 Thursday hybrid: 8 x 400 @ threshold
  assert.match(tue.lines[0], /8 x 400 m @ 4:20\/km/);
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
    const mon = w.days[0];
    assert.equal(mon.label, 'Strength');
    assert.ok(mon.lines.some((l) => /Calf raises/.test(l)), `week ${w.n} strength has calf work`);
  }
  assert.ok(p.recoveryTips);
});

test('under 45: no age changes', () => {
  const p = buildPlan({ ...example, age: '30-34' }, TODAY);
  assert.equal(p.recoveryTips, null);
  const w5 = p.weeks[4];
  assert.equal(w5.days.filter((d) => d.effort === 'hard').length, 3);
  assert.ok(!w5.days[0].lines.some((l) => /Calf raises/.test(l)));
});

test('5 custom days: Wednesday session dropped, its work moves, long day last', () => {
  const p = buildPlan({ ...example, age: '30-34', days: [0, 1, 3, 4, 6] }, TODAY);
  const w5 = p.weeks[4];
  const trained = w5.days.filter((d) => d.effort !== 'rest');
  assert.equal(trained.length, 5);
  assert.ok(!trained.some((d) => d.key === 'w5-rec'));
  const skl = trained.find((d) => d.key === 'w5-skl');
  assert.ok(skl.lines.some((l) => /Sled Push/.test(l)), 'Wednesday station work moved to the skill session');
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

test('.ics output', () => {
  const p = buildPlan(example, TODAY);
  const ics = buildIcs(p, 'race-2027-04-24', new Date('2026-10-22T10:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  const events = ics.match(/BEGIN:VEVENT/g).length;
  const sessions = p.weeks.flatMap((w) => w.days).filter((d) => d.effort !== 'rest').length;
  assert.equal(events, sessions);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(ics, /DTSTART;VALUE=DATE:20270424/);
  assert.ok(!/[^\r]\n/.test(ics), 'only CRLF line endings');
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
  const wednesdays = allDays(p).filter((d) => d.wod && /-rec$/.test(d.key)).map((d) => d.week);
  assert.deepEqual(wednesdays, [3, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(!allDays(p).find((d) => d.key === 'w1-rec').wod, 'active recovery stays light');
});

test('WOD loads are filled in for every division', () => {
  for (const division of ['MO', 'WO', 'MP', 'WP']) {
    const p = buildPlan({ ...example, division }, TODAY);
    for (const d of allDays(p)) {
      for (const l of [d.wod?.title, ...(d.wod?.lines || [])].filter(Boolean)) assert.doesNotMatch(l, /\{[^}]+\}/, l);
    }
  }
  const wo = buildPlan({ ...example, division: 'WO' }, TODAY);
  assert.ok(allDays(wo).find((d) => d.key === 'w3-rec').wod.lines.includes('12 KB swings @ 16 kg'));
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

test('.ics includes the WOD', () => {
  const p = buildPlan(example, TODAY);
  const ics = buildIcs(p, 'race-2027-04-24').replace(/\r\n /g, '');
  assert.ok(ics.includes('Then: CrossFit WOD · 12-min AMRAP\\, easy pace'));
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
  const expectRun = { 'w1-end': 35, 'w2-end': 40, 'w4-end': 35, 'w6-end': 60, 'w8-end': 65, 'w10-end': 70, 'w1-long': 50, 'w2-long': 55, 'w3-long': 60 };
  for (const [key, min] of Object.entries(expectRun)) assert.match(linesOf(p, key), new RegExp(`Run: ${min} minutes`), key);
  for (const n of [2, 4, 6, 8, 10]) assert.match(linesOf(p, `w${n}-end`), /SkiErg: /, `week ${n}`);
  for (const n of [1, 3, 5, 7, 9, 11]) assert.match(linesOf(p, `w${n}-end`), /Row: /, `week ${n}`);
  for (const n of [7, 8, 9]) assert.match(linesOf(p, `w${n}-rec`), /Sled Pull: 3 x 50 m/, `week ${n}`);
});

// ---------- machine swaps ----------

test('machine swaps follow the chart', () => {
  const all = { ...example, age: '30-34' };
  const p = buildPlan(all, TODAY);
  assert.match(linesOf(p, 'w5-long'), /\+ 1000 m row \+/);

  const menNoRow = buildPlan({ ...all, equipment: ['ski', 'bike'] }, TODAY);
  assert.match(linesOf(menNoRow, 'w5-long'), /800 m run or 2000 m bike \(no rower\)/);
  assert.match(linesOf(menNoRow, 'w1-end'), /Bike: 15 min at a moderate effort \(no rower\)/);

  const womenNoRow = buildPlan({ ...all, division: 'WO', equipment: [] }, TODAY);
  assert.match(linesOf(womenNoRow, 'w5-long'), /1000 m run \(no rower\)/);
  assert.match(linesOf(womenNoRow, 'w1-end'), /Run: 15 min @ .*\/km \(no rower\)/);

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

test('start with a 5k heart-rate test', () => {
  const p = buildPlan({ ...example, startTest: true }, TODAY);
  const tue = allDays(p).find((d) => d.key === 'w1-end');
  assert.equal(tue.label, '5k Heart-Rate Test');
  assert.ok(tue.test && tue.hrTest);
  assert.equal(allDays(buildPlan(example, TODAY)).find((d) => d.key === 'w1-end').label, 'Endurance');
});

test('suggestions from logged heart rates', () => {
  const inp = { ...example, age: '30-34', hr5k: '170' };
  const p = buildPlan(inp, TODAY);
  const ceiling = p.hr.easy[1];

  // Easy runs (Tuesday weeks 1, 2, 4 are easy).
  const hot = { 'w1-end': { hr: ceiling + 10, feel: 'ok' }, 'w2-end': { hr: ceiling + 8, feel: 'ok' }, 'w4-end': { hr: ceiling - 5, feel: 'ok' } };
  const s = suggest(p, hot);
  assert.equal(s.length, 1);
  assert.match(s[0].id, /^easy-hot:w4-end$/);
  const inZone = { 'w1-end': { hr: ceiling - 5 }, 'w2-end': { hr: ceiling }, 'w4-end': { hr: ceiling + 2 } };
  assert.equal(suggest(p, inZone).length, 0);

  // Applying slows easy runs by 10 s/km and the suggestion does not come back.
  const next = applySuggestion(inp, s[0]);
  const p2 = buildPlan(next, TODAY);
  assert.equal(p2.paces.easy[0], p.paces.easy[0] + 10);
  assert.equal(p2.paces.steady, p.paces.steady);
  assert.equal(suggest(p2, hot, next.dismissed).length, 0);

  // Hard sessions (Thursday hybrids use steady/threshold).
  const hybrids = allDays(p).filter((d) => /-hyb$/.test(d.key) && (d.zone === 'thr' || d.zone === 'steady')).slice(0, 3);
  const hardHot = Object.fromEntries(hybrids.map((d) => [d.key, { hr: p.hr[d.zone][1] + 10, feel: 'hard' }]));
  const sh = suggest(p, hardHot);
  assert.equal(sh[0].apply.hard, 5);
  const thrDays = allDays(p).filter((d) => d.zone === 'thr').slice(0, 3);
  const tooEasy = Object.fromEntries(thrDays.map((d) => [d.key, { hr: p.hr.thr[0] - 10, feel: 'easy' }]));
  assert.equal(suggest(p, tooEasy)[0].apply.hard, -5);

  // A logged 5k test offers to update the 5k time and threshold HR.
  const t = suggest(p, { 'w4-long': { fiveK: '19:30', hr: 175, feel: 'hard' } });
  assert.equal(t[0].apply.kind, 'test');
  const p3 = buildPlan(applySuggestion(inp, t[0]), TODAY);
  assert.equal(p3.paces.fiveK, 234);
  assert.equal(p3.hr.lthr, 172);
});

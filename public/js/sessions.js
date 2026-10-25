// Session content based on "Hyrox 12 week plan.pdf".
// Each week runs: Mon Endurance, Tue Strength, Wed Active Recovery (about 45 min), Thu Hybrid (written
// like a Workout of the Day), Fri Skill + WOD, Sat Long Endurance / test / simulation, Sun rest.
// Tokens in curly braces are replaced by plan.js with the athlete's own numbers:
//   {easy} {steady} {thr} {5k} {race}   run paces per km
//   {m:row:1000m} {m:ski:15min:easy}   machine work: machine, amount (m or min, optionally "2 x "),
//                                       and effort (easy | steady | thr). plan.js writes it out with a
//                                       split per 500 m, or swaps it for another machine or running.
//   {push} {pull} {farm} {bag} {wb} {kb} station loads for the week
//   {m:row:30s}                        machine work in a one-minute window: the metres the athlete covers in 30 s
//   {r:10}                             reps in a one-minute window: 10 for a 1:10 racer, fewer for slower athletes
//   {every} {total} {rounds} {sets} {on} {cap}  a session's clock, set by plan.js from `clock` (below)
// effort: hard | moderate | easy | rest
// On a 5-day plan the Wednesday recovery session is dropped.
//
// clock: the timed rounds of a Hybrid session. `work` is one round, and plan.js times it with the athlete's
// own paces so every round fits, with rest to spare. `every`, `on` and `cap` are the least the session gets;
// a slower athlete gets more time per round and fewer rounds or sets, so the session keeps its length.
//   { every, total, work }      "Every {every} min for {total} min ({rounds})"
//   { sets, on, off, work }     "{sets}, {on} min on / 2 min off": the work, then max reps in the time left
//   { rounds, cap, work }       "{rounds} for time ({cap}-min cap)"
// work items: ['run', metres, pace token], ['row' | 'ski', metres], or [MOVE_SEC key, reps or metres].

/** Seconds per rep (or per metre) for an athlete racing about 1:10, as in tools/wod/generate_wods.py. */
export const MOVE_SEC = {
  airSquat: 1.8, bbj: 5.0, burpee: 4.0, gobletSquat: 2.5, kbSwing: 2.2, lunge: 2.0, wallBall: 3.0, sbClean: 3.0,
  sbLunge: 3.0, sledPush: 3.6, sledPull: 4.0, // per metre
};

export const PHASES = {
  1: 'Building the Foundation',
  2: 'Strength & Power Integration',
  3: 'Specificity & Peaking',
};

// Share of race weight used for sled / farmers loads each week.
export const WEEK_LOAD = { 1: 0.8, 2: 0.8, 3: 0.8, 4: 0.8, 5: 0.8, 6: 0.95, 7: 1.1, 8: 1.0, 9: 1.0, 10: 1.0, 11: 0.6 };

const plank = (s) => `Plank: 3 sets, hold for ${s} seconds`;
const pullups = (r) => `Pull-ups/Lat Pulldowns: 3 sets of AMRAP or ${r} reps`;
const WARM_UP = 'Add a 10 min warm-up and 5 min cool-down';
// About 45 minutes. No machine is named, so it reads the same whatever equipment the athlete has.
const recovery = (focus) => [
  '15 min very easy cardio: brisk walk or any machine you have. You should be able to hold a full conversation',
  `15 min mobility: ${focus}`,
  '10 min foam rolling: calves, quads, glutes and upper back',
  '5 min easy stretching and slow breathing',
];

export const WEEKS = [
  {
    n: 1, phase: 1, title: 'Adaptation & Assessment',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 35 minutes at a conversational pace ({easy})',
        '{m:row:15min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 8-10 reps',
        'Bench Press: 3 sets of 8-10 reps',
        'Romanian Deadlifts: 3 sets of 10-12 reps',
        pullups('8-10'),
        plank('45-60'),
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('hips and ankles') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { every: 4, total: 40, work: [['run', 500, 'steady'], ['airSquat', 10], ['bbj', 5]] }, lines: [
        'Every {every} min for {total} min ({rounds}), each round:',
        '500 m run @ {steady}',
        '10 air squats',
        '5 burpee broad jumps',
        'Rest the time left, then start the next round',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Strength: 4 sets of 10 goblet squats @ {kb} + 10 dumbbell rows per arm, 90 s rest between sets',
        'Practice Burpee Broad Jumps: 6 sets of 8 reps, 60 s rest. Focus on form',
        'Core: 3 rounds of 30 s plank + 10 dead bugs per side',
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 50 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 2, phase: 1, title: 'Increasing Volume',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 40 minutes at a conversational pace ({easy})',
        '{m:ski:20min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 8 reps (increase weight slightly from Week 1)',
        'Bench Press: 3 sets of 8 reps (increase weight)',
        'Romanian Deadlifts: 3 sets of 10 reps (increase weight)',
        pullups('8-10'),
        'Overhead Press: 3 sets of 8-10 reps',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('thoracic spine and shoulders') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { sets: 4, on: 9, off: 2, work: [['run', 800, 'thr'], ['ski', 250], ['lunge', 20]] }, lines: [
        '{sets}, {on} min on / 2 min off:',
        '800 m run @ {thr}',
        '{m:ski:250m}',
        '20 walking lunges',
        'Max wall balls @ {wb} in the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Strength: 4 sets of 10 reverse lunges per leg + 10 push-ups, 90 s rest between sets',
        "Practice Farmer's Carry: 8 sets of 50 m @ {farm}, 60-90 s rest. Use challenging weight",
        'Core: 3 rounds of 20 s side plank per side + 10 hollow rocks',
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 55 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 3, phase: 1, title: 'Introducing Intensity',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 5 x 1-minute hill sprints or fast intervals (around {5k}), 2 minutes rest between',
        '{m:row:2 x 10min:thr}, with 2 minutes rest',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Front Squat: 3 sets of 8 reps',
        'Incline Dumbbell Press: 3 sets of 8-10 reps',
        'Good Mornings: 3 sets of 10-12 reps',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Glute Bridges: 3 sets of 15 reps',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('hamstrings and hip flexors') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { sets: 5, on: 7, off: 1, work: [['run', 800, 'steady'], ['kbSwing', 15]] }, lines: [
        '{sets}, {on} min on / 1 min off:',
        '800 m run @ {steady}',
        '15 KB swings @ {kb}',
        'Max burpees in the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Strength: 3 sets of 8 single-leg Romanian deadlifts per leg + 10 dumbbell push presses, 90 s rest between sets',
        'Sandbag training: 6 sets of 30 seconds of sandbag cleans @ {bag}, 60 s rest',
        'Practice Wall Balls: 6 sets of 15 reps @ {wb}, 60 s rest. Focus on consistent height and power',
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 60 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 4, phase: 1, title: 'Consolidation & Mild Deload',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 35 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 6 reps (maintain or slightly increase weight)',
        'Bench Press: 3 sets of 6 reps (maintain or slightly increase weight)',
        'Romanian Deadlifts: 3 sets of 8 reps (maintain or slightly increase weight)',
        pullups('6-8'),
        plank('60'),
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('easy full-body flow (deload week)') },
      { key: 'hyb', label: 'Hybrid', effort: 'moderate',
        clock: { every: 3, total: 36, work: [['run', 400, 'steady'], ['airSquat', 10]] }, lines: [
        'Every {every} min for {total} min ({rounds}), smooth (deload week), each round:',
        '400 m run @ {steady}',
        '10 air squats',
        'Rest the time left, then start the next round',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Strength (light, deload week): 3 sets of 10 push-ups + 10 dumbbell rows per arm, 60 s rest between sets',
        'Practice Sled Push: 6 sets of 50 m @ {push}, 90 s rest. Focus on driving through the legs',
        'Core: 3 rounds of 30 s plank + 10 dead bugs per side',
      ] },
      { key: 'long', label: '5k Time Trial', effort: 'hard', test: true, lines: [
        '15 min easy warm-up ({easy}) with 3 short strides',
        '5 km test: run it as fast as you can hold at an even pace. No target: this shows where you are today, not your goal',
        '10 min easy cool-down. Log your time (and average heart rate) and your workouts update to match',
      ] },
    ],
  },
  {
    n: 5, phase: 2, title: 'Introducing Race Specifics',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 35 minutes with 6 x 1-minute intervals @ {5k}, with 90 seconds rest (the rest easy)',
        '{m:row:2 x 12min:thr}, with 2 minutes rest',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 5-8 reps (focus on form and controlled movement)',
        'Overhead Press: 3 sets of 6-8 reps',
        'Walking Lunges with Dumbbells: 4 sets of 10 reps per leg',
        'Renegade Rows: 3 sets of 8-10 reps per side',
        'Weighted Plank: 3 sets, hold for 45-60 seconds',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('hips and ankles') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { rounds: 3, cap: 40, work: [['run', 1000, 'thr'], ['row', 500], ['bbj', 12], ['wallBall', 20]] }, lines: [
        '{rounds} for time ({cap}-min cap):',
        '1 km run @ {thr}',
        '{m:row:500m}',
        '12 burpee broad jumps',
        '20 wall balls @ {wb}',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Push: 4 x 50 m @ {push} (add weight progressively)',
        "Farmer's Carry: 4 x 50 m @ {farm} (add weight progressively)",
        'Sandbag Cleans: 3 sets of 10 reps @ {bag}',
        'Sandbag Lunges: 3 sets of 10 reps per leg @ {bag}',
      ] },
      { key: 'long', label: 'Mock Race', effort: 'hard', lines: [
        'Mock Race Block: 2 km Run @ {race} + {m:row:1000m} + 2 km Run @ {race}. Focus on pacing',
      ] },
    ],
  },
  {
    n: 6, phase: 2, title: 'Building Strength Endurance',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 60 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 5 reps (increase weight)',
        'Bench Press: 3 sets of 6-8 reps (increase weight)',
        'Front Squats: 3 sets of 6-8 reps',
        pullups('8-10'),
        'Dips: 3 sets of AMRAP or 8-10 reps',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('thoracic spine and shoulders') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { sets: 4, on: 9, off: 2, work: [['run', 800, 'steady'], ['sledPush', 25], ['sledPull', 25]] }, lines: [
        '{sets}, {on} min on / 2 min off:',
        '800 m run @ {steady}',
        '25 m sled push @ {push}',
        '25 m sled pull @ {pull}',
        'Max wall balls @ {wb} in the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Pull: 4 x 50 m @ {pull} (backward drag, add weight)',
        'Farmers Carry: 4 x 50 m @ {farm} (add weight)',
        'Bear Crawls: 3 sets of 30 m',
        'Sandbag Overhead Lunges: 3 sets of 8 reps per leg @ {bag}',
      ] },
      { key: 'long', label: 'Half Simulation', effort: 'hard', sim: 'half', lines: [
        'Half race simulation: 8 x 500 m run + all 8 stations in race order at half the race distance, at race weights. Practise smooth transitions',
      ] },
    ],
  },
  {
    n: 7, phase: 2, title: 'Increasing Load & Intensity',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 8 x 1-minute intervals @ {5k}, with 60 seconds rest (the rest easy)',
        '{m:row:2 x 10min:thr}, with 2 minutes rest',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 5 reps (increase weight)',
        'Overhead Press: 3 sets of 5-7 reps',
        'Romanian Deadlifts: 3 sets of 8 reps (increase weight)',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Push-ups: 3 sets of AMRAP',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('hamstrings and hip flexors') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { every: 5, total: 40, work: [['run', 600, 'thr'], ['kbSwing', 15], ['sbLunge', 20]] }, lines: [
        'Every {every} min for {total} min ({rounds}), each round:',
        '600 m run @ {thr}',
        '15 KB swings @ {kb}',
        '20 m sandbag lunges @ {bag}',
        'Rest the time left, then start the next round',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Push: 5 x 50 m @ {push} (overload: heavier than race weight)',
        'Sled Pull: 3 x 50 m @ {pull}',
        'Sandbag Cleans: 4 sets of 8 reps @ {bag}',
        "Farmer's Carry: 4 x 50 m @ {farm} (increase weight)",
        'Wall Balls: 4 sets of 12 reps @ {wb}',
      ] },
      { key: 'long', label: 'Mock Race', effort: 'hard', lines: [
        'Mock Race: 3 km Run @ {race} + {m:row:1000m} + 3 km Run @ {race}. Focus on pacing and managing fatigue',
      ] },
    ],
  },
  {
    n: 8, phase: 2, title: 'Peak Strength & Refinement',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 65 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 3-5 reps (heavy, focus on form)',
        'Bench Press: 3 sets of 5-7 reps (heavy)',
        'Walking Lunges with Dumbbells: 4 sets of 8 reps per leg (heavier)',
        pullups('6-8'),
        'Renegade Rows: 3 sets of 8 reps per side',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('calves, ankles and feet') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { rounds: 4, cap: 45, work: [['run', 1000, 'steady'], ['sledPull', 50], ['ski', 500], ['sbClean', 15]] }, lines: [
        '{rounds} for time ({cap}-min cap):',
        '1 km run @ {steady}',
        '50 m sled pull @ {pull}',
        '{m:ski:500m}',
        '15 sandbag cleans @ {bag}',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Push: 4 x 50 m @ {push} (maintain challenging weight)',
        'Sled Pull: 3 x 50 m @ {pull}',
        'Burpee Broad Jumps: 4 sets of 10 reps',
        "Farmer's Carry: 3 x 50 m @ {farm} (maintain challenging weight)",
        'Wall Balls: 3 sets of 15 reps @ {wb}',
      ] },
      { key: 'long', label: '5k Time Trial', effort: 'hard', test: true, lines: [
        '15 min easy warm-up ({easy}) with 3 short strides',
        '5 km test: run it as fast as you can hold at an even pace. No target: this shows where you are today, not your goal',
        '10 min easy cool-down. Log your time (and average heart rate) and your workouts update to match',
      ] },
    ],
  },
  {
    n: 9, phase: 3, title: 'Race Specificity & Pacing',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 5 x 2-minute intervals @ {thr}, with 2 minutes rest (the rest easy)',
        '{m:row:2 x 15min:steady}, with 2 minutes rest',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Front Squats: 3 sets of 5 reps',
        'Overhead Press: 3 sets of 5 reps',
        'Romanian Deadlifts: 3 sets of 6 reps',
        pullups('6-8'),
        'Weighted Plank: 3 sets, hold for 60 seconds',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('hips and ankles') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { sets: 5, on: 8, off: 1, work: [['run', 800, 'thr'], ['bbj', 10]] }, lines: [
        '{sets}, {on} min on / 1 min off:',
        '800 m run @ {thr}',
        '10 burpee broad jumps',
        'Max wall balls @ {wb} in the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Push: 4 x 50 m @ {push} (focus on controlled power)',
        'Sled Pull: 3 x 50 m @ {pull}',
        "Farmer's Carry: 4 x 50 m @ {farm} (focus on grip strength)",
        'Sandbag Cleans: 4 sets of 10 reps @ {bag}',
        'Wall Balls: 4 sets of 15 reps @ {wb}',
      ] },
      { key: 'long', label: 'Full Simulation', effort: 'hard', sim: 'full', lines: [
        'Full Race Simulation: complete all 8 km of running and all 8 stations in race order. Focus on smooth transitions and pacing',
      ] },
    ],
  },
  {
    n: 10, phase: 3, title: 'Fine-Tuning & Stamina',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 70 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 3 reps (moderate weight)',
        'Bench Press: 3 sets of 5 reps (moderate weight)',
        'Walking Lunges with Dumbbells: 4 sets of 10 reps per leg',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Dips: 3 sets of AMRAP or 8-10 reps',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('thoracic spine and shoulders') },
      { key: 'hyb', label: 'Hybrid', effort: 'hard',
        clock: { every: 6, total: 42, work: [['run', 1000, 'steady'], ['row', 250], ['wallBall', 15]] }, lines: [
        'Every {every} min for {total} min ({rounds}):',
        '1 km run @ {steady}',
        '{m:row:250m}',
        '15 wall balls @ {wb}, rest the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Pull: 4 x 50 m @ {pull} (focus on controlled movement)',
        'Sandbag Lunges: 3 sets of 10 reps per leg @ {bag}',
        "Farmer's Carry: 3 x 50 m @ {farm} (focus on grip)",
        'Wall Balls: 3 sets of 20 reps @ {wb}',
      ] },
      { key: 'long', label: 'Mock Race', effort: 'hard', lines: [
        'Mock Race: 6 km Run @ {race} + {m:row:1000m} + 6 km Run @ {race}. Focus on maintaining effort. Last hard session before the taper',
      ] },
    ],
  },
  {
    n: 11, phase: 3, title: 'Taper & Activation',
    sessions: [
      { key: 'end', label: 'Endurance', effort: 'moderate', lines: [
        'Run: 30 minutes with 4 x 1-minute intervals @ {thr}, with 90 seconds rest (the rest easy)',
        '{m:row:2 x 10min:steady}, with 2 minutes rest',
      ] },
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 5 reps (lighter weight)',
        'Overhead Press: 3 sets of 5 reps (lighter weight)',
        'Romanian Deadlifts: 3 sets of 8 reps (lighter weight)',
        pullups('6-8'),
        plank('45'),
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: recovery('easy full-body flow, nothing forced') },
      { key: 'hyb', label: 'Hybrid', effort: 'moderate',
        clock: { every: 4, total: 24, work: [['run', 400, 'steady'], ['sbClean', 8]] }, lines: [
        'Every {every} min for {total} min ({rounds}), crisp, not hard (taper week):',
        '400 m run @ {steady}',
        '8 sandbag cleans @ {bag}, rest the time left',
        WARM_UP,
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sled Push: 6 x 25 m @ {push} (light weight, focus on speed), 60 s rest',
        'Burpee Broad Jumps: 4 sets of 8 reps',
        "Farmer's Carry: 4 x 30 m @ {farm} (light weight)",
        'Wall Balls: 4 sets of 12 reps @ {wb}',
        'Core: 3 rounds of 30 s plank + 10 dead bugs per side',
      ] },
      { key: 'long', label: 'Light Endurance', effort: 'easy', lines: [
        'Run: 20 minutes at a very easy pace ({easy})',
      ] },
    ],
  },
];

// Week 12, placed relative to the race date (offset in days).
export const RACE_WEEK = [
  { offset: -5, key: 'act', label: 'Activation', effort: 'easy', lines: [
    'Light 20-minute run ({easy})',
    'Dynamic stretching',
  ] },
  { offset: -4, key: 'rev', label: 'Skill Review', effort: 'easy', lines: [
    'Practice one or two race stations at a very light intensity (e.g. 50 m sled push, 10 wall balls). Focus on perfect form',
  ] },
  { offset: -1, key: 'mob', label: 'Light Mobility & Hydration', effort: 'easy', lines: [
    'Light mobility, drink well through the day, lay out your race kit',
  ] },
  { offset: 0, key: 'race', label: 'RACE DAY!', effort: 'hard', race: true, lines: [
    'Execute your plan, stay focused, and leave it all on the course!',
  ] },
  { offset: 1, key: 'post', label: 'Active Recovery', effort: 'easy', lines: [
    'Light walk, stretching',
  ] },
];

// Replaces week 1's Monday endurance session: every plan opens with a 5k test (time + optional heart rate).
export const HR_TEST = { key: 'end', label: '5k Test', effort: 'hard', test: true, hrTest: true, lines: [
  '15 min easy warm-up ({easy}) with 3 short strides. Wear a heart-rate monitor if you have one',
  '5 km test: run it as fast as you can hold at an even pace. No target: this shows where you are today, not your goal',
  'Log your time (and average heart rate if you wore a monitor) and your workouts update to match your new paces',
] };

export const BEFORE_12_WEEKS = [
  'Easy running 4-5 days a week at {easy}. You should be able to talk in full sentences.',
  'One threshold run a week, e.g. 3 x 8 min @ {thr} with 2 min easy jog.',
  'Two full-body strength days (squat, hinge, push, pull, lunges, core).',
  'Light station technique once a week: wall balls, burpee broad jumps, sled if you have one.',
  'Every 4th week, cut volume by about a third so your body can absorb the work.',
  'In the week before week 1, run a 5k test and enter the time here so your paces are right.',
];

export const RECOVERY_TIPS_45 = [
  'Only two hard days a week. Treat every other session as truly easy or moderate.',
  'Calf and tibialis work on strength days protects your Achilles and shins on the run.',
  'Warm up for 10-15 minutes before hard sessions; build into the first rep.',
  'Sleep 7-9 hours and get 1.6-2 g of protein per kg body weight per day.',
  'If a tendon is sore the next morning, swap the next run for a bike or row.',
];

// One short workout (WOD) a week, done after Friday's Skill or Skill/Strength session, keyed "week-sessionKey".
// They stay smooth because Saturday is usually a long run, a simulation or a test.
export const WODS = {
  '1-skl': { title: '12-min AMRAP, easy pace', lines: [
    '{m:row:200m}', '10 air squats', '8 push-ups', '5 burpee broad jumps',
  ] },
  '2-skl': { title: 'EMOM 12, three-minute rotation', lines: [
    'Minute 1: {m:row:30s}', 'Minute 2: {r:12} walking lunges', 'Minute 3: {r:6} burpees',
  ] },
  '3-skl': { title: '14-min AMRAP', lines: [
    '200 m run @ {steady}', '12 wall balls @ {wb}', '8 burpees',
  ] },
  '4-skl': { title: 'EMOM 10, easy (deload week)', lines: [
    'Odd minutes: {r:8} wall balls @ {wb}', 'Even minutes: {m:row:30s}',
  ] },
  '5-skl': { title: '12-min AMRAP, steady', lines: [
    '{m:row:250m}', '8 sandbag lunges @ {bag}', '8 KB swings @ {kb}',
  ] },
  '6-skl': { title: 'EMOM 12, smooth (simulation tomorrow)', lines: [
    'Odd minutes: {r:10} wall balls @ {wb}', 'Even minutes: {m:row:30s}',
  ] },
  '7-skl': { title: '14-min AMRAP', lines: [
    '200 m run @ {race}', '12 wall balls @ {wb}', '6 burpee broad jumps',
  ] },
  '8-skl': { title: 'EMOM 10, easy (5k test tomorrow)', lines: [
    'Odd minutes: {m:ski:30s}', 'Even minutes: {r:8} goblet squats @ {kb}',
  ] },
  '9-skl': { title: 'EMOM 10, smooth (simulation tomorrow)', lines: [
    'Odd minutes: {r:10} wall balls @ {wb}', 'Even minutes: easy {m:row:30s}',
  ] },
  '10-skl': { title: '12-min AMRAP, steady', lines: [
    '{m:row:250m}', '10 KB swings @ {kb}', '10 box step-ups',
  ] },
  '11-skl': { title: 'EMOM 8, light and crisp', lines: [
    'Odd minutes: {r:6} wall balls @ {wb}', 'Even minutes: {m:ski:30s}',
  ] },
};

for (const week of WEEKS) {
  for (const s of week.sessions) {
    const wod = WODS[`${week.n}-${s.key}`];
    if (wod) {
      s.wod = wod;
      s.label += ' + WOD';
    }
  }
}

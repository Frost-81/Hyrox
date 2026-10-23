// Session content transcribed from "Hyrox 12 week plan.pdf".
// Tokens in curly braces are replaced by plan.js with the athlete's own numbers:
//   {easy} {steady} {thr} {5k} {race}   run paces per km
//   {m:row:1000m} {m:ski:15min:easy}   machine work: machine, amount (m or min, optionally "2 x "),
//                                       and effort (easy | steady | thr). plan.js writes it out with a
//                                       split per 500 m, or swaps it for another machine or running.
//   {push} {pull} {farm} {bag} {wb}     station loads for the week
// effort: hard | moderate | easy | rest
// movable: on a 5-day plan this Wednesday session is dropped and its lines move to Friday.

export const PHASES = {
  1: 'Building the Foundation',
  2: 'Strength & Power Integration',
  3: 'Specificity & Peaking',
};

// Share of race weight used for sled / farmers loads each week.
export const WEEK_LOAD = { 1: 0.8, 2: 0.8, 3: 0.8, 4: 0.8, 5: 0.8, 6: 0.95, 7: 1.1, 8: 1.0, 9: 1.0, 10: 1.0, 11: 0.6 };

const plank = (s) => `Plank: 3 sets, hold for ${s} seconds`;
const pullups = (r) => `Pull-ups/Lat Pulldowns: 3 sets of AMRAP or ${r} reps`;

export const WEEKS = [
  {
    n: 1, phase: 1, title: 'Adaptation & Assessment',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 8-10 reps',
        'Bench Press: 3 sets of 8-10 reps',
        'Romanian Deadlifts: 3 sets of 10-12 reps',
        pullups('8-10'),
        plank('45-60'),
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 35 minutes at a conversational pace ({easy})',
        '{m:row:15min:easy}',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: [
        'Light stretching, foam rolling, or a 20-minute brisk walk',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 10 x 400 m @ {steady}, with 90 seconds rest',
        'Bodyweight Squats: 3 sets of 15 reps',
      ] },
      { key: 'skl', label: 'Skill', effort: 'moderate', lines: [
        'Practice Burpee Broad Jumps: 3 sets of 10 reps. Focus on form',
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 50 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 2, phase: 1, title: 'Increasing Volume',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 8 reps (increase weight slightly from Week 1)',
        'Bench Press: 3 sets of 8 reps (increase weight)',
        'Romanian Deadlifts: 3 sets of 10 reps (increase weight)',
        pullups('8-10'),
        'Overhead Press: 3 sets of 8-10 reps',
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 40 minutes at a conversational pace ({easy})',
        '{m:ski:20min:easy}',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: [
        'Light yoga or mobility work',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 8 x 400 m @ {thr}, with 90 seconds rest',
        'Walking Lunges with Dumbbells: 3 sets of 10 reps per leg',
      ] },
      { key: 'skl', label: 'Skill', effort: 'moderate', lines: [
        "Practice Farmer's Carry: 3 sets of 50 m @ {farm}. Use challenging weight",
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 55 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 3, phase: 1, title: 'Introducing Intensity',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Front Squat: 3 sets of 8 reps',
        'Incline Dumbbell Press: 3 sets of 8-10 reps',
        'Good Mornings: 3 sets of 10-12 reps',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Glute Bridges: 3 sets of 15 reps',
      ] },
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 5 x 1-minute hill sprints or fast intervals (around {5k}), 2 minutes rest between',
        '{m:row:2 x 10min:thr}, with 2 minutes rest',
      ] },
      { key: 'rec', label: 'Skill', effort: 'moderate', movable: true, lines: [
        'Sandbag training: 3 sets of 30 seconds of sandbag cleans @ {bag}',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 6 x 800 m @ {steady}, with 2 minutes rest',
        'Kettlebell Swings: 3 sets of 15 reps',
      ] },
      { key: 'skl', label: 'Skill', effort: 'moderate', lines: [
        'Practice Wall Balls: 3 sets of 15 reps @ {wb}. Focus on consistent height and power',
      ] },
      { key: 'long', label: 'Long Endurance', effort: 'easy', lines: [
        'Run: 60 minutes at a comfortable pace ({easy})',
      ] },
    ],
  },
  {
    n: 4, phase: 1, title: 'Consolidation & Mild Deload',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 6 reps (maintain or slightly increase weight)',
        'Bench Press: 3 sets of 6 reps (maintain or slightly increase weight)',
        'Romanian Deadlifts: 3 sets of 8 reps (maintain or slightly increase weight)',
        pullups('6-8'),
        plank('60'),
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 35 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'rec', label: 'Active Recovery', effort: 'easy', lines: [
        'Light stretching and mobility work',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 10 x 200 m @ {5k}, with 60 seconds rest',
        'Bodyweight Squats: 3 sets of 12 reps',
      ] },
      { key: 'skl', label: 'Skill', effort: 'moderate', lines: [
        'Practice Sled Push: 3 sets of 50 m @ {push}. Focus on driving through the legs',
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
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 5-8 reps (focus on form and controlled movement)',
        'Overhead Press: 3 sets of 6-8 reps',
        'Walking Lunges with Dumbbells: 4 sets of 10 reps per leg',
        'Renegade Rows: 3 sets of 8-10 reps per side',
        'Weighted Plank: 3 sets, hold for 45-60 seconds',
      ] },
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 35 minutes with 6 x 1-minute intervals @ {5k}, with 90 seconds rest (the rest easy)',
        '{m:row:2 x 12min:thr}, with 2 minutes rest',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Push: 4 x 50 m @ {push} (add weight progressively)',
        "Farmer's Carry: 4 x 50 m @ {farm} (add weight progressively)",
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 10 x 400 m @ {thr}, with 60 seconds rest',
        'Burpee Broad Jumps: 3 sets of 12 reps',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sandbag Cleans: 3 sets of 10 reps @ {bag}',
        'Sandbag Lunges: 3 sets of 10 reps per leg @ {bag}',
      ] },
      { key: 'long', label: 'Simulation', effort: 'hard', lines: [
        'Mock Race Block: 2 km Run @ {race} + {m:row:1000m} + 2 km Run @ {race}. Focus on pacing',
      ] },
    ],
  },
  {
    n: 6, phase: 2, title: 'Building Strength Endurance',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 5 reps (increase weight)',
        'Bench Press: 3 sets of 6-8 reps (increase weight)',
        'Front Squats: 3 sets of 6-8 reps',
        pullups('8-10'),
        'Dips: 3 sets of AMRAP or 8-10 reps',
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 60 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Pull: 4 x 50 m @ {pull} (backward drag, add weight)',
        'Farmers Carry: 4 x 50 m @ {farm} (add weight)',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 5 x 800 m @ {steady}, with 90 seconds rest',
        'Wall Balls: 3 sets of 15 reps @ {wb}',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Bear Crawls: 3 sets of 30 m',
        'Sandbag Overhead Lunges: 3 sets of 8 reps per leg @ {bag}',
      ] },
      { key: 'long', label: 'Full Simulation', effort: 'hard', sim: true, lines: [
        'Full race simulation: 8 x 1 km run + all 8 stations in race order at race weights. Practise smooth transitions',
      ] },
    ],
  },
  {
    n: 7, phase: 2, title: 'Increasing Load & Intensity',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 5 reps (increase weight)',
        'Overhead Press: 3 sets of 5-7 reps',
        'Romanian Deadlifts: 3 sets of 8 reps (increase weight)',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Push-ups: 3 sets of AMRAP',
      ] },
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 8 x 1-minute intervals @ {5k}, with 60 seconds rest (the rest easy)',
        '{m:row:2 x 10min:thr}, with 2 minutes rest',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Push: 5 x 50 m @ {push} (overload: heavier than race weight)',
        'Sled Pull: 3 x 50 m @ {pull}',
        'Sandbag Cleans: 4 sets of 8 reps @ {bag}',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 8 x 400 m @ {thr}, with 60 seconds rest',
        'Kettlebell Swings: 3 sets of 20 reps',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        "Farmer's Carry: 4 x 50 m @ {farm} (increase weight)",
        'Wall Balls: 4 sets of 12 reps @ {wb}',
      ] },
      { key: 'long', label: 'Simulation', effort: 'hard', lines: [
        'Mock Race: 3 km Run @ {race} + {m:row:1000m} + 3 km Run @ {race}. Focus on pacing and managing fatigue',
      ] },
    ],
  },
  {
    n: 8, phase: 2, title: 'Peak Strength & Refinement',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 3-5 reps (heavy, focus on form)',
        'Bench Press: 3 sets of 5-7 reps (heavy)',
        'Walking Lunges with Dumbbells: 4 sets of 8 reps per leg (heavier)',
        pullups('6-8'),
        'Renegade Rows: 3 sets of 8 reps per side',
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 65 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Push: 4 x 50 m @ {push} (maintain challenging weight)',
        'Sled Pull: 3 x 50 m @ {pull}',
        'Burpee Broad Jumps: 4 sets of 10 reps',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 4 x 1000 m @ {steady}, with 2 minutes rest',
        'Sandbag Cleans: 3 sets of 12 reps @ {bag}',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
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
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Front Squats: 3 sets of 5 reps',
        'Overhead Press: 3 sets of 5 reps',
        'Romanian Deadlifts: 3 sets of 6 reps',
        pullups('6-8'),
        'Weighted Plank: 3 sets, hold for 60 seconds',
      ] },
      { key: 'end', label: 'Endurance', effort: 'hard', lines: [
        'Run: 30 minutes with 5 x 2-minute intervals @ {thr}, with 2 minutes rest (the rest easy)',
        '{m:row:2 x 15min:steady}, with 2 minutes rest',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Push: 4 x 50 m @ {push} (focus on controlled power)',
        'Sled Pull: 3 x 50 m @ {pull}',
        "Farmer's Carry: 4 x 50 m @ {farm} (focus on grip strength)",
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 10 x 400 m @ {thr}, with 45 seconds rest',
        'Burpee Broad Jumps: 4 sets of 10 reps',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        'Sandbag Cleans: 4 sets of 10 reps @ {bag}',
        'Wall Balls: 4 sets of 15 reps @ {wb}',
      ] },
      { key: 'long', label: 'Full Simulation', effort: 'hard', sim: true, lines: [
        'Full Race Simulation: complete all 8 km of running and all 8 stations in race order. Focus on smooth transitions and pacing',
      ] },
    ],
  },
  {
    n: 10, phase: 3, title: 'Fine-Tuning & Stamina',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Deadlifts: 3 sets of 3 reps (moderate weight)',
        'Bench Press: 3 sets of 5 reps (moderate weight)',
        'Walking Lunges with Dumbbells: 4 sets of 10 reps per leg',
        'Barbell Rows: 3 sets of 8-10 reps',
        'Dips: 3 sets of AMRAP or 8-10 reps',
      ] },
      { key: 'end', label: 'Endurance', effort: 'easy', lines: [
        'Run: 70 minutes at a conversational pace ({easy})',
        '{m:ski:15min:easy}',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Pull: 4 x 50 m @ {pull} (focus on controlled movement)',
        'Sandbag Lunges: 3 sets of 10 reps per leg @ {bag}',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'hard', lines: [
        'Run: 6 x 800 m @ {steady}, with 90 seconds rest',
        'Kettlebell Swings: 3 sets of 20 reps',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        "Farmer's Carry: 3 x 50 m @ {farm} (focus on grip)",
        'Wall Balls: 3 sets of 20 reps @ {wb}',
      ] },
      { key: 'long', label: 'Simulation', effort: 'hard', lines: [
        'Mock Race: 6 km Run @ {race} + {m:row:1000m} + 6 km Run @ {race}. Focus on maintaining effort. Last hard session before the taper',
      ] },
    ],
  },
  {
    n: 11, phase: 3, title: 'Taper & Activation',
    sessions: [
      { key: 'str', label: 'Strength', effort: 'moderate', lines: [
        'Back Squat: 3 sets of 5 reps (lighter weight)',
        'Overhead Press: 3 sets of 5 reps (lighter weight)',
        'Romanian Deadlifts: 3 sets of 8 reps (lighter weight)',
        pullups('6-8'),
        plank('45'),
      ] },
      { key: 'end', label: 'Endurance', effort: 'moderate', lines: [
        'Run: 30 minutes with 4 x 1-minute intervals @ {thr}, with 90 seconds rest (the rest easy)',
        '{m:row:2 x 10min:steady}, with 2 minutes rest',
      ] },
      { key: 'rec', label: 'Skill/Strength', effort: 'moderate', movable: true, lines: [
        'Sled Push: 3 x 50 m @ {push} (light weight, focus on speed)',
        'Burpee Broad Jumps: 3 sets of 8 reps',
      ] },
      { key: 'hyb', label: 'Hybrid', effort: 'moderate', lines: [
        'Run: 5 x 400 m @ {steady}, with 60 seconds rest',
        'Sandbag Cleans: 3 sets of 10 reps @ {bag}',
      ] },
      { key: 'skl', label: 'Skill/Strength', effort: 'moderate', lines: [
        "Farmer's Carry: 3 x 30 m @ {farm} (light weight)",
        'Wall Balls: 3 sets of 12 reps @ {wb}',
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

// Replaces week 1's Tuesday session: every plan opens with a 5k test (time + optional heart rate).
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

// Short workouts (WODs) done after the Skill and Skill/Strength sessions, keyed "week-sessionKey".
// Wednesday WODs are the harder ones; Friday WODs stay smooth because Saturday is usually a simulation or test.
export const WODS = {
  '1-skl': { title: '12-min AMRAP, easy pace', lines: [
    '{m:row:200m}', '10 air squats', '8 push-ups', '5 burpee broad jumps',
  ] },
  '2-skl': { title: 'EMOM 12', lines: [
    'Odd minutes: {m:row:200m}', 'Even minutes: 10 walking lunges + 5 burpees',
  ] },
  '3-rec': { title: '3 rounds for time (12-min cap)', lines: [
    '{m:ski:250m}', '12 KB swings @ {kb}', '8 sandbag cleans @ {bag}',
  ] },
  '3-skl': { title: '14-min AMRAP', lines: [
    '200 m run @ {steady}', '12 wall balls @ {wb}', '8 burpees',
  ] },
  '4-skl': { title: 'EMOM 10, easy (deload week)', lines: [
    'Odd minutes: 8 wall balls @ {wb}', 'Even minutes: {m:row:150m}',
  ] },
  '5-rec': { title: '4 rounds for time (18-min cap)', lines: [
    '400 m run @ {thr}', '15 wall balls @ {wb}', '10 box jump-overs (60/50 cm)',
  ] },
  '5-skl': { title: '12-min AMRAP, steady', lines: [
    '{m:row:250m}', '8 sandbag lunges @ {bag}', '8 KB swings @ {kb}',
  ] },
  '6-rec': { title: 'EMOM 16 (4 rounds)', lines: [
    'Minute 1: {m:ski:250m}', 'Minute 2: 12 KB swings @ {kb}', 'Minute 3: 8 burpee broad jumps', 'Minute 4: rest',
  ] },
  '6-skl': { title: 'EMOM 12, smooth (simulation tomorrow)', lines: [
    'Odd minutes: 10 wall balls @ {wb}', 'Even minutes: {m:row:150m}',
  ] },
  '7-rec': { title: 'Chipper for time (18-min cap), steady effort', lines: [
    '{m:row:1000m}', '50 walking lunges', '40 wall balls @ {wb}', '30 KB swings @ {kb}', '20 burpees',
  ] },
  '7-skl': { title: '14-min AMRAP', lines: [
    '200 m run @ {race}', '12 wall balls @ {wb}', '6 burpee broad jumps',
  ] },
  '8-rec': { title: '20-min AMRAP', lines: [
    '400 m run @ {race}', '20 wall balls @ {wb}', '10 burpee broad jumps',
  ] },
  '8-skl': { title: 'EMOM 10, easy (5k test tomorrow)', lines: [
    'Odd minutes: {m:ski:150m}', 'Even minutes: 8 goblet squats @ {kb}',
  ] },
  '9-rec': { title: '18-min AMRAP', lines: [
    '300 m run @ {race}', '12 KB swings @ {kb}', '9 burpee broad jumps',
  ] },
  '9-skl': { title: 'EMOM 10, smooth (simulation tomorrow)', lines: [
    'Odd minutes: 10 wall balls @ {wb}', 'Even minutes: easy {m:row:100m}',
  ] },
  '10-rec': { title: '3 rounds for time (18-min cap)', lines: [
    '{m:ski:500m}', '20 sandbag lunges @ {bag}', '15 wall balls @ {wb}', '10 burpees',
  ] },
  '10-skl': { title: '12-min AMRAP, steady', lines: [
    '{m:row:250m}', '10 KB swings @ {kb}', '10 box step-ups',
  ] },
  '11-rec': { title: '8-min AMRAP, easy to moderate', lines: [
    '{m:row:150m}', '8 wall balls @ {wb}', '5 burpee broad jumps',
  ] },
  '11-skl': { title: 'EMOM 8, light and crisp', lines: [
    'Odd minutes: 6 wall balls @ {wb}', 'Even minutes: {m:ski:100m}',
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

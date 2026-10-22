# Hyrox Plan Builder

A one-page website that builds a personal 12-week Hyrox training plan from a race date, goal time, division, age group, optional 5k time and chosen training days. Sessions come from the "Hyrox 12 week plan" document, with the athlete's own paces, station weights and dates filled in.

- No build step: plain HTML, CSS and ES modules in `public/`.
- Anyone can build a plan and see a preview: summary, race splits, paces and the first week.
- Signing in (Google or email/password) unlocks all 12 weeks, saves the plan to Firestore, and turns on ticking off sessions, printing and the calendar download. The lock is a UI gate only, since the session content ships in the page's JS.
- Every Skill and Skill/Strength session ends with a CrossFit-style WOD (`WODS` in `sessions.js`).
- Heart rate (optional): max HR and/or 5k average HR set the zones, and a 5k heart-rate test can start the plan. Signed-in users log their average HR and how each session felt. The site then suggests pace changes, which the user applies with one tap (`public/js/hr.js`).
- Machine swaps: users untick the machines they don't have, and SkiErg/rower work is swapped using the run/row/bike chart (meter columns) in `SWAP_CHART` in `plan.js`.
- Divisions: Men/Women Open and Pro, plus Men, Women and Mixed Doubles (Open weights).
- Photos: resized copies are in `public/img/`. The originals are in `photos-original/`, which is not deployed and is gitignored.

## Project layout

| Path | What it does |
| --- | --- |
| `public/js/sessions.js` | The plan content: 11 weeks x 6 sessions, the WODs, and race week. Edit sessions here. |
| `public/js/plan.js` | The engine: dates, splits, paces, weights, placing sessions on the picked days, 45+ and 5-day rules, machine swaps. |
| `public/js/hr.js` | Heart-rate zones and suggestions from logged sessions. |
| `public/js/render.js` | HTML for the cards. |
| `public/js/app.js` | Form, buttons and checkboxes. |
| `public/js/cloud.js` | Firebase Auth and Firestore. |
| `public/js/firebase-config.js` | **The only place the Firebase config lives.** |
| `public/js/ics.js` | Calendar (.ics) export. |
| `firestore.rules` | Users can read and write only `users/{their uid}/plans/*`. Everything else is denied. |
| `tests/plan.test.mjs` | Engine tests. |

## Run locally

You need Node.js 18+, the Firebase CLI (`npm i -g firebase-tools`) and Java (for the emulators).

```sh
firebase emulators:start --only hosting,auth,firestore
```

Open http://127.0.0.1:5000. When the site is served on port 5000, it uses the local Auth and Firestore emulators, so nothing touches the real project. The emulator UI is at http://127.0.0.1:4000.

To try the planner without Firebase, any static server works (for example `npx serve public`). Sign-in then talks to the real project.

Run the tests:

```sh
node --test tests/*.test.mjs
```

## One-time Firebase setup

The project is `hyrox-prog` (see `.firebaserc`). The web app config is already in `public/js/firebase-config.js`.

1. **Firestore:** Firebase console → Build → Firestore Database → Create database. Choose a location (it can't be changed later) and start in production mode. The rules in this repo get deployed over the defaults.
2. **Authentication:** Firebase console → Build → Authentication → Get started → Sign-in method. Enable **Google** and **Email/Password**.
3. **Authorized domains:** `hyrox-prog.web.app` and `hyrox-prog.firebaseapp.com` are there by default. Add any custom domain under Authentication → Settings.

## Deploy

```sh
firebase deploy --only hosting,firestore:rules
```

The site goes live at https://hyrox-prog.web.app.

## Data model

`users/{uid}/plans/{planId}` holds `{ inputs, done, logs, createdAt, updatedAt }`. `logs` maps session keys to `{ hr, feel, fiveK? }`. Applied suggestions are stored in `inputs.paceAdjust` and `inputs.dismissed`. `planId` is `race-YYYY-MM-DD`. Only the inputs are stored, and the plan is rebuilt from them on load. `done` maps session keys like `w3-hyb` to `true`. The keys don't depend on weekdays, so changing training days keeps progress.

## Before launch

- Check station weights in `DIVISIONS` (`public/js/plan.js`) against the current official Hyrox rulebook. Sources disagree on wall-ball reps and target heights, so the site doesn't state them.
- The station shares in the spec add up to 100.1%, so the station splits come to about 2 s more than the station total.

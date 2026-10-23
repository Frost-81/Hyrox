# Hybrid Plan Builder

A one-page website that builds a personal 12-week training plan for hybrid fitness races (8 x 1 km runs + 8 stations) from a race date, goal time, division, age group, optional 5k time and chosen training days. Sessions come from the original 12-week plan document, with the athlete's own paces, station weights and dates filled in. Signed-in users also get a daily Workout of the Day.

The site does not use any race organiser's name or branding (trademark). Internal identifiers such as the `hyrox-prog` Firebase project and the `hyrox:*` browser storage keys stay as they are so deploys and saved data keep working.

- No build step: plain HTML, CSS and ES modules in `public/`.
- Anyone can build a plan and see a preview: summary, race splits, paces and the first week.
- Signing in (Google or email/password) unlocks all 12 weeks, saves the plan to Firestore, and turns on ticking off sessions and printing. There is no calendar export on purpose: athletes come back to the site to see each session. The lock is a UI gate only, since the session content ships in the page's JS.
- Every Skill and Skill/Strength session ends with a short WOD (`WODS` in `sessions.js`).
- Time fields add the ":" as you type (`maskTime` in `plan.js`), because phone number pads have no colon key: 130 becomes 1:30.
- 5k tests in weeks 1, 4 and 8 (week 1 Tuesday, then the long day of weeks 4 and 8). Logging a test with its time and, optionally, average heart rate updates the paces and heart-rate zones straight away, with an Undo in the toast. Heart rate is no longer on the main form.
- Signed-in users can also log average HR and how each session felt. The site then suggests pace changes, which the user applies with one tap (`public/js/hr.js`).
- Race less than 12 weeks away: the plan starts at the current week and the earlier weeks are left out; the first week shown includes a 5k test (except in the taper). Race more than 12 weeks away: a card says when the 12 weeks start and how to build a base until then.
- "Edit plan" changes the 5k time, goal, days or machines at any time. The plan id depends only on the race date, so ticks and logs are kept.
- Workout of the Day (signed in): 365 workouts from `public/data/wods.json`, each in a Solo and a Team of 2 version. See below.
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
| `public/js/wod.js` | Workout of the Day logic: which workout falls on a date, week strip dates, benchmark grouping. |
| `public/js/wodRender.js` | HTML for the WOD view. |
| `public/js/billing.js` | Feature gates (`FEATURES`, `canUse`), ready for paid plans. |
| `public/js/consent.js` | The cookie/storage consent bar (Law 25). Loaded on every page. |
| `public/privacy.html`, `public/terms.html` | Privacy Policy and Terms of Use, served at `/privacy` and `/terms`. |
| `public/data/wods.json` | The 365-workout library. Do not edit by hand; see `tools/wod/`. |
| `tools/wod/` | The WOD generator (`generate_wods.py`), the readable library (`wod-library.md`) and `rebrand.mjs`, which removes the race organiser's name from the generated text. Not deployed. |
| `firestore.rules` | Users can read and write only their own `users/{uid}/plans`, `settings` and `wodResults`, with field checks. Payment data (`customers`) is read-only for its owner. Everything else is denied. |
| `tests/plan.test.mjs` | Engine, WOD and gating tests. |

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

# Deploy the rules too whenever firestore.rules changes (the WOD settings and results need them).
```

The site goes live at https://hyrox-prog.web.app.

## Workout of the Day

- Day 1 is `START_DATE = '2026-11-02'` (a Monday) in `wod.js`. The workout for a date is `workouts[((days since start % 365) + 365) % 365]`, using the visitor's local date, so it changes at local midnight and repeats every 365 days.
- Weekly rotation: Mon strength endurance, Tue run intervals, Wed partner day, Thu engine, Fri for time / simulation (every 4th Friday is a Front Half or Back Half benchmark), Sat light aerobic, Sun optional recovery.
- Each workout opens in the version it was written for (`defaultMode`) until the user taps Solo / Team of 2. From then on their choice is used for every workout.
- To regenerate the library: `python tools/wod/generate_wods.py public/data/wods.json`, then `node tools/wod/rebrand.mjs`.

## Data model

`users/{uid}/plans/{planId}` holds `{ inputs, done, logs, createdAt, updatedAt }`. `logs` maps session keys to `{ hr, feel, fiveK? }`. Applied suggestions are stored in `inputs.paceAdjust` and `inputs.dismissed`. `planId` is `race-YYYY-MM-DD`. Only the inputs are stored, and the plan is rebuilt from them on load. `done` maps session keys like `w3-hyb` to `true`. The keys don't depend on weekdays, so changing training days keeps progress.

`users/{uid}/settings/prefs` holds `{ wodMode: 'solo' | 'team' }`. `users/{uid}/wodResults/{day}-{mode}` holds `{ day, mode, title, benchmark, date, score, partner?, weight?, notes? }`. Both are cached in browser storage per user.

## Turning on payments (Stripe)

Nothing is charged today; every feature in `FEATURES` (`public/js/billing.js`) is `'free'`, which means "any signed-in user". The site is wired for the official **Run Payments with Stripe** Firebase extension:

1. Install the extension (`firebase ext:install stripe/firestore-stripe-payments`) with customer data in `customers` and products in `products`. It needs the Blaze plan. The rules here already let owners read `customers/{uid}/**` and everyone read `products/**`; only the extension writes them.
2. Create your products and prices in Stripe; the extension copies them to `products`.
3. Set the paid features to `'pro'` in `FEATURES`. `cloud.watchTier()` already reports `'pro'` when the user has an `active` or `trialing` subscription, and `render()` and the WOD view check `canUse()`.
4. Add an Upgrade button that writes a `customers/{uid}/checkout_sessions` document (see the extension docs) and redirects to the returned URL. You will need to allow that `create` in `firestore.rules`.
5. Update the "Paid features" section of `terms.html` and the payments paragraph of `privacy.html`.

## Privacy and Law 25

- The consent bar (`consent.js`) shows until the visitor picks "Essential only" or "Accept"; the choice is stored in `hybrid:consent`. Only essential storage is used today. Check `hasConsent('optional')` before adding analytics, and list any new cookie in the table in `privacy.html`.
- Account → Download my data exports everything as JSON; Account → Delete my account deletes the Firestore data and the Auth user (it asks the user to sign in again if their sign-in is older than 5 minutes).
- Creating an account with email requires ticking the Terms/Privacy box; Google sign-in shows the same notice.
- The person in charge of personal information is reached at info@hybridprog.com. Add a name and mailing address to `privacy.html` when you have them.

## Before launch

- Check station weights in `DIVISIONS` (`public/js/plan.js`) against the current official race rulebook. Sources disagree on wall-ball reps and target heights, so the site doesn't state them.
- The station shares in the spec add up to 100.1%, so the station splits come to about 2 s more than the station total.

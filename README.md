# Hybrid Plan Builder

A one-page website that builds a personal 12-week training plan for hybrid fitness races (8 x 1 km runs + 8 stations) from a race date, goal time, division, age group, optional 5k time and chosen training days. Sessions come from the original 12-week plan document, with the athlete's own paces, station weights and dates filled in. A one-time $5 payment unlocks the full plan, and a $5/month subscription unlocks the Workout of the Day.

The site does not use any race organiser's name or branding (trademark). Internal identifiers such as the `hyrox-prog` Firebase project and the `hyrox:*` browser storage keys stay as they are so deploys and saved data keep working.

- No build step: plain HTML, CSS and ES modules in `public/`.
- Anyone can build a plan and see a preview: summary, projected finish, race splits, paces and the first week.
- Once a plan is built, the landing page (hero, photos, form) is hidden. The plan shows one week at a time, like the WOD page: a week header with arrows, a 7-day strip and the chosen day's card. The toolbar has the race-plan picker (signed in), Edit, New plan and Delete.
- The **12-week plan** (one-time $5, for good) unlocks every week and logging the 5k tests. Signing in (Google or email/password) saves plans to Firestore. The lock is a UI gate only, since the session content ships in the page's JS.
- Weekly layout (weeks 1-11): Mon Endurance, Tue Strength, Wed Active Recovery (about 45 min), Thu Hybrid (written like a Workout of the Day, about 40-45 min), Fri Skill + WOD, Sat Long Endurance / test / simulation, Sun rest. On 5-day plans the Wednesday recovery is dropped.
- Friday's Skill or Skill/Strength session ends with a short WOD (`WODS` in `sessions.js`), the only one in the week.
- Time fields add the ":" as you type (`maskTime` in `plan.js`), because phone number pads have no colon key: 130 becomes 1:30.
- 5k tests in weeks 1, 4 and 8 (week 1 Monday, then the long day of weeks 4 and 8). Logging a test (time and, optionally, average heart rate) is the only logging on the site. It updates the paces, heart-rate zones and projected finish straight away, with an Undo in the toast.
- Projected finish (`projectFinish` in `plan.js`): race-day km pace is about 5k pace x 1.17, and running is 50.3% of the finish, so finish = 8 x km pace / 0.503, rounded to the minute. It is shown against the goal time.
- Race less than 12 weeks away: the plan starts at the current week and the earlier weeks are left out; the first week shown includes a 5k test (except in the taper). Race more than 12 weeks away: a card says when the 12 weeks start and how to build a base until then.
- "Edit" changes the goal, days or machines at any time. The plan id depends only on the race date, so 5k test results are kept.
- Workout of the Day (**WOD** subscription, $5/month): 365 workouts from `public/data/wods.json`, each in a Solo and a Team of 2 version. Subscribers see the current week only, and nothing is logged. See below.
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
| `public/js/wod.js` | Workout of the Day logic: which workout falls on a date, the current week's dates. |
| `public/js/wodRender.js` | HTML for the WOD view. |
| `public/js/billing.js` | The two products (`PRODUCTS`: Stripe price and product ids) and the feature gates (`FEATURES`, `canUse`). |
| `public/js/consent.js` | The cookie/storage consent bar (Law 25). Loaded on every page. |
| `public/privacy.html`, `public/terms.html` | Privacy Policy and Terms of Use, served at `/privacy` and `/terms`. |
| `public/data/wods.json` | The 365-workout library. Do not edit by hand; see `tools/wod/`. |
| `tools/wod/` | The WOD generator (`generate_wods.py`), the readable library (`wod-library.md`) and `rebrand.mjs`, which removes the race organiser's name from the generated text. Not deployed. |
| `firestore.rules` | Users can read and write only their own `users/{uid}/plans` and `settings`, with field checks (old `wodResults` can only be read or deleted). Payment data (`customers/{uid}`) is read-only for its owner and written only by the functions. Everything else is denied. |
| `tests/plan.test.mjs` | Engine, WOD and gating tests. |

## Run locally

You need Node.js 18+, the Firebase CLI (`npm i -g firebase-tools`) and Java (for the emulators).

```sh
(cd functions && npm install)
firebase emulators:start --only hosting,auth,firestore,functions
```

Open http://127.0.0.1:5000. When the site is served on port 5000, it uses the local Auth, Firestore and Functions emulators, so nothing touches the real project. The emulator UI is at http://127.0.0.1:4000.

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
4. **Email (email verification and password resets):** sent by the Cloud Functions in `functions/` (`mail.js`) from `info@hybridprog.com` on Namecheap Private Email, never by Firebase itself. Set the mailbox once: `firebase functions:secrets:set SMTP_URL` with `smtps://info%40hybridprog.com:PASSWORD@mail.privateemail.com:465`. The sender is fixed in `mail.js` and must stay that same mailbox (SPF/DKIM/DMARC). For the emulator, put `SMTP_URL=...` in `functions/.secret.local`.
5. **Password reset email:** Authentication → Templates → Password reset. Firebase sends it, so nothing to deploy. Set the sender name and, if you like, a custom domain there.

## Deploy

```sh
firebase deploy --only hosting,firestore:rules,functions

# Deploy the rules too whenever firestore.rules changes (the WOD settings and results need them).
```

The site goes live at https://hyrox-prog.web.app.

## Workout of the Day

- Day 1 is `START_DATE = '2026-11-02'` (a Monday) in `wod.js`. The workout for a date is `workouts[((days since start % 365) + 365) % 365]`, using the visitor's local date, so it changes at local midnight and repeats every 365 days.
- Weekly rotation: Mon strength endurance, Tue run intervals, Wed partner day, Thu engine, Fri for time / simulation (every 4th Friday is a Front Half or Back Half benchmark), Sat light aerobic, Sun optional recovery.
- Only the current week (Monday to Sunday of today) is shown; `clampToWeek` keeps the chosen day inside it. Results are not logged.
- Each workout opens in the version it was written for (`defaultMode`) until the user taps Solo / Team of 2. From then on their choice is used for every workout.
- To regenerate the library: `python tools/wod/generate_wods.py public/data/wods.json`, then `node tools/wod/rebrand.mjs`.

## Data model

`users/{uid}/plans/{planId}` holds `{ inputs, done, logs, createdAt, updatedAt }`. `logs` maps 5k test session keys (`w1-end`, `w4-long`, `w8-long`) to `{ fiveK, hr? }`; a logged test also sets `inputs.fiveK`, `inputs.hr5k` and `inputs.fiveKFromTest`. `planId` is `race-YYYY-MM-DD`. Only the inputs are stored, and the plan is rebuilt from them on load. `done` (old session ticks) is no longer written but is kept so older documents stay valid; old `inputs.paceAdjust` values are still applied.

Email verification: a new email and password account gets a confirmation link from `info@hybridprog.com` (`sendVerifyEmail` in `functions/index.js`, at most 5 per hour per account). Until it is opened, `firestore.rules` (`emailConfirmed`) and the payment functions refuse that sign-in, and the site shows the "Confirm your email" step instead of signing in. Google sign-ins are already verified.

`users/{uid}/settings/prefs` holds `{ wodMode: 'solo' | 'team' }`, cached in browser storage per user. Old `users/{uid}/wodResults` documents are no longer written; account deletion still removes them.

## Payments (Stripe)

Two products: `plan` (all 12 weeks + 5k test logging), a one-time $5 payment that unlocks it for good, and `wod` (Workout of the Day), a $5/month subscription. Our own Cloud Functions in `functions/payments.js` talk to Stripe (no Firebase extension):

- `createCheckout` (callable) creates a Stripe Checkout session for the product, with the price id from `PRODUCTS` in that file, and returns its URL. Stripe sends the user back with `?paid=plan` or `?paid=wod`.
- `stripeWebhook` (HTTP) receives Stripe's events and sets `customers/{uid}.access.plan` / `.wod`. The plan turns on when its payment completes and off on a full refund; the WOD is on while the subscription is active or trialing.
- `billingPortal` (callable) opens the Stripe customer portal (Account > Manage subscription, shown only to WOD subscribers).

`cloud.watchSubs()` listens to `customers/{uid}` and `canUse()` gates the features on `access`. Only the functions write that document.

Setup:

1. In Stripe, create "12-week plan" with a $5 one-time price and "Workout of the Day" with a $5/month recurring price. Put the product and price ids in `functions/stripe-config.js` (sandbox and live; `STRIPE_MODE` picks which). Turn on the customer portal (Settings > Billing > Customer portal) so users can cancel.
2. `firebase functions:secrets:set STRIPE_SECRET_KEY` with the secret key (`sk_test_...` or `sk_live_...`, same mode as the price ids).
3. Deploy the functions. In Stripe, Developers > Webhooks > Add endpoint: `https://us-central1-hyrox-prog.cloudfunctions.net/stripeWebhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`.
4. Copy the endpoint's signing secret (`whsec_...`) into `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`, then deploy the functions again so they pick it up.
5. Add any new site domain to `ORIGINS` in `functions/payments.js`, or checkout refuses to send people back to it.

Founding-member codes: `PLAN50` (12-week plan) and `WOD50` (WOD, free forever) are 100% off for the first 50 redemptions each. Customers type them in the promotion code box that Checkout always shows. Create them once per Stripe mode with `STRIPE_SECRET_KEY=sk_... node scripts/createPromoCodes.js` (run from `functions/`; it skips what already exists). A free plan purchase completes with `payment_status: no_payment_required`, which the webhook accepts, and a free WOD subscription asks for no card.

## Privacy and Law 25

- The consent bar (`consent.js`) shows until the visitor picks "Essential only" or "Accept"; the choice is stored in `hybrid:consent`. Only essential storage is used today. Check `hasConsent('optional')` before adding analytics, and list any new cookie in the table in `privacy.html`.
- Access requests are answered by email (there is no download button). Account → Delete my account deletes the Firestore data and the Auth user (it asks the user to sign in again if their sign-in is older than 5 minutes). Stripe subscriptions are cancelled separately, in Manage subscription.
- Creating an account with email requires ticking the Terms/Privacy box; Google sign-in shows the same notice.
- The person in charge of personal information is reached at info@hybridprog.com. Add a name and mailing address to `privacy.html` when you have them.

## Before launch

- Check station weights in `DIVISIONS` (`public/js/plan.js`) against the current official race rulebook. Sources disagree on wall-ball reps and target heights, so the site doesn't state them.
- The station shares in the spec add up to 100.1%, so the station splits come to about 2 s more than the station total.

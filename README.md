# Hybrid Plan Builder

A two-page website for hybrid fitness races (8 x 1 km runs + 8 stations). The **12-week plan** page (`/`) builds a personal training plan from a race date, goal time, division, age group, optional 5k time and chosen training days. Sessions come from the original 12-week plan document, with the athlete's own paces, station weights and dates filled in. The **Workout of the Day** page (`/wod`) has a new workout every day. The plan is a one-time $5 payment, and the Workout of the Day is a $5/month subscription.

The site is built for the HYROX community and names HYROX so people find it on search engines and AI assistants: in the page titles, descriptions, keywords, Open Graph tags, structured data, `llms.txt`, the page eyebrows and headings and one FAQ answer per page. The name is used only to describe what the training is for. There is no HYROX logo, and every page footer (and the Terms) says Hybrid Plan Builder is independent and not affiliated with, sponsored or endorsed by HYROX. The workouts themselves stay generic (the tests check that the plan text and the WOD library don't name it). Internal identifiers such as the `hyrox-prog` Firebase project and the `hyrox:*` browser storage keys stay as they are so deploys and saved data keep working.

Google Analytics 4 (`G-P0GFWB3X3R`, `analytics.js`) loads only after a visitor clicks "Accept" in the consent bar (Quebec Law 25: tracking off by default); "Essential only" stops it and deletes its cookies. Moving between the two pages sends a `page_view` from `site.js`, so in GA4 turn off Enhanced measurement › Page views › "Page changes based on browser history events" to avoid counting those twice.

- No build step: plain HTML, CSS and ES modules in `public/`.
- Two real pages, each with its own title, description, canonical link and FAQ structured data: `index.html` (`/`) and `wod.html` (`/wod`). Old `/#wod` links are redirected to `/wod` by a line of script in `index.html`.
- Moving between the two pages doesn't reload: the header (and sign-in) stays, and `site.js` fetches the other page once, adds its `<div class="view">` to the document and starts its module, then swaps the views, the title and the head tags and updates the address bar (Back and Forward work). So everything a page shows goes inside its view, and ids must be unique across both pages.
- **No free preview.** Both pages look alike: a heading on a grey photo, then a buy card, and under it a light band of information (what you get, how it's built, photos, FAQ) for visitors and search engines. Signing in alone changes nothing; only buying does. Owners don't see the buy card or the information band.
- After buying the **12-week plan** (one-time $5, for good), the buy card becomes the plan form, then the plan: one week at a time, like the WOD page, with a week header with arrows, a 7-day strip and the chosen day's card. The toolbar has the race-plan picker, Edit, New plan and Delete. Plans are saved to Firestore. The lock is a UI gate only, since the session content ships in the page's JS.
- So owners don't see the buy card flash while sign-in loads, `hyrox:access` remembers what the user owned last time; until the purchases are known, the page shows "Loading…" instead. Back from Stripe (`?paid=plan|wod`), it shows "Unlocking…" until the webhook unlocks the purchase.
- Weekly layout (weeks 1-11): Mon Endurance, Tue Strength, Wed Active Recovery (about 45 min), Thu Hybrid (written like a Workout of the Day, about 40-45 min), Fri Skill + WOD, Sat Long Endurance / test / simulation, Sun rest. On 5-day plans the Wednesday recovery is dropped.
- Friday's Skill or Skill/Strength session ends with a short WOD (`WODS` in `sessions.js`), the only one in the week.
- Every timed round fits the athlete. Thursday Hybrid sessions have a `clock` in `sessions.js`; `clockValues` in `plan.js` times one round with the athlete's own paces and goal (`roundSeconds`) and lengthens the interval, the time on or the time cap until each round leaves at least a minute of rest (a fifth of the work for long rounds). Fewer rounds or sets keep the session about the same length. In Friday EMOMs, `{m:row:30s}` is the metres the athlete covers in 30 s (without the machine, a run of 30 s at their steady pace, rounded down to 50 m) and `{r:N}` cuts the reps for racers slower than 1:10, so every minute leaves rest.
- Simulations: mock races (runs + a row) in weeks 5, 7 and 10, a half simulation in week 6 (8 x 500 m runs + every station at half its race distance) and the full simulation in week 9.
- Time fields add the ":" as you type (`maskTime` in `plan.js`), because phone number pads have no colon key: 130 becomes 1:30.
- 5k tests in weeks 1, 4 and 8 (week 1 Monday, then the long day of weeks 4 and 8). Logging a test (time and, optionally, average heart rate) is the only logging on the site. It updates the paces, heart-rate zones and projected finish straight away, with an Undo in the toast.
- Race splits (`computeSplits` in `plan.js`) come from real results. `SPLIT_TABLE` has, per division and for four finish times (near the 1st, 10th, 50th and 90th percentile), the share of the finish spent running and in the Roxzone and each station's share of the station time; a goal between two rows is interpolated. The rows come from each division's all-seasons results on hyresult.com: the athletes at the goal's percentile of finish times, with the level effect scaled by 0.7, since fast finishers aren't equally fast at everything. They match the top 100 men and top 39 women at HYROX Ottawa 2026 within about a point per station (Ottawa's runs are a little longer and its Roxzone shorter than average). Fast racers spend a bigger share on the ergs; slower ones on burpees, lunges and wall balls and in the Roxzone.
- Projected finish (`projectFinish` in `plan.js`): race-day km pace is about 5k pace x 1.12 in singles and x 1.07 in doubles, and the finish is the time whose running share in `SPLIT_TABLE` matches 8 x that pace, rounded to the minute. It is shown against the goal time. The two factors are estimates, since race results have no 5k times: an hour or more of racing (half-marathon to marathon pace) on legs tired from the stations, less so in doubles, where partners share the stations. A 22:18 5k that ran 4:44/km in Ottawa Mixed Doubles fits the doubles factor.
- Signed in, the account's saved plans win over the copy on the device, since a plan may have been changed or deleted on another device. The device's copy is saved back only when one of its saves never landed (`markUnsaved` in `progress.js`). Saves run one at a time, and saving merges the 5k test logs with the account's (`mergeLogs` in `cloud.js`); an undone first result is kept as `null` on the device until the account's copy drops it.
- Race less than 12 weeks away: the plan starts at the current week and the earlier weeks are left out; the first week shown includes a 5k test (except in the taper). Race more than 12 weeks away: a card says when the 12 weeks start and how to build a base until then.
- "Edit" changes the goal, days or machines at any time. The plan id depends only on the race date, so 5k test results are kept.
- Workout of the Day (**WOD** subscription, $5/month): 365 workouts from `public/data/wods.json`, each in a Solo and a Team of 2 version. Subscribers see one week at a time (next week opens Sunday 6 pm), and nothing is logged. See below.
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
| `public/js/site.js` | What both pages share: the account menu, the sign-in dialog (Sign in, Create account, Forgot password, Confirm your email, Terms for new Google accounts), buying, the toast, and moving between the pages. Page modules call `startSite({ page, onUser, onAccess, onShow })`; `accessStatus(product)` says whether to show the buy card, a waiting card or the tool. |
| `public/js/app.js` | The plan page: form, week view, 5k test logs, the account's plans. |
| `public/js/wodPage.js` | The WOD page. |
| `public/auth-action.html`, `public/js/authAction.js` | The page our email links open (`/auth-action`): confirms an email address, or sets a new password and signs the user in. |
| `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` | For search engines and AI assistants. Add new pages to the sitemap (and update `lastmod` when a page changes) and to `llms.txt`. |
| `public/js/cloud.js` | Firebase Auth and Firestore. |
| `public/js/firebase-config.js` | **The only place the Firebase config lives.** |
| `public/js/wod.js` | Workout of the Day logic: which workout falls on a date, the current week's dates. |
| `public/js/wodRender.js` | HTML for the WOD view. |
| `public/js/billing.js` | The two products (`PRODUCTS`: Stripe price and product ids) and the feature gates (`FEATURES`, `canUse`). |
| `public/js/consent.js` | The cookie/storage consent bar (Law 25). Loaded on every page. |
| `public/js/analytics.js` | Google Analytics 4, started only after the visitor accepts optional cookies (`consentchange` event from `consent.js`). Loaded on every page except `/auth-action`. |
| `public/privacy.html`, `public/terms.html`, `public/js/legal.js` | Privacy Policy and Terms of Use, served at `/privacy` and `/terms`, written for users in any country. Their ✕ (`legal.js`) goes back to the page the reader came from, or closes the tab the sign-in window opened. |
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
4. **Email (email verification and password resets):** sent by the Cloud Functions in `functions/` (`mail.js`) from `info@hybridprog.com` on Namecheap Private Email, never by Firebase itself. Set the mailbox once: `firebase functions:secrets:set SMTP_URL` with `smtps://info%40hybridprog.com:PASSWORD@mail.privateemail.com:465`. The sender is fixed in `mail.js` and must stay that same mailbox (SPF/DKIM/DMARC). For the emulator, put `SMTP_URL=...` in `functions/.secret.local`; without it, the emulator only logs the email and its link.
5. **Email links:** the functions make the links point to our own page, `https://hybridprog.com/auth-action` (`actionLink` in `functions/index.js`), not Firebase's. Optional: also set Authentication → Templates → (pencil) → Customize action URL to `https://hybridprog.com/auth-action`, so any email Firebase itself might send uses it too.

## Deploy

```sh
firebase deploy --only hosting,firestore:rules,functions

# Deploy the rules too whenever firestore.rules changes (the WOD settings and results need them).
```

The site goes live at https://hyrox-prog.web.app.

## Workout of the Day

- Day 1 is `START_DATE = '2026-11-02'` (a Monday) in `wod.js`. The workout for a date is `workouts[((days since start % 365) + 365) % 365]`, using the visitor's local date, so it changes at local midnight and repeats every 365 days.
- Weekly rotation: Mon strength endurance, Tue run intervals, Wed partner day, Thu engine, Fri for time / simulation (every 4th Friday is a Front Half or Back Half benchmark), Sat light aerobic, Sun optional recovery.
- Only one week (Monday to Sunday) is shown: the current one, and from Sunday 6 pm local time (`RELEASE_HOUR`) the next one (`wodWeekAnchor`). `clampToWeek` keeps the chosen day inside it. Results are not logged. The site markets this as weekly workouts opening Sunday evening; do not mention the 365-day library on the page.
- Wall balls in pounds use the official weights (4/6/9 kg = 9/14/20 lb, `wallBallWt` and `textToUnits` in `plan.js`), not a straight conversion.
- Each workout opens in the version it was written for (`defaultMode`) until the user taps Solo / Team of 2. From then on their choice is used for every workout.
- Every fixed interval (EMOM, every n min, n min on, the strength part of Strength + AMRAP) leaves at least a fifth of it to rest, in the solo and the team version (`REST_SHARE` and `fit_window` in the generator), so an athlete about 25% slower than the generator's estimates still finishes inside it. Work is trimmed to fit; a sled already down to one 12.5 m length gets a lighter load. The generator stops without writing if an interval still doesn't fit.
- To regenerate the library: `python tools/wod/generate_wods.py public/data/wods.json`, then `node tools/wod/rebrand.mjs`. The generator doesn't write `wod-library.md`; update it to match.

## Data model

`users/{uid}/plans/{planId}` holds `{ inputs, done, logs, createdAt, updatedAt }`. `logs` maps 5k test session keys (`w1-end`, `w4-long`, `w8-long`) to `{ fiveK, hr? }`; a logged test also sets `inputs.fiveK`, `inputs.hr5k` and `inputs.fiveKFromTest`. `planId` is `race-YYYY-MM-DD`. Only the inputs are stored, and the plan is rebuilt from them on load. `done` (old session ticks) is no longer written but is kept so older documents stay valid; old `inputs.paceAdjust` values are still applied.

Email verification: a new email and password account gets a confirmation link from `info@hybridprog.com` (`sendVerifyEmail` in `functions/index.js`, at most 5 per hour per account). The link opens `/auth-action`, which confirms the address and leads back to the page the user signed up on. Until it is opened, `firestore.rules` (`emailConfirmed`) and the payment functions refuse that sign-in, and the site shows the "Confirm your email" step instead of signing in. That step checks every few seconds, so it finishes by itself once the link is opened (on a phone too), then goes on to the purchase that was waiting. Google sign-ins are already verified.

Password reset: "Forgot password?" in the dialog emails a link (`sendPasswordReset`); `/auth-action` asks for the new password, saves it and signs the user in.

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

## Privacy

- The consent bar (`consent.js`) shows until the visitor picks "Essential only" or "Accept"; the choice is stored in `hybrid:consent`. Only essential storage is used today. Check `hasConsent('optional')` before adding analytics, and list any new cookie in the table in `privacy.html`.
- Access requests are answered by email (there is no download button). Account → Delete my account deletes the Firestore data and the Auth user (it asks the user to sign in again if their sign-in is older than 5 minutes). Stripe subscriptions are cancelled separately, in Manage subscription.
- Creating an account (email or Google) requires ticking the Terms/Privacy box; signing in shows no Terms. A brand-new Google account made from Sign in gets a one-step "agree to the Terms" screen, and closing it deletes that account again.
- The person in charge of personal information is reached at info@hybridprog.com. Add a name and mailing address to `privacy.html` when you have them.

## Before launch

- Check station weights in `DIVISIONS` (`public/js/plan.js`) against the current official race rulebook. Sources disagree on wall-ball reps and target heights, so the site doesn't state them.
- The station shares in the spec add up to 100.1%, so the station splits come to about 2 s more than the station total.

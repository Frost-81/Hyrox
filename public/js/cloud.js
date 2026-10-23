// Firebase Auth + Firestore. Loaded lazily so the planner works even if Firebase can't load.
import { firebaseConfig, FIREBASE_SDK, FUNCTIONS_REGION } from './firebase-config.js';

let fb = null; // { app, auth, db, a: authModule, f: firestoreModule }

async function load() {
  if (fb) return fb;
  const [{ initializeApp }, a, f] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = a.getAuth(app);
  const db = f.getFirestore(app);
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (local && location.port === '5000') {
    // Served by the Hosting emulator (firebase emulators:start): use the Auth and Firestore emulators too.
    try {
      a.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      f.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    } catch { /* already connected */ }
  }
  fb = { app, auth, db, a, f, local: local && location.port === '5000' };
  return fb;
}

/** One of our callable Cloud Functions (functions/). */
async function callable(name) {
  const c = await load();
  const fn = await import(`${FIREBASE_SDK}/firebase-functions.js`);
  const functions = fn.getFunctions(c.app, FUNCTIONS_REGION);
  if (c.local) {
    try { fn.connectFunctionsEmulator(functions, '127.0.0.1', 5001); } catch { /* already connected */ }
  }
  return fn.httpsCallable(functions, name);
}

/** Calls onUser(user | null) whenever sign-in state changes. Returns false if Firebase is unavailable. */
export async function watchUser(onUser) {
  try {
    const { auth, a } = await load();
    a.onAuthStateChanged(auth, onUser);
    return true;
  } catch (err) {
    console.warn('Firebase unavailable:', err);
    return false;
  }
}

export async function signInGoogle() {
  const { auth, a } = await load();
  return a.signInWithPopup(auth, new a.GoogleAuthProvider());
}

export async function signInEmail(email, password, create) {
  const { auth, a } = await load();
  return create
    ? a.createUserWithEmailAndPassword(auth, email, password)
    : a.signInWithEmailAndPassword(auth, email, password);
}

/** Emails a link to choose a new password. Firebase sends it, so nothing reveals whether the account exists. */
export async function sendPasswordReset(email) {
  const { auth, a } = await load();
  return a.sendPasswordResetEmail(auth, email);
}

// ---------- email sign-in codes (functions/index.js) ----------

/**
 * { available, enrolled, needed }: whether this sign-in can use email codes (it used a password),
 * whether they are turned on, and whether this sign-in still has to enter one.
 */
export async function mfaInfo(user) {
  const { claims } = await user.getIdTokenResult();
  const available = claims.firebase?.sign_in_provider === 'password';
  const enrolled = claims.mfaEmail === true;
  return { available, enrolled, needed: available && enrolled && !(claims.mfa || []).includes(claims.auth_time) };
}

/** Emails a 6-digit code. Returns the address it went to. */
export async function sendMfaCode() {
  const { data } = await (await callable('sendMfaCode'))();
  return data.email;
}

/** Checks the code (turning codes on if enroll), then refreshes the token so Firestore sees it. */
export async function verifyMfaCode(user, code, enroll = false) {
  await (await callable('verifyMfaCode'))({ code, enroll });
  await user.getIdToken(true);
}

export async function disableMfa(user) {
  await (await callable('disableMfa'))();
  await user.getIdToken(true);
}

export async function signOutUser() {
  const { auth, a } = await load();
  return a.signOut(auth);
}

const planRef = ({ db, f }, uid, planId) => f.doc(db, 'users', uid, 'plans', planId);

/** Save inputs and merge the 5k test logs into the cloud copy. Returns the merged logs. */
export async function savePlan(uid, planId, inputs, logs = {}) {
  const c = await load();
  const ref = planRef(c, uid, planId);
  const snap = await c.f.getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;
  const mergedLogs = { ...(existing?.logs || {}), ...logs };
  await c.f.setDoc(ref, {
    inputs,
    done: existing?.done || {}, // ticks are no longer used; kept so older plans stay valid
    logs: mergedLogs,
    createdAt: existing?.createdAt || c.f.serverTimestamp(),
    updatedAt: c.f.serverTimestamp(),
  });
  return mergedLogs;
}

export async function deletePlan(uid, planId) {
  const c = await load();
  await c.f.deleteDoc(planRef(c, uid, planId));
}

/** All of the user's plans, newest first. */
export async function listPlans(uid) {
  const c = await load();
  const snap = await c.f.getDocs(c.f.collection(c.db, 'users', uid, 'plans'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((x, y) => (y.updatedAt?.toMillis?.() || 0) - (x.updatedAt?.toMillis?.() || 0));
}

// ---------- Workout of the Day ----------

const prefsRef = ({ db, f }, uid) => f.doc(db, 'users', uid, 'settings', 'prefs');

/** { wodMode } or {} */
export async function getSettings(uid) {
  const c = await load();
  const snap = await c.f.getDoc(prefsRef(c, uid));
  return snap.exists() ? snap.data() : {};
}

export async function saveWodMode(uid, wodMode) {
  const c = await load();
  await c.f.setDoc(prefsRef(c, uid), { wodMode, updatedAt: c.f.serverTimestamp() }, { merge: true });
}

// ---------- payments (functions/payments.js) ----------

/**
 * Calls onSubs(Set of 'plan' | 'wod') whenever what the user has paid for changes. The Stripe webhook keeps
 * customers/{uid}.access up to date ({ plan: true, wod: false, ... }). Returns an unsubscribe function.
 */
export async function watchSubs(uid, onSubs) {
  try {
    const c = await load();
    return c.f.onSnapshot(
      c.f.doc(c.db, 'customers', uid),
      (snap) => onSubs(new Set(Object.entries(snap.get('access') || {}).filter(([, on]) => on === true).map(([k]) => k))),
      () => onSubs(new Set()),
    );
  } catch {
    onSubs(new Set());
    return () => {};
  }
}

/** Go to Stripe Checkout for 'plan' or 'wod'. It comes back here with ?paid=<product>. */
export async function startCheckout(product) {
  const call = await callable('createCheckout');
  const { data } = await call({ product, returnUrl: `${location.origin}${location.pathname}${location.hash}` });
  location.assign(data.url);
}

/** Open the Stripe customer portal, where the user can change or cancel a subscription. */
export async function openBillingPortal() {
  const call = await callable('billingPortal');
  const { data } = await call({ returnUrl: `${location.origin}${location.pathname}${location.hash}` });
  location.assign(data.url);
}

// ---------- privacy rights (Loi 25: deletion) ----------

/**
 * Deletes the user's Firestore data, then the account itself.
 * Throws { code: 'auth/requires-recent-login' } if the user must sign in again first;
 * nothing is deleted in that case.
 */
export async function deleteMyAccount(user) {
  const c = await load();
  // Fail early if a fresh sign-in is needed, before any data is removed.
  const signedInAt = Date.parse(user.metadata?.lastSignInTime || 0);
  if (!signedInAt || Date.now() - signedInAt > 5 * 60 * 1000) {
    throw Object.assign(new Error('Sign in again to delete your account.'), { code: 'auth/requires-recent-login' });
  }
  for (const name of ['plans', 'settings', 'wodResults']) {
    const snap = await c.f.getDocs(c.f.collection(c.db, 'users', user.uid, name));
    await Promise.all(snap.docs.map((d) => c.f.deleteDoc(d.ref)));
  }
  await c.a.deleteUser(user);
}

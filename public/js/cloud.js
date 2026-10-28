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

/** { user, isNew }: isNew when this sign-in just created the account. */
export async function signInGoogle() {
  const { auth, a } = await load();
  const cred = await a.signInWithPopup(auth, new a.GoogleAuthProvider());
  return { user: cred.user, isNew: !!a.getAdditionalUserInfo(cred)?.isNewUser };
}

/** Removes an account created moments ago, e.g. when the Terms were not accepted. */
export async function deleteNewUser(user) {
  const { a } = await load();
  await a.deleteUser(user);
}

export async function signInEmail(email, password, create) {
  const { auth, a } = await load();
  return create
    ? a.createUserWithEmailAndPassword(auth, email, password)
    : a.signInWithEmailAndPassword(auth, email, password);
}

/**
 * Emails a link to choose a new password, from info@hybridprog.com (functions/index.js).
 * It succeeds the same way whether or not the account exists.
 */
export async function sendPasswordReset(email) {
  await (await callable('sendPasswordReset'))({ email });
}

// ---------- email verification (functions/index.js) ----------

/** True when this is an email and password account that hasn't confirmed its address yet. */
export const needsVerify = (user) =>
  !!user && !user.emailVerified && user.providerData.some((p) => p.providerId === 'password');

/** Emails a link that confirms the address; next is the page to go on to ('/' or '/wod'). Returns the address. */
export async function sendVerifyEmail(next = '/') {
  const { data } = await (await callable('sendVerifyEmail'))({ next });
  return data.email;
}

/** Re-reads the account after the link was opened elsewhere. True once the email is confirmed. */
export async function checkVerified(user) {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true); // so Firestore sees email_verified
  return true;
}

// ---------- links in our emails (public/auth-action.html) ----------

/** The user signed in on this browser, once Firebase has restored the session, or null. */
export async function currentUser() {
  const { auth } = await load();
  await auth.authStateReady();
  return auth.currentUser;
}

/** The email address an email link is for (throws if the link expired or was already used). */
export async function actionCodeEmail(code) {
  const { auth, a } = await load();
  return (await a.checkActionCode(auth, code)).data.email;
}

/** Confirms the email address of the account the link was sent to. */
export async function applyEmailCode(code) {
  const { auth, a } = await load();
  await a.applyActionCode(auth, code);
}

/** The email address a password reset link is for (throws if the link expired or was used). */
export async function resetCodeEmail(code) {
  const { auth, a } = await load();
  return a.verifyPasswordResetCode(auth, code);
}

export async function setNewPassword(code, password) {
  const { auth, a } = await load();
  await a.confirmPasswordReset(auth, code, password);
}

export async function signOutUser() {
  const { auth, a } = await load();
  return a.signOut(auth);
}

const planRef = ({ db, f }, uid, planId) => f.doc(db, 'users', uid, 'plans', planId);

/** The account's 5k test logs with this device's on top; a log set to null (an undone test) is removed. */
export const mergeLogs = (saved, local) =>
  Object.fromEntries(Object.entries({ ...saved, ...local }).filter(([, v]) => v !== null));

/** Save inputs and merge the 5k test logs into the cloud copy (mergeLogs). Returns the merged logs. */
export async function savePlan(uid, planId, inputs, logs = {}) {
  const c = await load();
  const ref = planRef(c, uid, planId);
  const snap = await c.f.getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;
  const mergedLogs = mergeLogs(existing?.logs || {}, logs);
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

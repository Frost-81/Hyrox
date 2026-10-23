// Firebase Auth + Firestore. Loaded lazily so the planner works even if Firebase can't load.
import { firebaseConfig, FIREBASE_SDK, FUNCTIONS_REGION } from './firebase-config.js';
import { productKeyFor } from './billing.js';

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
  fb = { app, auth, db, a, f };
  return fb;
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

// ---------- payments ("Run Payments with Stripe" extension) ----------

/**
 * Calls onSubs(Set of 'plan' | 'wod') whenever the user's active subscriptions change.
 * The extension writes customers/{uid}/subscriptions with a `product` reference. Returns an unsubscribe function.
 */
export async function watchSubs(uid, onSubs) {
  try {
    const c = await load();
    const q = c.f.query(c.f.collection(c.db, 'customers', uid, 'subscriptions'), c.f.where('status', 'in', ['active', 'trialing']));
    return c.f.onSnapshot(
      q,
      (snap) => onSubs(new Set(snap.docs.map((d) => productKeyFor(d.data().product?.id)).filter(Boolean))),
      () => onSubs(new Set()),
    );
  } catch {
    onSubs(new Set());
    return () => {};
  }
}

/** Start a Stripe Checkout for a monthly subscription and go to it. */
export async function startCheckout(uid, priceId, product) {
  const c = await load();
  const back = `${location.origin}${location.pathname}`;
  const ref = await c.f.addDoc(c.f.collection(c.db, 'customers', uid, 'checkout_sessions'), {
    price: priceId,
    mode: 'subscription',
    success_url: `${back}?paid=${product}${location.hash}`,
    cancel_url: `${back}${location.hash}`,
  });
  await new Promise((resolve, reject) => {
    const stop = c.f.onSnapshot(ref, (snap) => {
      const { url, error } = snap.data() || {};
      if (error) { stop(); reject(new Error(error.message)); }
      if (url) { stop(); location.assign(url); resolve(); }
    }, reject);
  });
}

/** Open the Stripe customer portal, where the user can change or cancel a subscription. */
export async function openBillingPortal() {
  const c = await load();
  const fn = await import(`${FIREBASE_SDK}/firebase-functions.js`);
  const call = fn.httpsCallable(fn.getFunctions(c.app, FUNCTIONS_REGION), 'ext-firestore-stripe-payments-createPortalLink');
  const { data } = await call({ returnUrl: location.href });
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

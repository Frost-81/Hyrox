// Firebase Auth + Firestore. Loaded lazily so the planner works even if Firebase can't load.
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

let fb = null; // { auth, db, a: authModule, f: firestoreModule }

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
  fb = { auth, db, a, f };
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

/** Save inputs and merge ticks and logs into the cloud copy. Returns the merged { done, logs }. */
export async function savePlan(uid, planId, inputs, done, logs = {}) {
  const c = await load();
  const ref = planRef(c, uid, planId);
  const snap = await c.f.getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;
  const merged = { ...(existing?.done || {}) };
  for (const [k, v] of Object.entries(done || {})) if (v) merged[k] = true;
  const mergedLogs = { ...(existing?.logs || {}), ...logs };
  await c.f.setDoc(ref, {
    inputs,
    done: merged,
    logs: mergedLogs,
    createdAt: existing?.createdAt || c.f.serverTimestamp(),
    updatedAt: c.f.serverTimestamp(),
  });
  return { done: merged, logs: mergedLogs };
}

/** All of the user's plans, newest first. */
export async function listPlans(uid) {
  const c = await load();
  const snap = await c.f.getDocs(c.f.collection(c.db, 'users', uid, 'plans'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((x, y) => (y.updatedAt?.toMillis?.() || 0) - (x.updatedAt?.toMillis?.() || 0));
}

let pending = null;
/** Debounced write of ticks and logs after a change. */
export function queueProgress(uid, planId, done, logs) {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    try {
      const c = await load();
      await c.f.updateDoc(planRef(c, uid, planId), { done, logs, updatedAt: c.f.serverTimestamp() });
    } catch (err) {
      console.warn('Could not sync progress:', err);
    }
  }, 800);
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

const resultsCol = ({ db, f }, uid) => f.collection(db, 'users', uid, 'wodResults');

/** All WOD results keyed by id ("{day}-{mode}"). */
export async function listWodResults(uid) {
  const c = await load();
  const snap = await c.f.getDocs(resultsCol(c, uid));
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}

export async function saveWodResult(uid, id, result) {
  const c = await load();
  await c.f.setDoc(c.f.doc(resultsCol(c, uid), id), { ...result, updatedAt: c.f.serverTimestamp() });
}

// ---------- usernames and leaderboard ----------

const profileRef = ({ db, f }, uid) => f.doc(db, 'profiles', uid);
const usernameRef = ({ db, f }, key) => f.doc(db, 'usernames', key);

/** { username, usernameKey } or null. */
export async function getProfile(uid) {
  const c = await load();
  const snap = await c.f.getDoc(profileRef(c, uid));
  return snap.exists() ? snap.data() : null;
}

/** True if nobody has the username (case-insensitive key). */
export async function isUsernameFree(key) {
  const c = await load();
  return !(await c.f.getDoc(usernameRef(c, key))).exists();
}

/**
 * Claim a username: usernames/{key} (the uniqueness lock) and profiles/{uid} are written together.
 * The security rules refuse the write if the key is already taken, so two people can never share it.
 */
export async function claimUsername(uid, name, key) {
  const c = await load();
  const batch = c.f.writeBatch(c.db);
  batch.set(usernameRef(c, key), { uid, createdAt: c.f.serverTimestamp() });
  batch.set(profileRef(c, uid), { username: name, usernameKey: key, createdAt: c.f.serverTimestamp() });
  try {
    await batch.commit();
  } catch (err) {
    if (err.code === 'permission-denied') throw Object.assign(new Error('taken'), { code: 'username-taken' });
    throw err;
  }
  return { username: name, usernameKey: key };
}

const entryRef = ({ db, f }, board, uid) => f.doc(db, 'leaderboards', board, 'entries', uid);
const entriesCol = ({ db, f }, board) => f.collection(db, 'leaderboards', board, 'entries');

/** Post (or replace) the user's score on a board. */
export async function postScore(uid, board, entry) {
  const c = await load();
  await c.f.setDoc(entryRef(c, board, uid), { ...entry, updatedAt: c.f.serverTimestamp() });
}

export async function removeScore(uid, board) {
  const c = await load();
  await c.f.deleteDoc(entryRef(c, board, uid));
}

/**
 * Top entries of a board, best first, plus the user's own entry and rank (even outside the top).
 * better: 'lower' (times) or 'higher' (reps, calories, metres).
 */
export async function getLeaderboard(board, better, uid, max = 50) {
  const c = await load();
  const dir = better === 'lower' ? 'asc' : 'desc';
  const [top, mineSnap] = await Promise.all([
    c.f.getDocs(c.f.query(entriesCol(c, board), c.f.orderBy('value', dir), c.f.limit(max))),
    uid ? c.f.getDoc(entryRef(c, board, uid)) : null,
  ]);
  const entries = top.docs.map((d) => ({ uid: d.id, ...d.data() }));
  let mine = null;
  if (mineSnap?.exists()) {
    const data = mineSnap.data();
    const ahead = await c.f.getCountFromServer(c.f.query(entriesCol(c, board), c.f.where('value', better === 'lower' ? '<' : '>', data.value)));
    mine = { uid, ...data, rank: ahead.data().count + 1 };
  }
  const total = (await c.f.getCountFromServer(entriesCol(c, board))).data().count;
  return { entries, mine, total };
}

// ---------- payments (ready for the "Run Payments with Stripe" extension) ----------

/**
 * Calls onTier('pro' | 'free') when the user's subscription changes.
 * The extension writes customers/{uid}/subscriptions; until it is installed this stays 'free'.
 * Returns an unsubscribe function.
 */
export async function watchTier(uid, onTier) {
  try {
    const c = await load();
    const q = c.f.query(c.f.collection(c.db, 'customers', uid, 'subscriptions'), c.f.where('status', 'in', ['active', 'trialing']));
    return c.f.onSnapshot(q, (snap) => onTier(snap.empty ? 'free' : 'pro'), () => onTier('free'));
  } catch {
    onTier('free');
    return () => {};
  }
}

// ---------- privacy rights (Loi 25: access, portability, deletion) ----------

/** Everything we store about the user, as plain JSON. */
export async function exportMyData(user) {
  const c = await load();
  const all = async (name) => (await c.f.getDocs(c.f.collection(c.db, 'users', user.uid, name))).docs
    .map((d) => ({ id: d.id, ...d.data() }));
  return {
    exportedAt: new Date().toISOString(),
    account: { uid: user.uid, email: user.email || null, providers: (user.providerData || []).map((p) => p.providerId) },
    profile: (await c.f.getDoc(profileRef(c, user.uid))).data() || null,
    plans: await all('plans'),
    settings: await all('settings'),
    wodResults: await all('wodResults'),
  };
}

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
  // Leaderboard entries first (found through the user's own results), then the username.
  const results = await c.f.getDocs(c.f.collection(c.db, 'users', user.uid, 'wodResults'));
  await Promise.all(results.docs.map((d) => d.data()).filter((r) => r.shared && r.date && r.mode)
    .map((r) => c.f.deleteDoc(entryRef(c, `${r.date}-${r.mode}`, user.uid)).catch(() => {})));
  const profile = (await c.f.getDoc(profileRef(c, user.uid))).data();
  if (profile) {
    await c.f.deleteDoc(profileRef(c, user.uid));
    await c.f.deleteDoc(usernameRef(c, profile.usernameKey));
  }
  for (const name of ['plans', 'settings', 'wodResults']) {
    const snap = await c.f.getDocs(c.f.collection(c.db, 'users', user.uid, name));
    await Promise.all(snap.docs.map((d) => c.f.deleteDoc(d.ref)));
  }
  await c.a.deleteUser(user);
}

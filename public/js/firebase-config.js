// The only place the Firebase config lives. These values are public by design;
// access is controlled by firestore.rules, not by keeping this secret.
export const firebaseConfig = {
  apiKey: 'AIzaSyDgQ4C35H9_6ivOGACtN-YifsVT5UsnOb8',
  authDomain: 'hyrox-prog.firebaseapp.com',
  projectId: 'hyrox-prog',
  storageBucket: 'hyrox-prog.firebasestorage.app',
  messagingSenderId: '861943670457',
  appId: '1:861943670457:web:279f7c1b03be24873b9d68',
};

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.10.0';

// Region of our Cloud Functions (functions/: email codes and Stripe payments).
export const FUNCTIONS_REGION = 'us-central1';

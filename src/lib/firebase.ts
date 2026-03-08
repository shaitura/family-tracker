import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ─── הכנס כאן את ה-config שקיבלת מ-Firebase Console ─────────────────────────
// Firebase Console → Project settings → Your apps → Web app → firebaseConfig
const firebaseConfig = {
  apiKey:            'AIzaSyChNRltCmX4-gHUZNcQslR8IAnYQqHtgZ0',
  authDomain:        'family-tracker-dfccd.firebaseapp.com',
  projectId:         'family-tracker-dfccd',
  storageBucket:     'family-tracker-dfccd.firebasestorage.app',
  messagingSenderId: '79082333004',
  appId:             '1:79082333004:web:cc30677d6e5baf992f25e9',
};
// ─────────────────────────────────────────────────────────────────────────────

export const app      = initializeApp(firebaseConfig);
export const db       = getFirestore(app);
export const auth     = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

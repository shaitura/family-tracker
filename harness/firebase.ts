// Harness replacement for @/lib/firebase: the real module reads VITE_FIREBASE_*
// from an .env this checkout does not have, and getAuth() throws on an empty
// key at import time. A well-formed dummy config lets the pages import it; the
// harness never talks to Firebase (data comes from the seeded hook).
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

export const app = initializeApp({ apiKey: 'harness-dummy-key', projectId: 'harness', appId: '1:0:web:0' });
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

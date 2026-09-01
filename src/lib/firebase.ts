import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import {
  type CollectionReference,
  type Firestore,
  collection,
  doc,
  getFirestore,
} from 'firebase/firestore';

/**
 * Firebase wiring for the live `teamcheck-6ea23` project.
 *
 * The configuration comes from environment variables so no project identifiers
 * are committed. Copy `.env.example` to `.env` and fill it from the Firebase
 * console. These are client-side keys — the actual access control lives in
 * `firestore.rules`.
 */

function required(name: string): string {
  const v = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill in the Firebase configuration.`,
    );
  }
  return v;
}

const firebaseConfig = {
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: required('VITE_FIREBASE_APP_ID'),
};

/**
 * Every collection is nested under one fixed document path:
 *   artifacts/{APP_ID}/public/data/{collectionName}
 * Reading a top-level `/reports` collection returns nothing.
 */
export const APP_ID = required('VITE_APP_ID');
export const TEAM = (import.meta.env.VITE_TEAM as string) || 'צוות טיוב';

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);

export function col(name: string): CollectionReference {
  return collection(db, 'artifacts', APP_ID, 'public', 'data', name);
}

export function docRef(name: string, id: string) {
  return doc(db, 'artifacts', APP_ID, 'public', 'data', name, id);
}

/**
 * Firestore rejects document ids containing path characters (and ids matching
 * `__.*__`). The legacy app sanitises composite keys with this exact rule —
 * keep it identical so both apps address the same documents.
 */
export function keySanitize(s: string): string {
  return String(s).replace(/[/.\s#$[\]]/g, '_');
}

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}

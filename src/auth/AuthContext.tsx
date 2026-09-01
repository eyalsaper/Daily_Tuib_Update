import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import { getDocs } from 'firebase/firestore';
import { auth, col } from '@/lib/firebase';
import { employeeFromLegacy, type LegacyUser } from '@/data/adapters';
import type { Employee } from '@/types/models';
import { sha256Hex } from './hash';

/**
 * Authentication behind one interface with two implementations.
 *
 * `legacy`   — signs in against the `users` collection with the client-side
 *              SHA-256 hash the previous app wrote. It works against the live
 *              data today, but it cannot be secured: any client can read the
 *              collection. Use it only until the accounts below exist.
 * `firebase` — Firebase Authentication (email/password). Profile documents are
 *              linked by their `authUid` field; `scripts/migrate-auth.mjs`
 *              creates the accounts and writes that link.
 *
 * Switch with VITE_AUTH_MODE in `.env`.
 */

export type AuthMode = 'legacy' | 'firebase';

export const AUTH_MODE: AuthMode =
  (import.meta.env.VITE_AUTH_MODE as AuthMode) === 'firebase' ? 'firebase' : 'legacy';

export interface AuthState {
  mode: AuthMode;
  /** Signed-in profile, or null. */
  user: Employee | null;
  /** Every profile in the team — the login screen lists them. */
  users: Employee[];
  loading: boolean;
  error: string | null;
  /** identity is a user id in legacy mode, an email address in firebase mode. */
  signIn: (identity: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const LEGACY_SESSION_KEY = 'midrag_daily_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [users, setUsers] = useState<Employee[]>([]);
  const [raw, setRaw] = useState<Record<string, LegacyUser>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The user list is public in both modes: the login screen shows who is on the
  // team. Passwords are never exposed to the UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(col('users'));
        if (cancelled) return;
        const map: Record<string, LegacyUser> = {};
        const list: Employee[] = [];
        snap.forEach((d) => {
          const data = d.data() as LegacyUser;
          const emp = employeeFromLegacy(d.id, data);
          map[emp.id] = { ...data, id: emp.id };
          list.push(emp);
        });
        setRaw(map);
        setUsers(list);
      } catch (e) {
        // Under the tightened rules the roster is readable only once signed in,
        // so in firebase mode a failure here is expected before sign-in: the
        // email/password form does not need the list.
        if (!cancelled && AUTH_MODE === 'legacy') setError(readableError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore a legacy session; Firebase mode restores through onAuthStateChanged.
  useEffect(() => {
    if (AUTH_MODE !== 'legacy' || !users.length) return;
    const id = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (id) {
      const found = users.find((u) => u.id === id);
      if (found) setUser(found);
    }
  }, [users]);

  useEffect(() => {
    if (AUTH_MODE !== 'firebase') return;
    return onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      const match =
        users.find((u) => u.authUid === fbUser.uid) ||
        users.find((u) => !!fbUser.email && u.email === fbUser.email);
      if (match) setUser(match);
      else setError('החשבון קיים אך אין לו פרופיל עובד במערכת. פנה/י למנהל הצוות.');
    });
  }, [users]);

  const signIn = useCallback(
    async (identity: string, password: string): Promise<boolean> => {
      setError(null);
      try {
        if (AUTH_MODE === 'firebase') {
          await signInWithEmailAndPassword(auth, identity, password);
          return true;
        }
        const record = raw[identity];
        if (!record) {
          setError('לא נמצא משתמש.');
          return false;
        }
        const hashed = await sha256Hex(password);
        // Passwords created before the legacy app started hashing are plaintext.
        if (record.pass !== hashed && record.pass !== password) {
          setError('סיסמה שגויה.');
          return false;
        }
        const found = users.find((u) => u.id === identity) || null;
        setUser(found);
        if (found) sessionStorage.setItem(LEGACY_SESSION_KEY, found.id);
        return !!found;
      } catch (e) {
        setError(readableError(e));
        return false;
      }
    },
    [raw, users],
  );

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    setUser(null);
    if (AUTH_MODE === 'firebase') await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ mode: AUTH_MODE, user, users, loading, error, signIn, signOut }),
    [user, users, loading, error, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

function readableError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'סיסמה שגויה.';
  if (code === 'auth/user-not-found') return 'לא נמצא משתמש.';
  if (code === 'auth/too-many-requests') return 'יותר מדי ניסיונות. נסה/י שוב בעוד כמה דקות.';
  if (code === 'permission-denied') return 'אין הרשאה לקרוא את הנתונים.';
  return (e as Error)?.message || 'שגיאה לא צפויה.';
}

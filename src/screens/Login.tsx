import { useEffect, useState } from 'react';
import { C } from '@/ui/tokens';
import { Avatar } from '@/ui/primitives';
import { useAuth, AUTH_MODE } from '@/auth/AuthContext';
import { useStore } from '@/state/store';

/**
 * Login. The prototype logs you in by picking a name — that is demo behaviour.
 * Here the password is always checked: against Firebase Auth in `firebase`
 * mode, against the users collection hash in `legacy` mode.
 */
export function Login() {
  const { users, signIn, error, loading } = useAuth();
  const { db } = useStore();
  const [picked, setPicked] = useState<string>('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const list = [...users].sort((a, b) => (a.role === 'manager' ? -1 : b.role === 'manager' ? 1 : 0));
  const pickedUser = list.find((u) => u.id === picked) || list[0];

  useEffect(() => {
    if (!picked && list.length) setPicked(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  useEffect(() => {
    if (pickedUser?.email) setEmail(pickedUser.email);
  }, [pickedUser?.email]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    await signIn(AUTH_MODE === 'firebase' ? email : picked, pass);
    setBusy(false);
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        minWidth: 1280,
        background: C.loginCanvas,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          width: 1280,
          background: '#fff',
          boxShadow: '0 16px 40px rgba(35,31,41,.12)',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: C.brand, padding: '20px 44px 54px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src="/logo.png" alt="מידרג" style={{ height: 52, width: 'auto', display: 'block' }} />
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.88)' }}>תמיכה פנימית · 8080</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-.03em',
                lineHeight: 1,
              }}
            >
              {db.reports.filter((r) => r.hours || r.calls).length.toLocaleString('en-US')}
            </div>
            <div style={{ fontSize: 14.5, color: C.onBrandSoft, marginTop: 12 }}>
              דיווחי יום נרשמו על ידי <strong style={{ fontWeight: 700 }}>{db.employees.length}</strong>{' '}
              חברי צוות · סיכום יום · צוות טיוב
            </div>
          </div>
        </div>

        <div style={{ padding: '0 44px 44px', marginTop: -28 }}>
          <div
            style={{
              background: '#fff',
              border: `1px solid ${C.border}`,
              padding: '30px 34px',
              display: 'flex',
              gap: 38,
            }}
          >
            <div style={{ flex: 1.15 }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>כניסה למערכת</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 5 }}>
                בחרו את השם שלכם, הזינו סיסמה והמשיכו לדיווח היום.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  marginTop: 22,
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                {loading && (
                  <div style={{ padding: 14, fontSize: 13, color: C.muted }}>טוען משתמשים…</div>
                )}
                {!loading && !list.length && (
                  <div style={{ padding: 14, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                    {AUTH_MODE === 'firebase'
                      ? 'רשימת הצוות נטענת רק אחרי כניסה. הזינו אימייל וסיסמה.'
                      : 'לא נמצאו משתמשים במערכת.'}
                  </div>
                )}
                {list.map((u) => {
                  const on = u.id === picked;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setPicked(u.id)}
                      style={{
                        textAlign: 'start',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 12px',
                        borderBottom: `1px solid ${C.border}`,
                        background: on ? C.brandTint2 : '#fff',
                      }}
                    >
                      <Avatar
                        name={u.name}
                        bg={on ? C.brand : C.idleBar}
                        color={on ? '#fff' : C.muted}
                      />
                      <span style={{ lineHeight: 1.3 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                          {u.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, color: C.muted }}>
                          {u.role === 'manager' ? 'מנהל צוות' : 'עובד/ת צוות'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 16 }}>
                עובד חדש בצוות?{' '}
                <span style={{ color: C.brand, fontWeight: 600 }}>הרשמה למערכת</span>
              </div>
            </div>

            <div style={{ width: 1, background: C.border }} />

            <div style={{ flex: 0.85 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pickedUser?.name || '—'}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                {(pickedUser?.role === 'manager' ? 'מנהל צוות' : 'עובד/ת צוות') + ' · טיוב'}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {AUTH_MODE === 'firebase' && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 7 }}>אימייל</div>
                    <input
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={field}
                    />
                  </div>
                )}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 7 }}>סיסמה</div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    style={{ ...field, letterSpacing: '.24em' }}
                  />
                </div>

                {error && (
                  <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10 }}>{error}</div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 12, color: C.muted }}>שכחתי סיסמה</span>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      background: C.brand,
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                      padding: '11px 34px',
                      borderRadius: 999,
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? 'רגע…' : 'כניסה'}
                  </button>
                </div>
              </form>

              <div
                style={{
                  marginTop: 26,
                  paddingTop: 16,
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 11.5,
                  color: C.muted,
                  lineHeight: 1.7,
                }}
              >
                הדיווח נסגר ב-23:59. דיווח שלא הוגש נשמר כטיוטה ואפשר להשלים אותו למחרת.
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: C.footer,
            padding: '16px 44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11.5, color: C.onBrandFaint }}>מערכת פנימית · מידרג</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11.5,
              color: C.onBrandFaint,
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: 999, background: C.statusDot }}
            />{' '}
            הנתונים נשמרים בענן של מידרג
          </span>
        </div>
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '11px 18px',
  fontSize: 15,
  background: '#fff',
};

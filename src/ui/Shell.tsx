import type { ReactNode } from 'react';
import { C } from './tokens';
import { Avatar, Toast } from './primitives';
import { useAuth } from '@/auth/AuthContext';
import { useDb } from '@/state/store';
import { type Screen, useUi } from '@/state/ui';
import { employeeUnread, managerIdeaUnread, managerReplyUnread } from '@/domain/unread';

/**
 * The app chrome: magenta header with the nav row, and the charcoal footer.
 * There is deliberately no settings tab — settings live inside
 * "ניהול משימות ויעדים".
 */
export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const db = useDb();
  const ui = useUi();
  const isMgr = user?.role === 'manager';

  const nav: { key: Screen; label: string; badge?: number }[] = isMgr
    ? [
        { key: 'mgr-overview', label: 'מבט-על צוותי' },
        { key: 'mgr-employee', label: 'עובד בודד' },
        { key: 'mgr-notes', label: 'הערות ורעיונות', badge: managerIdeaUnread(db) || undefined },
        { key: 'mgr-messages', label: 'הודעות צוות', badge: managerReplyUnread(db) || undefined },
        { key: 'mgr-tasks', label: 'ניהול משימות ויעדים' },
        { key: 'mgr-report', label: 'דוח להנהלה' },
      ]
    : [
        { key: 'emp-report', label: 'דיווח יומי' },
        { key: 'emp-data', label: 'הנתונים שלי' },
        {
          key: 'emp-messages',
          label: 'הודעות והערות',
          badge: (user && employeeUnread(db, user.id)) || undefined,
        },
      ];

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        minWidth: 1280,
        display: 'flex',
        flexDirection: 'column',
        background: C.canvas,
      }}
    >
      <div style={{ background: C.brand, padding: '0 40px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo.png" alt="מידרג" style={{ height: 52, width: 'auto', display: 'block' }} />
            <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,.4)' }} />
            <span style={{ fontSize: 14, color: '#fff' }}>
              {isMgr ? 'סיכום יום · ניהול צוות טיוב' : 'סיכום יום · צוות טיוב'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: C.onBrandSoft }}>{user?.name}</span>
            <Avatar name={user?.name || ''} size={30} bg="rgba(255,255,255,.2)" color="#fff" />
            <button
              type="button"
              onClick={() => void signOut()}
              style={{
                fontSize: 12,
                color: C.onBrandSoft,
                border: '1px solid rgba(255,255,255,.45)',
                borderRadius: 999,
                padding: '5px 13px',
              }}
            >
              יציאה
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
          {nav.map((n) => {
            const active = ui.screen === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => ui.setScreen(n.key)}
                style={{
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 400,
                  color: active ? '#fff' : C.onBrandSoft,
                  padding: '0 2px 12px',
                  borderBottom: `3px solid ${active ? '#fff' : 'transparent'}`,
                }}
              >
                {n.label}
                {!!n.badge && (
                  <span
                    style={{
                      background: '#fff',
                      color: C.brand,
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 999,
                      padding: '1px 6px',
                      marginInlineStart: 5,
                    }}
                  >
                    {n.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1 }}>{children}</div>

      <div
        style={{
          background: C.footer,
          padding: '15px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11.5, color: C.onBrandFaint }}>סיכום יום · מערכת פנימית מידרג</span>
        <span style={{ fontSize: 11.5, color: C.onBrandFaint }}>
          {isMgr ? 'הדיווחים של הצוות · לשימוש פנימי' : 'הדיווחים שלך נראים לך ולמנהל הצוות'}
        </span>
      </div>

      <Toast text={ui.toast} />
    </div>
  );
}

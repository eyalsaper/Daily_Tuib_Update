import { useState } from 'react';
import { C } from '@/ui/tokens';
import { Card, Checkbox, Empty } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { isRead } from '@/domain/unread';
import { fmtFull } from '@/lib/date';
import { initials } from '@/lib/num';
import { deleteTeamMessage, publishTeamMessage, setReadMarks } from '@/data/repo';

/**
 * "הודעות צוות" — composer on the left, published messages on the right.
 * The manager sees every reply, including the ones flagged "רק למנהל".
 */
export function TeamBoard() {
  const db = useDb();
  const ui = useUi();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [must, setMust] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(true);

  const unreadReplies = db.messages.reduce(
    (a, m) => a + m.replies.filter((_r, i) => !isRead(db, 'replies', m.id + ':' + i)).length,
    0,
  );

  const messages = db.messages
    .filter((m) => !unreadOnly || m.replies.some((_r, i) => !isRead(db, 'replies', m.id + ':' + i)))
    .slice()
    .reverse();

  return (
    <div style={{ padding: '26px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      <Card accent={C.brand} style={{ width: 380, padding: '22px 24px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>הודעה חדשה לצוות</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
          תופיע לכולם במסך "הודעות והערות"
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11.5, color: C.muted }}>כותרת</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="על מה מדובר"
            style={{
              width: '100%',
              fontSize: 14.5,
              fontWeight: 600,
              border: 'none',
              borderBottom: `1px solid ${C.border}`,
              padding: '8px 0',
              background: 'none',
            }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: C.muted }}>גוף ההודעה</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="מה חדש השבוע…"
            style={{
              width: '100%',
              minHeight: 110,
              fontSize: 13.5,
              lineHeight: 1.7,
              border: 'none',
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 0',
              background: 'none',
              resize: 'vertical',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setMust((m) => !m)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16 }}
        >
          <Checkbox on={must} size={15} />
          <span style={{ fontSize: 13, color: C.ink2 }}>סמן כחובה לקרוא</span>
        </button>
        <button
          type="button"
          onClick={async () => {
            const t = title.trim();
            const b = body.trim();
            if (!t || !b || !user) return ui.flash('צריך כותרת וגוף הודעה.');
            await publishTeamMessage({
              authorId: user.id,
              authorName: user.name,
              title: t,
              body: b,
              must,
            });
            setTitle('');
            setBody('');
            setMust(false);
            ui.flash('ההודעה פורסמה לצוות.');
          }}
          style={{
            width: '100%',
            fontSize: 13.5,
            fontWeight: 700,
            color: '#fff',
            background: C.brand,
            borderRadius: 999,
            padding: '11px 0',
            marginTop: 18,
          }}
        >
          פרסום לצוות
        </button>
      </Card>

      <Card style={{ flex: 1 }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
                הודעות שפורסמו
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
                כולל תגובות העובדים — גם אלה שסומנו "רק למנהל"
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await setReadMarks(
                  db.messages.flatMap((m) =>
                    m.replies.map((_r, i) => ({ kind: 'replies' as const, key: m.id + ':' + i })),
                  ),
                  user?.id || '',
                );
                ui.flash('הכל סומן כנקרא.');
              }}
              style={{ fontSize: 12.5, color: C.brand, fontWeight: 600 }}
            >
              סמן הכל כנקרא
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button type="button" onClick={() => setUnreadOnly(true)} style={unreadOnly ? on(C.brand) : off}>
              עם תגובות חדשות · {unreadReplies}
            </button>
            <button type="button" onClick={() => setUnreadOnly(false)} style={!unreadOnly ? on(C.ink2) : off}>
              הצג הכל · {db.messages.length}
            </button>
          </div>
        </div>

        {!messages.length && <Empty text="אין תגובות חדשות. אפשר להציג הכל." />}
        {messages.map((m) => {
          const unreadCount = m.replies.filter(
            (_r, i) => !isRead(db, 'replies', m.id + ':' + i),
          ).length;
          return (
            <div key={m.id} style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.must && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#fff',
                        background: C.brand,
                        borderRadius: 3,
                        padding: '2px 8px',
                      }}
                    >
                      חובה לקרוא
                    </span>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{m.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!!unreadCount && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#fff',
                        background: C.brand,
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {unreadCount} חדשות
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: C.muted }}>
                    {m.date ? fmtFull(m.date) : ''} · {m.replies.length} תגובות
                  </span>
                  {!!unreadCount && (
                    <button
                      type="button"
                      onClick={() =>
                        void setReadMarks(
                          m.replies.map((_r, i) => ({
                            kind: 'replies' as const,
                            key: m.id + ':' + i,
                          })),
                          user?.id || '',
                        )
                      }
                      style={{ fontSize: 11.5, color: C.muted }}
                    >
                      סמן כנקרא
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteTeamMessage(
                        m.id,
                        m.replies.map((r) => r.docId).filter(Boolean) as string[],
                      );
                      ui.flash('ההודעה נמחקה.');
                    }}
                    style={{ fontSize: 11.5, color: C.danger }}
                  >
                    מחיקה
                  </button>
                </div>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.7, color: C.ink2 }}>
                {m.body}
              </p>
              {m.replies.map((rp, i) => {
                const who =
                  db.employees.find((e) => e.id === rp.by)?.name ||
                  (rp.by === db.manager.id ? db.manager.name : 'חבר/ת צוות');
                const unread = !isRead(db, 'replies', m.id + ':' + i);
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        background: C.idleBar,
                        color: C.muted,
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {initials(who)}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 12.5, color: C.muted }}>{who}</span>
                        {rp.onlyMgr && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: C.brand,
                              background: C.brandTint,
                              borderRadius: 3,
                              padding: '2px 6px',
                            }}
                          >
                            רק למנהל
                          </span>
                        )}
                        {unread && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.brand }}>חדש</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 2 }}>{rp.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function on(bg: string): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#fff',
    background: bg,
    borderRadius: 999,
    padding: '6px 16px',
  };
}

const off: React.CSSProperties = {
  fontSize: 12.5,
  color: C.muted,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '6px 16px',
};

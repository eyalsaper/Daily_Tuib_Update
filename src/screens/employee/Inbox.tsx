import { useState } from 'react';
import { C } from '@/ui/tokens';
import { Avatar, Card, Checkbox, Empty } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { isStale, isUnread } from '@/domain/unread';
import { fmtFull } from '@/lib/date';
import { initials } from '@/lib/num';
import { replyToMessage, setLegacyItemRead, setReadMark, setReadMarks } from '@/data/repo';

/**
 * "הודעות והערות" — private manager notes on the left, team messages on the
 * right. Both default to an unread-only view.
 */
export function Inbox() {
  const db = useDb();
  const ui = useUi();
  const { user } = useAuth();
  const userId = user?.id || '';
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [onlyMgr, setOnlyMgr] = useState<Record<string, boolean>>({});

  const allNotes = db.notes.filter((n) => n.to === userId);
  const allMsgs = db.messages;
  const unreadNotes = allNotes.filter((n) => !n.read && !isStale(n.date)).length;
  const unreadMsgs = allMsgs.filter((m) => isUnread(db, 'messages', m.id, m.date)).length;

  const notes = allNotes.filter((n) => !unreadOnly || (!n.read && !isStale(n.date))).slice().reverse();
  const messages = allMsgs
    .filter((m) => !unreadOnly || isUnread(db, 'messages', m.id, m.date))
    .slice()
    .reverse();

  async function markAll() {
    await Promise.all(allNotes.filter((n) => !n.read).map((n) => setLegacyItemRead(n.id, userId, true)));
    await setReadMarks(
      allMsgs.map((m) => ({ kind: 'messages' as const, key: m.id })),
      userId,
    );
    ui.flash('הכל סומן כנקרא.');
  }

  return (
    <>
      <div
        style={{
          background: '#fff',
          padding: '14px 40px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            style={unreadOnly ? filterOn(C.brand) : filterOff}
          >
            שלא נקראו · {unreadNotes + unreadMsgs}
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            style={!unreadOnly ? filterOn(C.ink2) : filterOff}
          >
            הצג הכל
          </button>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            {allNotes.length} הערות · {allMsgs.length} הודעות צוות
          </span>
        </div>
        <button
          type="button"
          onClick={() => void markAll()}
          style={{ fontSize: 12.5, color: C.brand, fontWeight: 600 }}
        >
          סמן הכל כנקרא
        </button>
      </div>

      <div style={{ padding: '26px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1.25 }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
              הערות מהמנהל
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              פידבק אישי על הדיווחים שלך · רק ביניכם
            </div>
          </div>
          {!notes.length && <Empty text="אין הערות חדשות. אפשר להציג הכל מלמעלה." />}
          {notes.map((n) => {
            const noteUnread = !n.read && !isStale(n.date);
            return (
            <div key={n.id} style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar name={db.manager.name} size={28} bg={C.brandTint} color={C.brand} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{db.manager.name}</span>
                  {noteUnread && (
                    <span style={{ fontSize: 11.5, color: C.brand, fontWeight: 700 }}>חדש</span>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: C.muted }}>
                  {n.date ? fmtFull(n.date) : ''}
                </span>
              </div>
              {n.contextText && (
                <div
                  style={{
                    marginTop: 10,
                    background: C.surface,
                    padding: '9px 12px',
                    fontSize: 12.5,
                    color: C.muted,
                    lineHeight: 1.6,
                  }}
                >
                  {'"' + n.contextText + '"'}
                </div>
              )}
              <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.75 }}>{n.text}</p>
              {noteUnread && (
                <button
                  type="button"
                  onClick={() => void setLegacyItemRead(n.id, userId, true)}
                  style={{
                    fontSize: 12.5,
                    color: C.muted,
                    border: `1px solid ${C.borderStrong}`,
                    borderRadius: 999,
                    padding: '7px 18px',
                    marginTop: 14,
                  }}
                >
                  סמן כנקרא
                </button>
              )}
            </div>
            );
          })}
        </Card>

        <Card style={{ flex: 1 }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>הודעות לצוות</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              עדכונים מ{db.manager.name?.split(' ')[0] || 'המנהל'} · אפשר להגיב
            </div>
          </div>
          {!messages.length && <Empty text="אין הודעות חדשות. אפשר להציג הכל מלמעלה." />}
          {messages.map((m) => {
            const unread = isUnread(db, 'messages', m.id, m.date);
            // A reply flagged onlyMgr is visible to the manager and its author only.
            const visible = m.replies.filter((rp) => !rp.onlyMgr || rp.by === userId);
            return (
              <div key={m.id} style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
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
                  {unread && (
                    <span style={{ fontSize: 11.5, color: C.brand, fontWeight: 700 }}>חדש</span>
                  )}
                  <span style={{ fontSize: 11.5, color: C.muted }}>
                    {m.date ? fmtFull(m.date) : ''}
                  </span>
                  <span style={{ flex: 1 }} />
                  {unread && (
                    <button
                      type="button"
                      onClick={() => void setReadMark('messages', m.id, userId, true)}
                      style={{ fontSize: 11.5, color: C.muted }}
                    >
                      סמן כנקרא
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 9 }}>{m.title}</div>
                <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.7, color: C.ink2 }}>
                  {m.body}
                </p>

                {visible.map((rp, i) => {
                  const who =
                    rp.by === userId
                      ? 'את/ה'
                      : db.employees.find((e) => e.id === rp.by)?.name ||
                        (rp.by === db.manager.id ? db.manager.name : 'חבר/ת צוות');
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
                        {initials(rp.by === userId ? user?.name || '' : who)}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 12.5, color: C.muted }}>{who}</span>
                          {rp.onlyMgr && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: C.muted,
                                background: C.idleBar,
                                borderRadius: 3,
                                padding: '2px 6px',
                              }}
                            >
                              רק למנהל
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 2 }}>
                          {rp.text}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <input
                    value={drafts[m.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder="כתוב/כתבי תגובה…"
                    style={{
                      width: '100%',
                      fontSize: 13.5,
                      border: 'none',
                      borderBottom: `1px solid ${C.border}`,
                      padding: '8px 0',
                      background: 'none',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOnlyMgr((o) => ({ ...o, [m.id]: !o[m.id] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 9 }}
                    >
                      <Checkbox on={!!onlyMgr[m.id]} size={15} />
                      <span style={{ fontSize: 12.5, color: C.ink2 }}>
                        רק המנהל יראה את התגובה
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const text = (drafts[m.id] || '').trim();
                        if (!text || !user) return ui.flash('אין מה לשלוח.');
                        await replyToMessage({
                          parentDocId: m.id,
                          authorId: user.id,
                          authorName: user.name,
                          text,
                          onlyMgr: !!onlyMgr[m.id],
                        });
                        setDrafts((d) => ({ ...d, [m.id]: '' }));
                        ui.flash('התגובה נשלחה.');
                      }}
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                        background: C.ink,
                        borderRadius: 999,
                        padding: '8px 22px',
                      }}
                    >
                      שליחה
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
                    כברירת מחדל התגובה גלויה לכל הצוות.
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}

function filterOn(bg: string): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#fff',
    background: bg,
    borderRadius: 999,
    padding: '6px 16px',
  };
}

const filterOff: React.CSSProperties = {
  fontSize: 12.5,
  color: C.muted,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '6px 16px',
};

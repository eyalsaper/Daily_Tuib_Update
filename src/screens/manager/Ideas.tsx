import { useState } from 'react';
import { C } from '@/ui/tokens';
import { Card, Empty } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { isRead } from '@/domain/unread';
import { fmtFull } from '@/lib/date';
import {
  publishTeamMessage,
  sendManagerNote,
  setIdeaCompleted,
  setIdeaReply,
  setReadMark,
  setReadMarks,
} from '@/data/repo';

/**
 * "הערות ורעיונות" — two separate columns, as requested: improvement ideas on
 * one side, the notes employees wrote on individual tasks on the other.
 */
export function Ideas() {
  const db = useDb();
  const ui = useUi();
  const { user } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [noteLimit, setNoteLimit] = useState(12);

  const allIdeas = db.reports
    .filter((r) => r.idea)
    .sort((a, c) => (a.date < c.date ? 1 : -1));
  const unreadIdeas = allIdeas.filter((r) => !isRead(db, 'ideas', r.id)).length;
  const shownIdeas = allIdeas.filter((r) => !unreadOnly || !isRead(db, 'ideas', r.id));
  const items = shownIdeas.slice(0, 12);

  const allTaskNotes: {
    key: string;
    who: string;
    userId: string;
    task: string;
    date: string;
    text: string;
  }[] = [];
  db.reports
    .slice()
    .sort((a, c) => (a.date < c.date ? 1 : -1))
    .forEach((r) => {
      Object.keys(r.tasks || {}).forEach((tid) => {
        const e = r.tasks[tid];
        if (e?.on && e.note) {
          allTaskNotes.push({
            key: r.id + ':' + tid,
            who: db.employees.find((x) => x.id === r.userId)?.name || '',
            userId: r.userId,
            task: db.tasks.find((t) => t.id === tid)?.name || tid,
            date: fmtFull(r.date),
            text: '"' + e.note + '"',
          });
        }
      });
    });
  const unreadNotes = allTaskNotes.filter((n) => !isRead(db, 'taskNotes', n.key)).length;
  const shownNotes = allTaskNotes.filter((n) => !unreadOnly || !isRead(db, 'taskNotes', n.key));
  const taskNotes = shownNotes.slice(0, noteLimit);

  // A keyword tally of what the ideas keep coming back to.
  const topics: Record<string, number> = {};
  db.reports.forEach((r) => {
    if (!r.idea) return;
    const k =
      r.idea.indexOf('צ׳קליסט') >= 0 || r.idea.indexOf("צ'קליסט") >= 0
        ? 'צ׳קליסט הבוקר'
        : r.idea.indexOf('משמרת') >= 0
          ? 'סידור משמרות'
          : r.idea.indexOf('תור') >= 0
            ? 'תורים פתוחים'
            : r.idea.indexOf('בוט') >= 0
              ? 'איפוס הבוט'
              : r.idea.indexOf('מענה') >= 0
                ? 'חלונות המענה'
                : 'אחר';
    topics[k] = (topics[k] || 0) + 1;
  });

  async function markAll() {
    await setReadMarks(
      [
        ...allIdeas.map((r) => ({ kind: 'ideas' as const, key: r.id })),
        ...allTaskNotes.map((n) => ({ kind: 'taskNotes' as const, key: n.key })),
      ],
      user?.id || '',
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
          <button type="button" onClick={() => setUnreadOnly(true)} style={unreadOnly ? on(C.brand) : off}>
            שלא קראתי
          </button>
          <button type="button" onClick={() => setUnreadOnly(false)} style={!unreadOnly ? on(C.ink2) : off}>
            הצג הכל
          </button>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            {unreadIdeas} רעיונות ו-{unreadNotes} הערות שלא קראת · סה"כ {allIdeas.length} /{' '}
            {allTaskNotes.length}
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

      <div style={{ padding: '22px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <Card accent={C.brand} style={{ flex: 1.1 }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
              רעיונות לשיפור
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              מה שהעובדים העלו בשדה "רעיון לשיפור"
            </div>
          </div>
          {!items.length && <Empty text="אין רעיונות חדשים." />}
          {shownIdeas.length > items.length && (
            <div
              style={{
                padding: '12px 24px',
                background: C.surface,
                borderBottom: `1px solid ${C.border}`,
                fontSize: 12.5,
                color: C.muted,
              }}
            >
              מוצגים 12 הראשונים · עוד {shownIdeas.length - items.length} ממתינים
            </div>
          )}
          {items.map((r) => {
            const unread = !isRead(db, 'ideas', r.id);
            const who = r.ideaAnon
              ? 'אנונימי'
              : db.employees.find((e) => e.id === r.userId)?.name || 'עובד/ת';
            return (
              <div key={r.id} style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    {r.ideaAnon && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.muted,
                          background: C.idleBar,
                          borderRadius: 3,
                          padding: '2px 8px',
                        }}
                      >
                        אנונימי
                      </span>
                    )}
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{who}</span>
                    {unread && (
                      <span style={{ fontSize: 11.5, color: C.brand, fontWeight: 700 }}>חדש</span>
                    )}
                    {r.ideaStatus === 'done' && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.success,
                          background: '#E6F4EC',
                          borderRadius: 3,
                          padding: '2px 8px',
                        }}
                      >
                        מיושם
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted }}>
                    {r.date ? fmtFull(r.date) : ''}
                  </span>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 15.5, lineHeight: 1.75 }}>
                  {'"' + r.idea + '"'}
                </p>
                {r.ideaReply && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: C.muted }}>התגובה שלך</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 4 }}>
                      {r.ideaReply}
                    </div>
                  </div>
                )}
                <input
                  value={drafts['i' + r.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, ['i' + r.id]: e.target.value }))}
                  placeholder="תגובה לעובד…"
                  style={{
                    width: '100%',
                    fontSize: 13.5,
                    border: 'none',
                    borderBottom: `1px solid ${C.border}`,
                    padding: '8px 0',
                    background: 'none',
                    marginTop: 14,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      const text = (drafts['i' + r.id] || '').trim();
                      if (!text || !user) return ui.flash('אין מה לשלוח.');
                      if (r.ideaDocId) await setIdeaReply(r.ideaDocId, text);
                      // An anonymous idea has no addressee, so the reply is
                      // stored but never delivered to an inbox.
                      if (!r.ideaAnon && r.userId) {
                        await sendManagerNote({
                          toUserId: r.userId,
                          toUserName: db.employees.find((e) => e.id === r.userId)?.name || '',
                          authorId: user.id,
                          authorName: user.name,
                          text,
                          context: r.idea,
                          kind: 'vent',
                        });
                      }
                      setDrafts((d) => ({ ...d, ['i' + r.id]: '' }));
                      ui.flash(r.ideaAnon ? 'התגובה נשמרה.' : 'התגובה נשלחה לעובד.');
                    }}
                    style={primary}
                  >
                    שליחת תגובה
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (r.ideaDocId) await setIdeaCompleted(r.ideaDocId, r.ideaStatus !== 'done');
                      await setReadMark('ideas', r.id, user?.id || '', true);
                    }}
                    style={secondary}
                  >
                    סימון כמיושם
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!user) return;
                      await publishTeamMessage({
                        authorId: user.id,
                        authorName: user.name,
                        title: 'רעיון שיושם',
                        body: r.idea,
                        must: false,
                      });
                      ui.flash('הרעיון פורסם לצוות.');
                    }}
                    style={secondary}
                  >
                    פרסום לצוות
                  </button>
                  {unread && (
                    <button
                      type="button"
                      onClick={() => void setReadMark('ideas', r.id, user?.id || '', true)}
                      style={{ fontSize: 12.5, color: C.muted }}
                    >
                      סמן כנקרא
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        <Card style={{ flex: 1 }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
              הערות מהדיווחים
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              מה שנכתב על משימות ספציפיות
            </div>
          </div>
          {!taskNotes.length && <Empty text="אין הערות חדשות." />}
          {taskNotes.map((n) => {
            const unread = !isRead(db, 'taskNotes', n.key);
            return (
              <div key={n.key} style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{n.who}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: C.muted,
                        background: C.idleBar,
                        borderRadius: 3,
                        padding: '2px 8px',
                      }}
                    >
                      {n.task}
                    </span>
                    {unread && (
                      <span style={{ fontSize: 11.5, color: C.brand, fontWeight: 700 }}>חדש</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{n.date}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>{n.text}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      ui.setMgrEmp(n.userId);
                      ui.setScreen('mgr-employee');
                    }}
                    style={{ fontSize: 12.5, color: C.brand, fontWeight: 600 }}
                  >
                    לכרטיס העובד ←
                  </button>
                  {unread && (
                    <button
                      type="button"
                      onClick={() => void setReadMark('taskNotes', n.key, user?.id || '', true)}
                      style={{ fontSize: 12.5, color: C.muted }}
                    >
                      סמן כנקרא
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {shownNotes.length > taskNotes.length && (
            <button
              type="button"
              onClick={() => setNoteLimit((n) => n + 20)}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 12.5,
                color: C.brand,
                fontWeight: 600,
              }}
            >
              עוד {shownNotes.length - taskNotes.length} הערות שלא נקראו — הצג
            </button>
          )}
          <div style={{ padding: '18px 24px', background: C.surface }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>נושאים שחוזרים ברעיונות</div>
            {Object.keys(topics)
              .map((k) => ({ label: k, n: topics[k] }))
              .sort((a, b) => b.n - a.n)
              .slice(0, 4)
              .map((t) => (
                <div
                  key={t.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{t.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>{t.n}</span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </>
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

const primary: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  background: C.brand,
  borderRadius: 999,
  padding: '8px 20px',
};

const secondary: React.CSSProperties = {
  fontSize: 13,
  color: C.muted,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '8px 18px',
};

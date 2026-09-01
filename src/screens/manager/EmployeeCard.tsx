import { useEffect, useMemo, useState } from 'react';
import { C } from '@/ui/tokens';
import { Card, Empty } from '@/ui/primitives';
import { CallsChart, ChartLegend } from '@/ui/Charts';
import { RangeBar } from '@/ui/RangeBar';
import { TaskChips, TaskDrill } from './TaskDrill';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { aggregate, barsFor } from '@/domain/calc';
import { inRange } from '@/domain/range';
import { fmtFull, fmtShort } from '@/lib/date';
import { initials, num, r1, signed } from '@/lib/num';
import { sendManagerNote } from '@/data/repo';

/** "עובד בודד" — one employee's card, always compared against the team. */
export function EmployeeCard() {
  const db = useDb();
  const ui = useUi();
  const range = useRangeState();
  const { user } = useAuth();
  const [draft, setDraft] = useState('');

  // Landing here directly opens on whoever reported most recently — the users
  // collection starts with dormant and test accounts, which would open empty.
  useEffect(() => {
    if (ui.mgrEmp || !db.employees.length) return;
    const latest = db.reports
      .filter((r) => (r.hours || r.calls) && db.employees.some((e) => e.id === r.userId))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    ui.setMgrEmp(latest?.userId || db.employees[0].id);
  }, [db.employees, db.reports, ui]);

  const emp = db.employees.find((e) => e.id === ui.mgrEmp);
  const idx = db.employees.findIndex((e) => e.id === ui.mgrEmp);

  const reps = useMemo(
    () =>
      db.reports
        .filter((r) => r.userId === ui.mgrEmp && inRange(range, r.date) && (r.hours || r.calls))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.reports, ui.mgrEmp, range],
  );
  const agg = aggregate(db.tasks, reps);
  const teamAgg = aggregate(
    db.tasks,
    db.reports.filter((r) => inRange(range, r.date) && (r.hours || r.calls)),
  );

  // Streak of mood <= 7, scanning at most the last 10 reports.
  const streak = (() => {
    const all = db.reports
      .filter((r) => r.userId === ui.mgrEmp && (r.hours || r.calls))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 10);
    let c = 0;
    for (const r of all) {
      if (r.mood && r.mood <= 7) c++;
      else break;
    }
    return c;
  })();

  if (!emp) {
    return (
      <div style={{ padding: 40 }}>
        <Card>
          <Empty text="אין עובדים להצגה." sub="הוסף עובדים ב-users כדי לראות כרטיסים." />
        </Card>
      </div>
    );
  }

  const taskRows = db.tasks
    .filter((t) => t.active)
    .map((t) => {
      let qty = 0;
      let hours = 0;
      let rTotal = 0;
      let rDone = 0;
      let used = 0;
      const notes: string[] = [];
      reps.forEach((r) => {
        const e = r.tasks[t.id];
        if (!e?.on) return;
        used++;
        qty += num(e.nums?.[0]);
        hours += num(e.time);
        t.resets.forEach((_l, i) => {
          rTotal++;
          if (e.resets?.[i]) rDone++;
        });
        if (e.note) notes.push(e.note);
      });
      return { t, qty, hours, rTotal, rDone, used, notes };
    })
    .filter((x) => x.used > 0);

  return (
    <>
      <div style={{ background: '#fff', padding: '18px 40px 0', borderBottom: `1px solid ${C.border}` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                background: C.brandTint,
                color: C.brand,
                fontSize: 15,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials(emp.name)}
            </span>
            <div>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.02em' }}>{emp.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                {agg.n} דיווחים בטווח הנבחר
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() =>
                ui.setMgrEmp(
                  db.employees[(idx - 1 + db.employees.length) % db.employees.length].id,
                )
              }
              style={navBtn}
            >
              → עובד קודם
            </button>
            <button
              type="button"
              onClick={() => ui.setMgrEmp(db.employees[(idx + 1) % db.employees.length].id)}
              style={navBtn}
            >
              עובד הבא ←
            </button>
          </div>
        </div>
      </div>

      <RangeBar latestDate={reps.length ? reps[reps.length - 1].date : undefined} />

      {streak >= 2 && (
        <div style={{ padding: '16px 40px 0' }}>
          <div
            style={{
              background: C.brandTint2,
              border: `1px solid ${C.brandBorder}`,
              padding: '14px 20px',
              fontSize: 13.5,
              lineHeight: 1.7,
            }}
          >
            {'מצב רוח 7 ומטה ' +
              (streak >= 10 ? 'בכל 10 הדיווחים האחרונים' : streak + ' דיווחים ברצף') +
              (reps.length && reps[reps.length - 1].moodText
                ? ' — בפירוט האחרון: "' + reps[reps.length - 1].moodText + '"'
                : '')}
          </div>
        </div>
      )}

      <TaskChips />
      {ui.drillTask && <TaskDrill empId={ui.mgrEmp} />}

      <div style={{ padding: '22px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
            <Kpi label="שיחות" value={agg.calls} sub={`צפי ${agg.expected} · ${signed(agg.vsExp)}`} first />
            <Rule />
            <Kpi
              label="פטל שקבע/ה"
              value={agg.patel}
              sub={`ממוצע לעובד ${db.employees.length ? Math.round(teamAgg.patel / db.employees.length) : 0}`}
            />
            <Rule />
            <Kpi
              label="אחוז איפוס"
              value={agg.resetPct === null ? '—' : agg.resetPct + '%'}
              sub={`הצוות ${teamAgg.resetPct === null ? '—' : teamAgg.resetPct + '%'}`}
            />
            <Rule />
            <Kpi label="שעות" value={agg.hours} sub={`${agg.cph ?? '—'} שיחות לשעה`} />
            <Rule />
            <Kpi label="מצב רוח" value={agg.mood ?? '—'} sub={`הצוות ${teamAgg.mood ?? '—'}`} />
          </Card>

          <Card style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>תפוקה מול צפי ומצב רוח</div>
              <ChartLegend mood />
            </div>
            <CallsChart bars={barsFor(db.tasks, reps)} height={140} withMood />
          </Card>

          <Card>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>מה דיווח/ה לפי משימה</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>
                כולל ההערות שכתב/ה על המשימות
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                padding: '10px 24px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 11.5,
                color: C.muted,
              }}
            >
              <span style={{ width: 170 }}>משימה</span>
              <span style={{ width: 110 }}>כמות</span>
              <span style={{ width: 110 }}>שעות</span>
              <span style={{ width: 150 }}>איפוס</span>
              <span style={{ flex: 1 }}>הערות</span>
            </div>
            {taskRows.map(({ t, qty, hours, rTotal, rDone, notes }) => {
              const bad = rTotal > 0 && rDone / rTotal < 0.8;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => ui.setDrillTask(t.id)}
                  style={{
                    width: '100%',
                    textAlign: 'start',
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '12px 24px',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ width: 170, fontSize: 14, fontWeight: 600, color: C.brand }}>
                    {t.name}
                  </span>
                  <span style={{ width: 110, fontSize: 13.5 }}>
                    {t.nums.length ? `${qty} ${t.name}` : 'איפוס בלבד'}
                  </span>
                  <span style={{ width: 110, fontSize: 13 }}>
                    {t.timeMode === 'windows' ? `${r1(hours)} ש׳ (חלונות)` : r1(hours)}
                  </span>
                  <span
                    style={{
                      width: 150,
                      fontSize: 12.5,
                      color: bad ? C.danger : C.muted,
                      fontWeight: bad ? 600 : 400,
                    }}
                  >
                    {rTotal ? `אופס ${rDone} מתוך ${rTotal}` : '—'}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
                    {notes.slice(0, 2).join(' · ') || '—'}
                  </span>
                </button>
              );
            })}
            {!taskRows.length && <Empty text="אין דיווחי משימות בטווח הזה." />}
          </Card>
        </div>

        <div style={{ width: 378, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div
              style={{
                padding: '16px 22px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              הדיווחים במילים שלו/ה
            </div>
            {reps
              .filter((r) => r.moodText)
              .sort((a, c) => (a.date < c.date ? 1 : -1))
              .slice(0, 3)
              .map((r) => (
                <div key={r.id} style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}` }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {fmtFull(r.date).split(',')[0]} · {fmtShort(r.date)}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: r.mood <= 6 ? C.danger : C.ink,
                      }}
                    >
                      מצב רוח {r.mood}
                    </span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.75 }}>
                    {'"' + r.moodText + '"'}
                  </p>
                </div>
              ))}
            {!reps.some((r) => r.moodText) && <Empty text="אין פירוט אישי בטווח הזה." />}
          </Card>

          <Card accent={C.brand} style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>הערה ל{emp.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
              תופיע במסך "הודעות והערות" שלו/ה
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="מה תרצה להגיד?"
              style={{
                width: '100%',
                minHeight: 86,
                fontSize: 13.5,
                lineHeight: 1.7,
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                padding: '12px 0',
                background: 'none',
                resize: 'vertical',
                marginTop: 10,
              }}
            />
            <button
              type="button"
              onClick={async () => {
                const text = draft.trim();
                if (!text || !user) return ui.flash('אין מה לשלוח.');
                await sendManagerNote({
                  toUserId: emp.id,
                  toUserName: emp.name,
                  authorId: user.id,
                  authorName: user.name,
                  text,
                });
                setDraft('');
                ui.flash('ההערה נשלחה ל' + emp.name + '.');
              }}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: C.brand,
                borderRadius: 999,
                padding: '10px 26px',
                marginTop: 14,
              }}
            >
              שליחה
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  first,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  first?: boolean;
}) {
  return (
    <div style={first ? { paddingInlineEnd: 24 } : { padding: '0 24px' }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', marginTop: 3 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Rule() {
  return <span style={{ width: 1, height: 48, background: C.border }} />;
}

const navBtn: React.CSSProperties = {
  fontSize: 12.5,
  color: C.muted,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '8px 16px',
};

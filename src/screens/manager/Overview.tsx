import { useEffect, useMemo, useState } from 'react';
import { C, PALETTE } from '@/ui/tokens';
import { Card } from '@/ui/primitives';
import { RangeBar } from '@/ui/RangeBar';
import { TaskChips, TaskDrill } from './TaskDrill';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { aggregate, barsFor } from '@/domain/calc';
import { inRange, rangeBounds, rangeLabel } from '@/domain/range';
import { rangeSummary, unresetRows } from '@/domain/summary';
import { addDays, daysBetween, fmtFull, iso, parse } from '@/lib/date';
import { num, r1, signed } from '@/lib/num';
import { saveManagerSummary } from '@/data/repo';

/**
 * "מבט-על צוותי". Prose before numbers; team goals before employee
 * comparison — the comparison table is deliberately last.
 *
 * There is intentionally no "13/14 reported" completeness metric: not everyone
 * works every day, and that is fine.
 */
export function Overview() {
  const db = useDb();
  const ui = useUi();
  const range = useRangeState();
  const { user } = useAuth();
  const label = rangeLabel(range);
  const b = rangeBounds(range);

  const reps = useMemo(
    () => db.reports.filter((r) => inRange(range, r.date) && (r.hours || r.calls)),
    [db.reports, range],
  );
  const agg = aggregate(db.tasks, reps);

  const patelTask = db.tasks.find((t) => t.id === 'patel');
  const days = daysBetween(b.from, b.to);
  const patelGoal = Math.round(((patelTask?.teamWeekly || 275) * days) / 7);
  const patelPct = patelGoal ? Math.round((agg.patel / patelGoal) * 100) : 0;

  const unreset = unresetRows(db, reps);

  const byEmp = db.employees
    .map((e) => {
      const er = reps.filter((r) => r.userId === e.id);
      const a = aggregate(db.tasks, er);
      return { emp: e, a, spark: barsFor(db.tasks, er).slice(-5) };
    })
    .sort((x, y) => y.a.calls - x.a.calls);

  const worstMood = byEmp
    .filter((x) => x.a.mood !== null)
    .sort((x, y) => (x.a.mood ?? 9) - (y.a.mood ?? 9))[0];

  const summary = rangeSummary({
    agg,
    patelGoal,
    worstUnreset: unreset[0],
    lowestMood: worstMood ? { name: worstMood.emp.name, mood: worstMood.a.mood as number } : undefined,
  });

  // hours per task, for the stacked bar
  const hoursByTask: Record<string, number> = {};
  let hoursTotal = 0;
  reps.forEach((r) =>
    Object.keys(r.tasks || {}).forEach((tid) => {
      const e = r.tasks[tid];
      if (!e?.on) return;
      hoursByTask[tid] = (hoursByTask[tid] || 0) + num(e.time);
      hoursTotal += num(e.time);
    }),
  );
  const hourRows = Object.keys(hoursByTask)
    .sort((a, c) => hoursByTask[c] - hoursByTask[a])
    .slice(0, 5)
    .map((tid, i) => ({
      label: db.tasks.find((t) => t.id === tid)?.name || tid,
      hours: r1(hoursByTask[tid]),
      w: hoursTotal ? Math.round((hoursByTask[tid] / hoursTotal) * 100) + '%' : '0%',
      color: PALETTE[i],
    }));

  // six-week trend, ending with the selected week
  const weeks = [];
  for (let k = 5; k >= 0; k--) {
    const anchor = addDays(b.from, -7 * k);
    const d = parse(anchor);
    const from = new Date(d);
    from.setDate(d.getDate() - d.getDay());
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    const wr = db.reports.filter((r) => r.date >= iso(from) && r.date <= iso(to));
    const a = aggregate(db.tasks, wr);
    weeks.push({ calls: a.calls, expected: a.expected });
  }
  const wmax = Math.max(1, ...weeks.map((w) => Math.max(w.calls, w.expected)));

  const lowMood = reps
    .filter((r) => r.mood && r.mood <= 7)
    .sort((a, c) => (a.date < c.date ? 1 : -1))
    .slice(0, 3);

  const summaryKey = b.from;
  const [draft, setDraft] = useState(db.mgrSummary[summaryKey] || '');
  useEffect(() => setDraft(db.mgrSummary[summaryKey] || ''), [summaryKey, db.mgrSummary]);

  return (
    <>
      <div style={{ background: C.brand, padding: '26px 40px 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: C.onBrandSoft }}>
          {label} · {db.employees.length} עובדים · {agg.n} דיווחים
        </div>
        <div
          style={{
            fontSize: 60,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-.035em',
            lineHeight: 1.05,
            marginTop: 6,
          }}
        >
          {agg.calls}
        </div>
        <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.92)', marginTop: 6 }}>
          שיחות מול צפי של {agg.expected} לפי תמהיל המשימות · {signed(agg.vsExp)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[
              { v: agg.hours, l: 'שעות עבודה' },
              { v: agg.cph ?? '—', l: 'שיחות לשעה' },
              { v: agg.resetPct === null ? '—' : agg.resetPct + '%', l: 'אחוז איפוס משימות' },
              { v: agg.mood ?? '—', l: 'מצב רוח ממוצע' },
            ].map((k, i) => (
              <span key={k.l} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ width: 1, height: 36, background: C.onBrandRule }} />}
                <span style={{ padding: '0 28px' }}>
                  <span style={{ display: 'block', fontSize: 23, fontWeight: 800, color: '#fff' }}>
                    {k.v}
                  </span>
                  <span
                    style={{ display: 'block', fontSize: 11.5, color: C.onBrandSoft, marginTop: 2 }}
                  >
                    {k.l}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <RangeBar
        latestDate={db.reports.length ? db.reports[db.reports.length - 1].date : undefined}
        right={
          <button
            type="button"
            onClick={() => ui.setScreen('mgr-report')}
            style={{ fontSize: 12.5, color: C.brand, fontWeight: 600 }}
          >
            דוח להנהלה
          </button>
        }
      />

      <div style={{ padding: '16px 40px 0' }}>
        <Card accent={C.brand} style={{ padding: '20px 26px', display: 'flex', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: C.muted, width: 120, flexShrink: 0 }}>
            מה קרה בטווח הזה
          </div>
          <p style={{ margin: 0, flex: 1, fontSize: 16, lineHeight: 1.75 }}>{summary}</p>
        </Card>
      </div>

      <TaskChips />
      {ui.drillTask && <TaskDrill />}

      <div style={{ padding: '16px 40px 0', display: 'flex', gap: 18, alignItems: 'stretch' }}>
        <Card style={{ flex: 1.15, padding: '22px 26px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>היעדים הצוותיים</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
            מה הצוות עשה מול מה שהוגדר
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginTop: 20,
              paddingBottom: 14,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: C.muted }}>פטל · יעד צוותי {patelGoal}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
                <span
                  style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}
                >
                  {agg.patel}
                </span>
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: patelPct >= 100 ? C.success : C.brand }}
                >
                  {patelPct}%
                </span>
              </div>
            </div>
            <div style={{ width: 200 }}>
              <div style={{ height: 8, background: C.track }}>
                <span
                  style={{
                    display: 'block',
                    height: 8,
                    background: C.brand,
                    width: Math.min(100, patelPct) + '%',
                  }}
                />
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              padding: '14px 0',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: C.muted }}>בוט קולקטיבי שנקבע</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '-.03em',
                  lineHeight: 1,
                  marginTop: 4,
                }}
              >
                {agg.bot}
              </div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <div style={{ fontSize: 13, color: C.muted }}>אחוז איפוס משימות</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '-.03em',
                  lineHeight: 1,
                  marginTop: 4,
                }}
              >
                {agg.resetPct === null ? '—' : agg.resetPct + '%'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>משימות שלא אופסו בטווח</div>
            {unreset.map((u) => (
              <div
                key={u.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '9px 0',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 13.5 }}>{u.label}</span>
                <span style={{ fontSize: 12, color: C.muted, flex: 1, textAlign: 'center' }}>
                  {u.who}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: u.bad ? C.danger : C.ink }}>
                  {u.n}
                </span>
              </div>
            ))}
            {!unreset.length && (
              <div style={{ fontSize: 12.5, color: C.muted, padding: '9px 0' }}>
                כל משימות האיפוס בוצעו בטווח הזה.
              </div>
            )}
          </div>
        </Card>

        <Card style={{ flex: 1, padding: '22px 26px', display: 'flex', flexDirection: 'column' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>מגמה שבועית</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
              שיחות מול צפי · 6 שבועות
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              height: 118,
              marginTop: 20,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {weeks.map((w, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: '100%',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    insetInline: -1,
                    height: 2,
                    background: C.ink2,
                    bottom: Math.round((w.expected / wmax) * 100) + '%',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    background: C.brand,
                    height: Math.round((w.calls / wmax) * 100) + '%',
                  }}
                />
              </span>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 11.5,
              color: C.muted,
            }}
          >
            <span>לפני 5 שבועות</span>
            <span>השבוע הנבחר</span>
          </div>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>פילוח שעות לפי משימה</div>
            <div style={{ display: 'flex', height: 16, marginTop: 12 }}>
              {hourRows.map((h) => (
                <span key={h.label} style={{ background: h.color, width: h.w }} />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px 18px',
                marginTop: 12,
                fontSize: 11.5,
                color: C.muted,
              }}
            >
              {hourRows.map((h) => (
                <span key={h.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 9, height: 9, background: h.color }} /> {h.label} {h.hours} ש׳
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card style={{ width: 288 }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700 }}>דורש תשומת לב</span>
            <span
              style={{
                background: C.brand,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              {lowMood.length}
            </span>
          </div>
          {lowMood.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                ui.setMgrEmp(r.userId);
                ui.setScreen('mgr-employee');
              }}
              style={{
                width: '100%',
                textAlign: 'start',
                padding: '14px 20px',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.6 }}>
                {(db.employees.find((e) => e.id === r.userId)?.name || '') +
                  ' דיווח/ה מצב רוח ' +
                  r.mood}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 5 }}>
                {fmtFull(r.date).split(',')[1]} ·{' '}
                {r.moodText ? r.moodText.slice(0, 42) + '…' : 'בלי פירוט'}
              </span>
            </button>
          ))}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>מובילים בטווח</div>
            {byEmp.slice(0, 2).map((x) => (
              <div key={x.emp.id} style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.9 }}>
                {x.emp.name} · {x.a.cph ?? '—'} שיחות לשעה
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>סיכום המנהל לטווח</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="מסקנות שיישמרו עם הטווח…"
              style={{
                width: '100%',
                minHeight: 64,
                fontSize: 12.5,
                lineHeight: 1.6,
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                padding: '8px 0',
                background: 'none',
                resize: 'vertical',
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await saveManagerSummary(summaryKey, draft, user?.id || '');
                ui.flash('הסיכום נשמר לטווח הזה.');
              }}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: C.ink,
                borderRadius: 999,
                padding: '8px 20px',
                marginTop: 12,
              }}
            >
              שמירה
            </button>
          </div>
        </Card>
      </div>

      <div style={{ padding: '16px 40px 36px' }}>
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700 }}>השוואה בין עובדים</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {label} · לחיצה על שורה פותחת את כרטיס העובד
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
            <span style={{ width: 140 }}>עובד</span>
            <span style={{ width: 70 }}>שיחות</span>
            <span style={{ width: 62 }}>לשעה</span>
            <span style={{ width: 70 }}>מול צפי</span>
            <span style={{ width: 64 }}>פטל</span>
            <span style={{ width: 64 }}>בוט</span>
            <span style={{ width: 92 }}>אחוז איפוס</span>
            <span style={{ width: 72 }}>מצב רוח</span>
            <span style={{ flex: 1 }}>מגמה</span>
          </div>
          {byEmp.map(({ emp, a, spark }) => {
            const resetBad = a.resetPct !== null && a.resetPct < 80;
            const moodBad = a.mood !== null && a.mood < 6.5;
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => {
                  ui.setMgrEmp(emp.id);
                  ui.setScreen('mgr-employee');
                }}
                style={{
                  width: '100%',
                  textAlign: 'start',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 24px',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ width: 140, fontSize: 14, fontWeight: 600 }}>{emp.name}</span>
                <span style={{ width: 70, fontSize: 13.5 }}>{a.calls}</span>
                <span style={{ width: 62, fontSize: 13.5, fontWeight: 700 }}>{a.cph ?? '—'}</span>
                <span
                  style={{
                    width: 70,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: a.vsExp >= 0 ? C.success : C.danger,
                  }}
                >
                  {signed(a.vsExp)}
                </span>
                <span style={{ width: 64, fontSize: 13.5 }}>{a.patel}</span>
                <span style={{ width: 64, fontSize: 13.5 }}>{a.bot}</span>
                <span
                  style={{
                    width: 92,
                    fontSize: 13.5,
                    color: resetBad ? C.danger : C.ink,
                    fontWeight: resetBad ? 600 : 400,
                  }}
                >
                  {a.resetPct === null ? '—' : a.resetPct + '%'}
                </span>
                <span
                  style={{
                    width: 72,
                    fontSize: 13.5,
                    color: moodBad ? C.danger : C.ink,
                    fontWeight: moodBad ? 700 : 400,
                  }}
                >
                  {a.mood ?? '—'}
                </span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
                  {spark.map((s, i) => (
                    <span key={i} style={{ width: 13, background: s.color, height: s.h }} />
                  ))}
                </span>
              </button>
            );
          })}
        </Card>
      </div>
    </>
  );
}

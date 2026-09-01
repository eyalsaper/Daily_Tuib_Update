import { C } from '@/ui/tokens';
import { Card } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import { isManualTask, manualFor, targetsFor } from '@/domain/calc';
import { inRange, rangeBounds, rangeLabel } from '@/domain/range';
import { fmtFull } from '@/lib/date';
import { num, r1 } from '@/lib/num';

/** The task chip row. Clicking a chip opens the drill-down panel in place. */
export function TaskChips() {
  const db = useDb();
  const ui = useUi();
  return (
    <div style={{ padding: '16px 40px 0' }}>
      <Card
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>ניתוח משימה:</span>
        {db.tasks
          .filter((t) => t.active)
          .map((t) => {
            const on = ui.drillTask === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => ui.setDrillTask(on ? null : t.id)}
                style={{
                  fontSize: 12.5,
                  fontWeight: on ? 700 : 400,
                  color: on ? '#fff' : C.ink2,
                  background: on ? C.brand : 'none',
                  border: on ? '1px solid transparent' : `1px solid ${C.borderStrong}`,
                  borderRadius: 999,
                  padding: '6px 15px',
                }}
              >
                {t.name}
              </button>
            );
          })}
      </Card>
    </div>
  );
}

/**
 * The drill-down panel, shared by both manager screens. When opened from an
 * employee card it is scoped to that employee; otherwise to the whole team.
 */
export function TaskDrill({ empId }: { empId?: string | null }) {
  const db = useDb();
  const ui = useUi();
  const range = useRangeState();
  const taskId = ui.drillTask;
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const reps = db.reports.filter(
    (r) => inRange(range, r.date) && (!empId || r.userId === empId) && (r.hours || r.calls),
  );

  const perEmp: Record<
    string,
    { id: string; name: string; times: number; qty: number; hours: number; rT: number; rD: number }
  > = {};
  let times = 0;
  let qty = 0;
  let hours = 0;
  let rTotal = 0;
  let rDone = 0;
  const notes: { who: string; date: string; text: string }[] = [];
  const windows: Record<string, number> = {};

  reps.forEach((r) => {
    const e = r.tasks[task.id];
    if (!e?.on) return;
    times++;
    const q = num(e.nums?.[0]);
    qty += q;
    hours += num(e.time);
    let lt = 0;
    let ld = 0;
    task.resets.forEach((_l, i) => {
      rTotal++;
      lt++;
      if (e.resets?.[i]) {
        rDone++;
        ld++;
      }
    });
    if (e.window) windows[e.window] = (windows[e.window] || 0) + 1;
    const name = nameOf(db, r.userId);
    if (e.note) notes.push({ who: name, date: fmtFull(r.date), text: '"' + e.note + '"' });
    if (!perEmp[r.userId])
      perEmp[r.userId] = { id: r.userId, name, times: 0, qty: 0, hours: 0, rT: 0, rD: 0 };
    const p = perEmp[r.userId];
    p.times++;
    p.qty += q;
    p.hours += num(e.time);
    p.rT += lt;
    p.rD += ld;
  });

  const tg = targetsFor(db, empId || 'team').values;
  const perHour = task.targetType === 'perHour' ? tg[task.id] || task.perHour || 0 : 0;
  const b = rangeBounds(range);
  const manual = isManualTask(task.id)
    ? empId
      ? manualFor(db.manualCounts, 'emp', empId, b.from, b.to)
      : manualFor(db.manualCounts, 'team', null, b.from, b.to)
    : null;

  const rows = Object.values(perEmp).sort((a, c) => c.times - a.times);

  return (
    <div style={{ padding: '16px 40px 0' }}>
      <Card accent={C.brand}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '22px 26px 18px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>{task.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {(empId ? nameOf(db, empId) : 'כל הצוות') + ' · ' + rangeLabel(range) + ' · בוצעה ' + times + ' פעמים'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => ui.setDrillTask(null)}
            style={{
              fontSize: 12.5,
              color: C.muted,
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 999,
              padding: '7px 16px',
            }}
          >
            סגירה
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '18px 26px',
            borderBottom: `1px solid ${C.border}`,
            flexWrap: 'wrap',
          }}
        >
          <Kpi label="פעמים שבוצעה" value={times} first />
          <Rule />
          <Kpi label="שעות" value={r1(hours)} />
          {task.nums.length > 0 && (
            <>
              <Rule />
              <Kpi label='סה"כ כמות' value={qty} />
              <Rule />
              <Kpi label="ממוצע ליום" value={times ? r1(qty / times) : 0} />
              <Rule />
              <Kpi label="לשעת עבודה" value={hours ? r1(qty / hours) : 0} />
            </>
          )}
          {rTotal > 0 && (
            <>
              <Rule />
              <Kpi
                label="אופס"
                value={Math.round((rDone / rTotal) * 100) + '%'}
                sub={`${rDone} מתוך ${rTotal}`}
              />
            </>
          )}
          {perHour > 0 && (
            <>
              <Rule />
              <Kpi
                label={`מול היעד (${perHour} לשעה)`}
                value={hours ? Math.round((qty / (hours * perHour)) * 100) + '%' : '—'}
                sub={`יעד ${Math.round(hours * perHour)}`}
              />
            </>
          )}
          {manual && (
            <>
              <Rule />
              <Kpi
                label={`כמות שהוזנה ידנית ${empId ? 'לעובד' : 'לצוות'}`}
                value={manual[task.id as 'checklist' | 'completions' | 'benji']}
              />
            </>
          )}
        </div>

        {!!Object.keys(windows).length && (
          <div
            style={{
              padding: '16px 26px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 12.5, color: C.muted }}>חלוקה לחלונות שעות:</span>
            {Object.keys(windows)
              .sort()
              .map((w) => (
                <span
                  key={w}
                  style={{
                    fontSize: 12.5,
                    background: C.idleBar,
                    borderRadius: 999,
                    padding: '5px 14px',
                  }}
                >
                  {w} · {windows[w]}
                </span>
              ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            padding: '10px 26px',
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11.5,
            color: C.muted,
          }}
        >
          <span style={{ flex: 1 }}>מי ביצע</span>
          <span style={{ width: 90 }}>פעמים</span>
          <span style={{ width: 100 }}>כמות</span>
          <span style={{ width: 80 }}>שעות</span>
          <span style={{ width: 130 }}>איפוס</span>
          <span style={{ width: 120 }}>מול היעד</span>
        </div>
        {rows.map((p) => {
          const goal = perHour ? Math.round(p.hours * perHour) : 0;
          const resetBad = p.rT > 0 && p.rD / p.rT < 0.8;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                ui.setMgrEmp(p.id);
                ui.setScreen('mgr-employee');
              }}
              style={{
                width: '100%',
                textAlign: 'start',
                display: 'flex',
                alignItems: 'center',
                padding: '12px 26px',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.name}</span>
              <span style={{ width: 90, fontSize: 13.5 }}>{p.times}</span>
              <span style={{ width: 100, fontSize: 13.5 }}>{task.nums.length ? p.qty : '—'}</span>
              <span style={{ width: 80, fontSize: 13.5 }}>{r1(p.hours)}</span>
              <span
                style={{
                  width: 130,
                  fontSize: 12.5,
                  color: resetBad ? C.danger : C.muted,
                  fontWeight: resetBad ? 600 : 400,
                }}
              >
                {p.rT ? `${p.rD}/${p.rT} (${Math.round((p.rD / p.rT) * 100)}%)` : '—'}
              </span>
              <span style={{ width: 120, fontSize: 12.5 }}>
                {goal ? `${p.qty} / ${goal}` : '—'}
              </span>
            </button>
          );
        })}

        {!!notes.length && (
          <div style={{ padding: '18px 26px', background: C.surface }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>מה נכתב על המשימה</div>
            {notes.slice(0, 6).map((n, i) => (
              <div key={i} style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: C.muted }}>
                  {n.who} · {n.date}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
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
    <div style={{ padding: first ? '0 0 0 0' : '0 26px', paddingInlineEnd: first ? 26 : 26 }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', marginTop: 3 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Rule() {
  return <span style={{ width: 1, height: 42, background: C.border }} />;
}

function nameOf(db: ReturnType<typeof useDb>, id: string): string {
  return (
    db.employees.find((e) => e.id === id)?.name ||
    (db.manager.id === id ? db.manager.name : '') ||
    'לא ידוע'
  );
}

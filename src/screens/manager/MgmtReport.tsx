import { useMemo, useState } from 'react';
import { C } from '@/ui/tokens';
import { Card, Pill, Toggle } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import { aggregate, manualFor, rateFor } from '@/domain/calc';
import { inRange, rangeBounds, rangeLabel, type RangeKind } from '@/domain/range';
import { daysBetween } from '@/lib/date';
import { num } from '@/lib/num';

/**
 * "דוח להנהלה" — generated plain text, rendered as lines and copied to the
 * clipboard. Quotes from the personal detail field default to OFF: they were
 * written for the manager, not for management.
 */
export function MgmtReport() {
  const db = useDb();
  const ui = useUi();
  const range = useRangeState();
  const [scope, setScope] = useState<'team' | 'emp'>('team');
  const [repEmp, setRepEmp] = useState(db.employees[0]?.id || '');
  const [sections, setSections] = useState({
    prod: true,
    targets: true,
    names: true,
    quotes: false,
  });

  const perEmpMode = scope === 'emp';
  const subject = db.employees.find((e) => e.id === repEmp);
  const label = rangeLabel(range);
  const b = rangeBounds(range);

  const reps = useMemo(
    () =>
      db.reports.filter(
        (r) =>
          inRange(range, r.date) && (r.hours || r.calls) && (!perEmpMode || r.userId === repEmp),
      ),
    [db.reports, range, perEmpMode, repEmp],
  );
  const agg = aggregate(db.tasks, reps);
  const days = daysBetween(b.from, b.to);
  const patelTask = db.tasks.find((t) => t.id === 'patel');
  const patelRate = patelTask ? rateFor(db, repEmp, patelTask) : 0;

  // In per-employee scope the פטל goal comes from THEIR hours and THEIR rate.
  const patelGoal = perEmpMode
    ? Math.round(agg.hours * patelRate)
    : Math.round(((patelTask?.teamWeekly || 0) * days) / 7);

  const perTask = db.tasks
    .filter((t) => t.active)
    .map((t) => {
      let rTotal = 0;
      let rDone = 0;
      let qty = 0;
      reps.forEach((r) => {
        const e = r.tasks[t.id];
        if (!e?.on) return;
        qty += num(e.nums?.[0]);
        t.resets.forEach((_l, i) => {
          rTotal++;
          if (e.resets?.[i]) rDone++;
        });
      });
      return {
        name: t.name,
        qty,
        pct: rTotal ? Math.round((rDone / rTotal) * 100) : null,
        hasNums: t.nums.length > 0,
      };
    });

  const byEmp = db.employees
    .map((e) => ({ name: e.name, ...aggregate(db.tasks, reps.filter((r) => r.userId === e.id)) }))
    .filter((x) => x.cph !== null);
  const leaders = byEmp.slice().sort((a, c) => (c.cph ?? 0) - (a.cph ?? 0)).slice(0, 2);
  const risk = byEmp.slice().sort((a, c) => (a.mood ?? 9) - (c.mood ?? 9))[0];

  const manual = perEmpMode
    ? manualFor(db.manualCounts, 'emp', repEmp, b.from, b.to)
    : manualFor(db.manualCounts, 'team', null, b.from, b.to);

  const lines: string[] = [];
  lines.push(
    perEmpMode
      ? `${subject?.name || ''} · צוות טיוב · ${label} · ${agg.n} דיווחים`
      : `צוות טיוב · ${label} · ${db.employees.length} עובדים`,
  );
  if (sections.prod) {
    lines.push('');
    lines.push('תפוקה');
    lines.push(
      `שיחות: ${agg.calls} · צפי לפי תמהיל המשימות: ${agg.expected} · ${agg.vsExp >= 0 ? '+' : ''}${agg.vsExp}%`,
    );
    lines.push(`שעות עבודה: ${agg.hours} · שיחות לשעה: ${agg.cph ?? '—'}`);
    lines.push(`ימי דיווח: ${agg.n}`);
    lines.push(`אחוז איפוס משימות: ${agg.resetPct === null ? '—' : agg.resetPct + '%'}`);
  }
  if (sections.targets) {
    lines.push('');
    lines.push('יעדים');
    lines.push(
      `פטל (${perEmpMode ? 'יעד אישי לפי שעות ' : 'יעד צוותי '}${patelGoal}): ${agg.patel} · ${
        patelGoal ? Math.round((agg.patel / patelGoal) * 100) : 0
      }%`,
    );
    perTask.filter((t) => t.pct !== null).forEach((t) => lines.push(`${t.name}: ${t.pct}% איפוס`));
    lines.push(`בוט קולקטיבי שנקבע: ${agg.bot}`);
    if (manual.n)
      lines.push(
        `כמויות שהוזנו ידנית: צ׳קליסטים ${manual.checklist} · השלמות ${manual.completions} · בנג׳י ${manual.benji}`,
      );
  }
  if (sections.names) {
    lines.push('');
    lines.push(perEmpMode ? 'מצב רוח' : 'אנשים');
    lines.push(`מצב רוח ממוצע: ${agg.mood ?? '—'}`);
    if (perEmpMode) {
      const lows = reps.filter((r) => r.mood && r.mood <= 7).length;
      lines.push(`דיווחים במצב רוח 7 ומטה: ${lows} מתוך ${agg.n}`);
    } else {
      if (leaders.length)
        lines.push('מובילים: ' + leaders.map((l) => `${l.name} (${l.cph} שיחות לשעה)`).join(', '));
      if (risk)
        lines.push(
          `דורש טיפול: ${risk.name} — מצב רוח ${risk.mood}, איפוס ${
            risk.resetPct === null ? '—' : risk.resetPct + '%'
          }`,
        );
    }
  }
  if (sections.quotes) {
    lines.push('');
    lines.push('מהדיווחים');
    reps
      .filter((r) => r.moodText)
      .slice(-3)
      .forEach((r) =>
        lines.push(
          `"${r.moodText}" — ${db.employees.find((e) => e.id === r.userId)?.name || 'אנונימי'}`,
        ),
      );
  }
  const text = lines.join('\n');
  const HEADS = ['תפוקה', 'יעדים', 'אנשים', 'מצב רוח', 'מהדיווחים'];

  const TABS: { key: RangeKind; label: string }[] = [
    { key: 'day', label: 'יום' },
    { key: 'week', label: 'שבוע' },
    { key: 'month', label: 'חודש' },
    { key: 'custom', label: 'טווח תאריכים' },
  ];

  return (
    <div style={{ padding: '26px 40px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            {(perEmpMode ? 'דוח על ' + (subject?.name || '') : 'דוח להנהלה · הצוות') + ' · ' + label}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
            הנתונים מסודרים לקריאה והעתקה — בלי הדפסה ובלי ייצוא
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Pill
              label="כל הצוות"
              active={!perEmpMode}
              activeBg={C.brand}
              onClick={() => setScope('team')}
            />
            <Pill
              label="עובד ספציפי"
              active={perEmpMode}
              activeBg={C.brand}
              onClick={() => setScope('emp')}
            />
            {perEmpMode && (
              <select
                value={repEmp}
                onChange={(e) => setRepEmp(e.target.value)}
                style={{
                  fontSize: 12.5,
                  border: `1px solid ${C.borderStrong}`,
                  borderRadius: 999,
                  padding: '6px 14px',
                  background: '#fff',
                }}
              >
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => ui.setRange(t.key)}
                style={{
                  fontSize: 12.5,
                  fontWeight: range.range === t.key ? 700 : 400,
                  color: range.range === t.key ? C.ink : C.muted,
                  padding: '0 12px',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {range.range !== 'custom' && (
            <input
              type="date"
              value={range.anchor}
              onChange={(e) => e.target.value && ui.setRange(range.range, e.target.value)}
              style={{
                fontSize: 12.5,
                border: `1px solid ${C.borderStrong}`,
                borderRadius: 999,
                padding: '6px 12px',
                background: '#fff',
              }}
            />
          )}
          <button type="button" onClick={() => ui.step(-1)} style={{ fontSize: 12.5, color: C.muted }}>
            → קודם
          </button>
          <button type="button" onClick={() => ui.step(1)} style={{ fontSize: 12.5, color: C.muted }}>
            הבא ←
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                ui.flash('הדוח הועתק — אפשר להדביק.');
              } catch {
                ui.flash('לא הצלחתי להעתיק, אפשר לסמן ולהעתיק ידנית.');
              }
            }}
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: '#fff',
              background: C.brand,
              borderRadius: 999,
              padding: '10px 26px',
            }}
          >
            העתקת הדוח
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 18, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1, padding: '34px 40px' }}>
          {lines.map((l, i) =>
            l === '' ? (
              <div key={i} style={{ height: 4 }} />
            ) : HEADS.includes(l) ? (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.brand,
                  letterSpacing: '.04em',
                  marginTop: 22,
                  paddingTop: 16,
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                {l}
              </div>
            ) : (
              <div key={i} style={{ fontSize: 15, lineHeight: 2, color: C.ink }}>
                {l}
              </div>
            ),
          )}
        </Card>

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>מה נכנס לדוח</div>
            {(
              [
                ['prod', 'תפוקה וצפי'],
                ['targets', 'יעדים לפי משימה'],
                ['names', 'שמות עובדים'],
                ['quotes', 'ציטוטים מהדיווחים'],
              ] as const
            ).map(([key, lbl]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 0',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 13.5 }}>{lbl}</span>
                <Toggle
                  on={sections[key]}
                  onClick={() => setSections((s) => ({ ...s, [key]: !s[key] }))}
                />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.7, marginTop: 12 }}>
              ציטוטים מהפירוט האישי כבויים כברירת מחדל — הם נכתבו לך, לא להנהלה.
            </div>
          </Card>

          <Card>
            <div
              style={{
                padding: '16px 22px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              פירוט לפי משימה
            </div>
            {perTask.map((t) => (
              <div
                key={t.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 22px',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {t.hasNums ? t.qty : '—'} · איפוס {t.pct === null ? '—' : t.pct + '%'}
                </span>
              </div>
            ))}
          </Card>

          {!perEmpMode && (
            <Card>
              <div
                style={{
                  padding: '16px 22px',
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                לפי עובד
              </div>
              {byEmp.map((e) => (
                <div
                  key={e.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 22px',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {e.cph} לשעה · {e.patel} פטל · {e.mood ?? '—'}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

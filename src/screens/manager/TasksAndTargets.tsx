import { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '@/ui/tokens';
import { Card, Pill, Toggle } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import type { AlertConfig, HourlyTargets, Task } from '@/types/models';
import { hourlyTargetTasks, manualFor, rateFor, targetsFor } from '@/domain/calc';
import { rangeBounds } from '@/domain/range';
import { fmtShort } from '@/lib/date';
import { num } from '@/lib/num';
import {
  addManualCount,
  clearPersonalTargets,
  deleteManualCount,
  saveAlerts,
  saveTargets,
  saveTasks,
} from '@/data/repo';
import { today } from '@/lib/date';

/**
 * "ניהול משימות ויעדים" — the task table, manual counts, the task editor,
 * hourly targets and alerts. There is no separate settings screen; this is it.
 */
export function TasksAndTargets() {
  const db = useDb();
  const ui = useUi();
  const range = useRangeState();

  // Task edits are written straight through, debounced so typing a label does
  // not fire a write per keystroke.
  const [tasks, setTasks] = useState<Task[]>(db.tasks);
  const [dirty, setDirty] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!dirty) setTasks(db.tasks);
  }, [db.tasks, dirty]);

  function commit(next: Task[]) {
    setTasks(next);
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await saveTasks(next);
        setDirty(false);
      } catch (e) {
        ui.flash(`שמירת המשימות נכשלה: ${(e as Error)?.message || 'שגיאה'}`);
      }
    }, 600);
  }

  const [editId, setEditId] = useState<string>('');
  const sel = tasks.find((t) => t.id === editId) || tasks[0];
  useEffect(() => {
    if (!editId && tasks.length) setEditId(tasks[0].id);
  }, [tasks, editId]);

  const upd = (patch: Partial<Task>) =>
    commit(tasks.map((t) => (t.id === sel.id ? { ...t, ...patch } : t)));

  /* ---- targets ---- */
  const [tgtScope, setTgtScope] = useState<'team' | 'emp'>('team');
  const [tgtEmp, setTgtEmp] = useState('');
  useEffect(() => {
    if (!tgtEmp && db.employees.length) setTgtEmp(db.employees[0].id);
  }, [db.employees, tgtEmp]);
  const scopeValues: HourlyTargets =
    tgtScope === 'team' ? db.targets.team : targetsFor(db, tgtEmp).values;

  /**
   * These values are overrides on top of the target set on the task itself.
   * An emptied field REMOVES the override rather than saving a zero — a stored
   * 0 reads as "zero per hour" and silently beats the task's own target.
   */
  async function setTargetValue(key: string, value: string) {
    const next: HourlyTargets = { ...scopeValues };
    if (value.trim() === '') delete next[key];
    else next[key] = num(value);
    await saveTargets(tgtScope === 'team' ? 'team' : tgtEmp, next);
  }

  /* ---- manual counts ---- */
  const b = rangeBounds(range);
  const [mcScope, setMcScope] = useState<'team' | 'emp'>('team');
  const [mcEmp, setMcEmp] = useState('');
  const [mcFrom, setMcFrom] = useState<string>('');
  const [mcTo, setMcTo] = useState<string>('');
  const [mcDraft, setMcDraft] = useState<{
    checklist?: string;
    completions?: string;
    benji?: string;
    note?: string;
  }>({});
  useEffect(() => {
    if (!mcEmp && db.employees.length) setMcEmp(db.employees[0].id);
  }, [db.employees, mcEmp]);
  const from = mcFrom || b.from;
  const to = mcTo || b.to;
  const current = useMemo(
    () =>
      mcScope === 'team'
        ? manualFor(db.manualCounts, 'team', null, from, to)
        : manualFor(db.manualCounts, 'emp', mcEmp, from, to),
    [db.manualCounts, mcScope, mcEmp, from, to],
  );
  const scopeLabel =
    mcScope === 'team' ? 'כל הצוות' : db.employees.find((e) => e.id === mcEmp)?.name || '';

  /* ---- alerts ---- */
  async function patchAlerts(patch: Partial<AlertConfig>) {
    await saveAlerts({ ...db.alerts, ...patch });
  }

  if (!sel) {
    return (
      <div style={{ padding: 40 }}>
        <Card style={{ padding: 30 }}>טוען את הגדרות המשימות…</Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '26px 40px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>משימות ויעדים</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
            לכל משימה את/ה מגדיר/ה מה העובד מדווח — מספרים, איפוס כן/לא, זמן והערה
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const id = 'task_' + Date.now();
            commit([
              ...tasks,
              {
                id,
                name: 'משימה חדשה',
                nums: [],
                resets: ['האם איפסת את הרשימה'],
                time: true,
                timeMode: 'hours',
                windows: [],
                note: true,
                targetType: 'none',
                weight: 1,
                active: true,
                visibleTo: 'all',
              },
            ]);
            setEditId(id);
          }}
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: '#fff',
            background: C.brand,
            borderRadius: 999,
            padding: '10px 24px',
          }}
        >
          + משימה חדשה
        </button>
      </div>

      {/* task table */}
      <Card style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            padding: '11px 24px',
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11.5,
            color: C.muted,
          }}
        >
          <span style={{ width: 150 }}>משימה</span>
          <span style={{ flex: 1 }}>מה העובד מדווח</span>
          <span style={{ width: 86 }}>זמן</span>
          <span style={{ width: 56 }}>הערה</span>
          <span style={{ width: 150 }}>יעד</span>
          <span style={{ width: 104 }}>משקל בצפי</span>
          <span style={{ width: 56 }}>פעילה</span>
        </div>
        {tasks.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              borderBottom: `1px solid ${C.border}`,
              background: t.id === sel.id ? C.brandTint2 : '#fff',
            }}
          >
            <button
              type="button"
              onClick={() => setEditId(t.id)}
              style={{
                width: 150,
                textAlign: 'start',
                fontSize: 14,
                fontWeight: 600,
                color: C.brand,
                lineHeight: 1.35,
              }}
            >
              {t.name}
            </button>
            <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, paddingInlineEnd: 14 }}>
              {t.nums.concat(t.resets.map((x) => x.replace('האם איפסת', 'איפוס'))).join(' · ') || '—'}
            </span>
            <span style={{ width: 86, fontSize: 12.5, color: C.muted }}>
              {t.time ? (t.timeMode === 'windows' ? 'חלון שעות' : 'שעות') : '—'}
            </span>
            <span style={{ width: 56, fontSize: 12.5, color: C.muted }}>{t.note ? 'כן' : '—'}</span>
            <span style={{ width: 150, fontSize: 12.5, lineHeight: 1.5 }}>
              {t.targetType === 'perHour'
                ? (t.teamWeekly ? `צוותי ${t.teamWeekly}/שבוע · ` : '') +
                  `${rateFor(db, 'team', t)} לשעה`
                : t.targetType === 'team'
                  ? 'צוותי'
                  : t.targetType === 'personal'
                    ? 'אישי'
                    : 'ללא יעד'}
            </span>
            <span style={{ width: 104, fontSize: 12.5, color: C.muted }}>
              {t.weight} {t.nums.length ? 'לכל יחידה' : 'לשעה'}
            </span>
            <span style={{ width: 56 }}>
              <Toggle
                on={t.active}
                onClick={() =>
                  commit(tasks.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)))
                }
              />
            </span>
          </div>
        ))}
      </Card>

      {/* manual counts */}
      <Card accent={C.ink2} style={{ padding: '22px 26px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>
              עדכון כמויות ידני
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.muted,
                marginTop: 3,
                maxWidth: 520,
                lineHeight: 1.6,
              }}
            >
              צ׳קליסטים, השלמות ובנג׳י — כמויות שאתה מזין בעצמך לטווח תאריכים, לצוות או לעובד. נראה
              רק לך ונכנס לדוח להנהלה.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pill label="כל הצוות" active={mcScope === 'team'} onClick={() => setMcScope('team')} />
            <Pill label="עובד ספציפי" active={mcScope === 'emp'} onClick={() => setMcScope('emp')} />
            {mcScope === 'emp' && (
              <select value={mcEmp} onChange={(e) => setMcEmp(e.target.value)} style={select}>
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 20,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: C.muted }}>מתאריך</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setMcFrom(e.target.value)}
              style={dateField}
            />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted }}>עד תאריך</div>
            <input type="date" value={to} onChange={(e) => setMcTo(e.target.value)} style={dateField} />
          </div>
          <span style={{ width: 1, height: 44, background: C.border }} />
          {(
            [
              ['checklist', 'צ׳קליסטים'],
              ['completions', 'השלמות'],
              ['benji', 'בנג׳י'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ width: 130 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>{label}</div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={mcDraft[key] ?? ''}
                onChange={(e) => setMcDraft((d) => ({ ...d, [key]: e.target.value }))}
                style={{
                  width: '100%',
                  fontSize: 20,
                  fontWeight: 800,
                  border: 'none',
                  borderBottom: `1px solid ${C.border}`,
                  padding: '5px 0',
                  background: 'none',
                }}
              />
            </div>
          ))}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11.5, color: C.muted }}>הערה (לא חובה)</div>
            <input
              value={mcDraft.note ?? ''}
              onChange={(e) => setMcDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="על מה הכמויות האלה"
              style={{
                width: '100%',
                fontSize: 13.5,
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                padding: '8px 0',
                background: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!num(mcDraft.checklist) && !num(mcDraft.completions) && !num(mcDraft.benji))
                return ui.flash('צריך למלא לפחות כמות אחת.');
              await addManualCount({
                scope: mcScope,
                empId: mcScope === 'team' ? null : mcEmp,
                from,
                to,
                checklist: num(mcDraft.checklist),
                completions: num(mcDraft.completions),
                benji: num(mcDraft.benji),
                note: mcDraft.note || '',
                at: today(),
              });
              setMcDraft({});
              ui.flash('הכמויות נשמרו ל' + (mcScope === 'team' ? 'צוות' : scopeLabel) + '.');
            }}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: C.ink2,
              borderRadius: 999,
              padding: '11px 26px',
            }}
          >
            שמירה ל{scopeLabel}
          </button>
        </div>

        {current.n > 0 && (
          <div
            style={{
              fontSize: 12.5,
              color: C.ink2,
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            בטווח הזה כבר רשום ל{scopeLabel}: צ׳קליסטים {current.checklist} · השלמות{' '}
            {current.completions} · בנג׳י {current.benji} — שמירה נוספת מתווספת לזה.
          </div>
        )}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>עדכונים אחרונים</div>
          {!db.manualCounts.length && (
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>עוד לא הוזנו כמויות.</div>
          )}
          {db.manualCounts
            .slice()
            .sort((a, c) => (a.at < c.at ? 1 : -1))
            .slice(0, 8)
            .map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 0',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: m.scope === 'team' ? '#fff' : C.brand,
                    background: m.scope === 'team' ? C.ink2 : C.brandTint,
                    borderRadius: 3,
                    padding: '2px 8px',
                  }}
                >
                  {m.scope === 'team'
                    ? 'כל הצוות'
                    : db.employees.find((e) => e.id === m.empId)?.name || 'עובד'}
                </span>
                <span style={{ fontSize: 12.5, color: C.muted, width: 110 }}>
                  {fmtShort(m.from)} – {fmtShort(m.to)}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  צ׳קליסטים {m.checklist} · השלמות {m.completions} · בנג׳י {m.benji}
                </span>
                {m.note && <span style={{ fontSize: 12, color: C.muted }}>{m.note}</span>}
                <button
                  type="button"
                  onClick={() => void deleteManualCount(m.id)}
                  style={{ fontSize: 11.5, color: C.danger }}
                >
                  מחיקה
                </button>
              </div>
            ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'stretch' }}>
        {/* task editor */}
        <Card accent={C.brand} style={{ flex: 1.5, padding: '22px 26px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>
            עריכת משימה · {sel.name}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
            מה שתסמן/י כאן זה בדיוק מה שהעובד יראה בטופס
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>שם המשימה</div>
              <input
                value={sel.name}
                onChange={(e) => upd({ name: e.target.value })}
                style={{
                  width: '100%',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: `1px solid ${C.border}`,
                  padding: '7px 0',
                  background: 'none',
                }}
              />
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 16 }}>
                שדות מספריים (השאלות שהעובד רואה)
              </div>
              {!sel.nums.length && (
                <div
                  style={{
                    fontSize: 13.5,
                    color: C.muted2,
                    borderBottom: `1px solid ${C.border}`,
                    paddingBottom: 7,
                    marginTop: 5,
                  }}
                >
                  אין — למשימה הזו מדווחים רק איפוס
                </div>
              )}
              {sel.nums.map((label, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <input
                    value={label}
                    onChange={(e) => {
                      const arr = sel.nums.slice();
                      arr[i] = e.target.value;
                      upd({ nums: arr });
                    }}
                    style={lineInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const arr = sel.nums.slice();
                      arr.splice(i, 1);
                      upd({ nums: arr });
                    }}
                    style={{ fontSize: 11.5, color: C.muted }}
                  >
                    הסרה
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => upd({ nums: sel.nums.concat(['כמות ' + sel.name]) })}
                style={addLink}
              >
                + שדה מספרי
              </button>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>שאלות איפוס (כן/לא)</div>
              {!sel.resets.length && (
                <div
                  style={{
                    fontSize: 13.5,
                    color: C.muted2,
                    borderBottom: `1px solid ${C.border}`,
                    paddingBottom: 7,
                    marginTop: 5,
                  }}
                >
                  אין — למשימה הזו מדווחים כמות
                </div>
              )}
              {sel.resets.map((label, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <input
                    value={label}
                    onChange={(e) => {
                      const arr = sel.resets.slice();
                      arr[i] = e.target.value;
                      upd({ resets: arr });
                    }}
                    style={lineInput}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const arr = sel.resets.slice();
                      arr.splice(i, 1);
                      upd({ resets: arr });
                    }}
                    style={{ fontSize: 11.5, color: C.muted }}
                  >
                    הסרה
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => upd({ resets: sel.resets.concat(['האם איפסת את הרשימה']) })}
                style={addLink}
              >
                + שאלת איפוס
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 20,
                }}
              >
                <span style={{ fontSize: 13.5 }}>זמן במשימה</span>
                <Toggle on={sel.time} onClick={() => upd({ time: !sel.time })} />
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12 }}>איך מדווחים את הזמן</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                <Pill
                  label="מספר שעות"
                  active={sel.timeMode === 'hours'}
                  onClick={() => upd({ timeMode: 'hours' })}
                  style={{ padding: '5px 14px' }}
                />
                <Pill
                  label="חלון שעות קבוע"
                  active={sel.timeMode === 'windows'}
                  onClick={() =>
                    upd({
                      timeMode: 'windows',
                      windows: sel.windows.length
                        ? sel.windows
                        : ['09:00–11:00', '11:00–13:00', '13:00–15:00'],
                    })
                  }
                  style={{ padding: '5px 14px' }}
                />
              </div>
              {sel.timeMode === 'windows' && (
                <div
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    padding: '12px 14px',
                    marginTop: 10,
                  }}
                >
                  <div style={{ fontSize: 11.5, color: C.muted }}>החלונות שהעובד יבחר מהם</div>
                  {sel.windows.map((w, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}
                    >
                      <input
                        value={w}
                        onChange={(e) => {
                          const arr = sel.windows.slice();
                          arr[i] = e.target.value;
                          upd({ windows: arr });
                        }}
                        style={{
                          flex: 1,
                          fontSize: 13.5,
                          background: '#fff',
                          border: `1px solid ${C.borderStrong}`,
                          padding: '6px 12px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const arr = sel.windows.slice();
                          arr.splice(i, 1);
                          upd({ windows: arr });
                        }}
                        style={{ fontSize: 11.5, color: C.muted }}
                      >
                        הסרה
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => upd({ windows: sel.windows.concat(['15:00–17:00']) })}
                    style={addLink}
                  >
                    + חלון שעות
                  </button>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 16,
                }}
              >
                <span style={{ fontSize: 13.5 }}>הערה למשימה</span>
                <Toggle on={sel.note} onClick={() => upd({ note: !sel.note })} />
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 20,
              paddingTop: 18,
              borderTop: `1px solid ${C.border}`,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>יעד</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                {(
                  [
                    ['team', 'צוותי'],
                    ['personal', 'אישי'],
                    ['perHour', 'לפי שעה'],
                    ['none', 'ללא יעד'],
                  ] as const
                ).map(([key, label]) => (
                  <Pill
                    key={key}
                    label={label}
                    active={sel.targetType === key}
                    onClick={() => upd({ targetType: key })}
                    style={{ padding: '5px 14px' }}
                  />
                ))}
              </div>
            </div>
            {sel.targetType === 'perHour' && (
              <div style={{ width: 120 }}>
                <div style={{ fontSize: 11.5, color: C.muted }}>יעד לשעה</div>
                <input
                  type="number"
                  value={sel.perHour ?? ''}
                  onChange={(e) => upd({ perHour: num(e.target.value) })}
                  style={bigInput}
                />
              </div>
            )}
            {/* The weekly team goal the overview measures the team against.
                Blank means the task has no team goal at all. */}
            <div style={{ width: 150 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>יעד צוותי לשבוע</div>
              <input
                type="number"
                min="0"
                placeholder="ללא"
                value={sel.teamWeekly ?? ''}
                onChange={(e) =>
                  upd({ teamWeekly: e.target.value === '' ? undefined : num(e.target.value) })
                }
                style={bigInput}
              />
            </div>
            <div style={{ width: 150 }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                משקל בצפי · {sel.nums.length ? 'שיחות לכל יחידה' : 'שיחות לכל שעה'}
              </div>
              <input
                type="number"
                step="0.1"
                value={sel.weight}
                onChange={(e) => upd({ weight: num(e.target.value) })}
                style={bigInput}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginTop: 20,
              paddingTop: 16,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: C.muted }}>מוצגת ל</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                <Pill
                  label="כל הצוות"
                  active={sel.visibleTo === 'all'}
                  onClick={() => upd({ visibleTo: 'all' })}
                  style={{ padding: '5px 14px' }}
                />
                <Pill
                  label="עובדים נבחרים"
                  active={sel.visibleTo !== 'all'}
                  onClick={() => upd({ visibleTo: 'some' })}
                  style={{ padding: '5px 14px' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  const next = tasks.filter((t) => t.id !== sel.id);
                  commit(next);
                  setEditId(next[0]?.id || '');
                  ui.flash('המשימה נמחקה.');
                }}
                style={{ fontSize: 12.5, color: C.danger, fontWeight: 600 }}
              >
                מחיקת המשימה
              </button>
              <button
                type="button"
                onClick={async () => {
                  window.clearTimeout(timer.current);
                  try {
                    await saveTasks(tasks);
                    setDirty(false);
                    ui.flash('המשימה נשמרה.');
                  } catch (e) {
                    ui.flash(`שמירת המשימה נכשלה: ${(e as Error)?.message || 'שגיאה'}`);
                  }
                }}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  background: C.brand,
                  borderRadius: 999,
                  padding: '10px 26px',
                }}
              >
                שמירה
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12 }}>
            שינויים נשמרים מיד — הכפתור רק לאישור.
          </div>
        </Card>

        {/* hourly targets + alerts */}
        <Card style={{ flex: 1.45, padding: '22px 26px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>יעדים לשעה</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            מה שהעובד רואה במסך "הנתונים שלי"
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 16,
              paddingBottom: 14,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <Pill
              label="כל הצוות"
              active={tgtScope === 'team'}
              onClick={() => setTgtScope('team')}
              style={{ padding: '5px 14px' }}
            />
            <Pill
              label="עובד ספציפי"
              active={tgtScope === 'emp'}
              onClick={() => setTgtScope('emp')}
              style={{ padding: '5px 14px' }}
            />
            {tgtScope === 'emp' && (
              <select value={tgtEmp} onChange={(e) => setTgtEmp(e.target.value)} style={select}>
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {Object.keys(db.targets.byEmp).length} עם יעד אישי
            </span>
          </div>
          {!hourlyTargetTasks(db).length && (
            <div style={{ fontSize: 12.5, color: C.muted, padding: '12px 0', lineHeight: 1.7 }}>
              אין משימה עם יעד לפי שעה. כדי להוסיף יעד, בחר/י משימה בטבלה למעלה ובחר/י "לפי שעה"
              בשדה היעד.
            </div>
          )}
          {hourlyTargetTasks(db).map((t) => {
            const key = t.id;
            const label = t.name;
            const unit = t.name;
            return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ flex: 1, fontSize: 13.5 }}>{label}</span>
              <input
                type="number"
                defaultValue={scopeValues[key] ?? ''}
                placeholder={String(t.perHour ?? 0)}
                key={key + tgtScope + tgtEmp + (scopeValues[key] ?? '')}
                onBlur={(e) => void setTargetValue(key, e.target.value)}
                style={{
                  width: 70,
                  fontSize: 15,
                  fontWeight: 700,
                  border: 'none',
                  borderBottom: `1px solid ${C.border}`,
                  padding: '4px 0',
                  background: 'none',
                }}
              />
              <span style={{ width: 150, fontSize: 12.5, color: C.muted, textAlign: 'end' }}>
                {unit} לשעה · במשימה {t.perHour ?? 0}
              </span>
            </div>
            );
          })}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
            }}
          >
            <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, maxWidth: 230 }}>
              שדה ריק = היעד שמוגדר במשימה עצמה. עובד בלי יעד אישי מקבל את יעד הצוות.
            </span>
            {tgtScope === 'emp' && (
              <button
                type="button"
                onClick={async () => {
                  await clearPersonalTargets(tgtEmp);
                  ui.flash('היעד האישי אופס — חוזר ליעד הצוות.');
                }}
                style={{ fontSize: 12.5, color: C.danger, fontWeight: 600 }}
              >
                איפוס ליעד הצוות
              </button>
            )}
          </div>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>התראות</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 16,
                paddingBottom: 12,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13.5 }}>מצב רוח 7 ומטה</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  כל דיווח, מיד עם השליחה
                </div>
              </div>
              <Toggle
                on={db.alerts.moodLow}
                onClick={() => void patchAlerts({ moodLow: !db.alerts.moodLow })}
              />
            </div>
            <div style={{ padding: '12px 0' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>משימה שלא אופסה</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    רק על המשימות שתבחר/י · {db.alerts.unresetTasks.length} נבחרו
                  </div>
                </div>
                <Toggle
                  on={db.alerts.unresetOn}
                  onClick={() => void patchAlerts({ unresetOn: !db.alerts.unresetOn })}
                />
              </div>
              {db.alerts.unresetOn && (
                <div
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    padding: '12px 14px',
                    marginTop: 12,
                  }}
                >
                  <div style={{ fontSize: 11.5, color: C.muted }}>להתריע כשלא אופסה:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                    {db.tasks
                      .filter((t) => t.resets.length)
                      .map((t) => {
                        const on = db.alerts.unresetTasks.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              void patchAlerts({
                                unresetTasks: on
                                  ? db.alerts.unresetTasks.filter((x) => x !== t.id)
                                  : [...db.alerts.unresetTasks, t.id],
                              })
                            }
                            style={{
                              fontSize: 12.5,
                              fontWeight: on ? 600 : 400,
                              color: on ? '#fff' : C.muted,
                              background: on ? C.brand : 'none',
                              border: on ? '1px solid transparent' : `1px solid ${C.borderStrong}`,
                              borderRadius: 999,
                              padding: '5px 13px',
                            }}
                          >
                            {t.name}
                            {on ? ' ✓' : ''}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>
                אין התראה על דיווח חסר — לא כל יום כולם עובדים.
              </div>
              <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 8, lineHeight: 1.6 }}>
                ההתראות נשלחות על ידי Cloud Function נפרדת שקוראת את ההגדרות האלה.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

const select: React.CSSProperties = {
  fontSize: 12.5,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '6px 14px',
  background: '#fff',
};

const dateField: React.CSSProperties = {
  fontSize: 13,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '8px 14px',
  background: '#fff',
  marginTop: 5,
};

const lineInput: React.CSSProperties = {
  flex: 1,
  fontSize: 13.5,
  border: 'none',
  borderBottom: `1px solid ${C.border}`,
  padding: '6px 0',
  background: 'none',
};

const bigInput: React.CSSProperties = {
  width: '100%',
  fontSize: 19,
  fontWeight: 800,
  border: 'none',
  borderBottom: `1px solid ${C.border}`,
  padding: '5px 0',
  background: 'none',
};

const addLink: React.CSSProperties = {
  fontSize: 12.5,
  color: C.brand,
  fontWeight: 600,
  marginTop: 10,
};

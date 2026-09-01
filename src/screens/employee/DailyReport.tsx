import { useEffect, useMemo, useState } from 'react';
import { C } from '@/ui/tokens';
import { Badge, Card, Checkbox, ErrorBanner, Modal, ProgressBar, SectionHead, Pill, YesNo } from '@/ui/primitives';
import { useDb } from '@/state/store';
import { useUi } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import type { Report, Task, TaskEntry } from '@/types/models';
import { fmtFull, today, yesterday } from '@/lib/date';
import { num, r1 } from '@/lib/num';
import { moodWord, targetsFor } from '@/domain/calc';
import { createReport, replaceReport, saveIdea, setIdeaReply } from '@/data/repo';
import { setDoc } from 'firebase/firestore';
import { docRef, uid } from '@/lib/firebase';

/**
 * The employee's daily report.
 *
 * Layout rule from the handoff: meaningful questions are visually loud,
 * technical fields are quiet. Shift place / hours / note live in one thin
 * one-row strip; "how was your day" gets a full-width block with a 46px scale.
 */

type Mode = 'new' | 'edit' | 'append';

interface FormEntry {
  on: boolean;
  nums: Record<number, string>;
  resets: Record<number, boolean>;
  time: string;
  window: string;
  note: string;
}

interface Form {
  date: string;
  mode: Mode;
  place: 'משרד' | 'בית';
  hours: string;
  hoursNote: string;
  calls: string;
  mood: number;
  moodText: string;
  idea: string;
  ideaAnon: boolean;
  tasks: Record<string, FormEntry>;
}

function blankForm(tasks: Task[], date: string, mode: Mode, base?: Report | null): Form {
  const entries: Record<string, FormEntry> = {};
  tasks
    .filter((t) => t.active)
    .forEach((t) => {
      const src = mode === 'edit' && base ? base.tasks[t.id] : null;
      const nums: Record<number, string> = {};
      if (src) Object.keys(src.nums || {}).forEach((k) => (nums[Number(k)] = String(src.nums[Number(k)])));
      entries[t.id] = {
        on: !!src?.on,
        nums,
        resets: src ? { ...src.resets } : {},
        time: src ? String(src.time ?? '') : t.timeMode === 'windows' ? '2' : '',
        window: src?.window || t.windows[0] || '',
        note: src?.note || '',
      };
    });
  return {
    date,
    mode,
    place: mode === 'edit' && base ? base.place : 'משרד',
    hours: mode === 'edit' && base ? String(base.hours) : '',
    hoursNote: mode === 'edit' && base ? base.hoursNote : '',
    calls: mode === 'edit' && base ? String(base.calls) : '',
    mood: mode === 'edit' && base ? base.mood : 0,
    moodText: mode === 'edit' && base ? base.moodText : '',
    idea: mode === 'edit' && base ? base.idea : '',
    ideaAnon: mode === 'edit' && base ? base.ideaAnon : false,
    tasks: entries,
  };
}

export function DailyReport() {
  const db = useDb();
  const ui = useUi();
  const { user } = useAuth();
  const userId = user?.id || '';
  const activeTasks = useMemo(() => db.tasks.filter((t) => t.active), [db.tasks]);

  const reportOn = (date: string) =>
    db.reports.find((r) => r.userId === userId && r.date === date && (r.hours || r.calls)) || null;

  const [form, setForm] = useState<Form>(() => blankForm(db.tasks, yesterday(), 'new', null));
  const [modalDate, setModalDate] = useState<string | null>(() =>
    reportOn(yesterday()) ? yesterday() : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The task list arrives asynchronously, so the first form has no task rows.
  // Fill them in once the configuration lands, keeping whatever was typed.
  useEffect(() => {
    if (!activeTasks.length) return;
    setForm((f) => {
      const fresh = blankForm(db.tasks, f.date, 'new', null).tasks;
      const missing = Object.keys(fresh).filter((id) => !f.tasks[id]);
      if (!missing.length) return f;
      const tasks = { ...f.tasks };
      missing.forEach((id) => (tasks[id] = fresh[id]));
      return { ...f, tasks };
    });
  }, [activeTasks.length, db.tasks]);

  // "עריכת הדיווח" from the single-day view opens the form on that date.
  useEffect(() => {
    if (!ui.editRequest || !db.tasks.length) return;
    const target = reportOn(ui.editRequest);
    setForm(blankForm(db.tasks, ui.editRequest, target ? 'edit' : 'new', target));
    setModalDate(null);
    ui.clearEditRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.editRequest, db.tasks.length]);

  const patch = (p: Partial<Form>) => {
    setForm((f) => ({ ...f, ...p }));
    setError(null);
  };
  const patchTask = (tid: string, p: Partial<FormEntry>) => {
    setForm((f) => ({ ...f, tasks: { ...f.tasks, [tid]: { ...f.tasks[tid], ...p } } }));
    setError(null);
  };

  const targets = targetsFor(db, userId).values;
  const hours = num(form.hours);

  const expected = useMemo(() => {
    let x = 0;
    Object.keys(form.tasks).forEach((tid) => {
      const t = db.tasks.find((y) => y.id === tid);
      const e = form.tasks[tid];
      if (!t || !e?.on) return;
      if (t.nums.length) x += num(e.nums[0]) * t.weight;
      else x += (t.timeMode === 'windows' ? 2 : num(e.time)) * t.weight;
    });
    return Math.round(x);
  }, [form.tasks, db.tasks]);

  const onCount = Object.keys(form.tasks).filter((k) => form.tasks[k].on).length;

  let rTotal = 0;
  let rDone = 0;
  Object.keys(form.tasks).forEach((tid) => {
    const t = db.tasks.find((y) => y.id === tid);
    const e = form.tasks[tid];
    if (!t || !e?.on) return;
    t.resets.forEach((_l, i) => {
      rTotal++;
      if (e.resets[i]) rDone++;
    });
  });

  const patelQty = num(form.tasks.patel?.nums[0]);
  const botQty = num(form.tasks.bot?.nums[0]);
  const patelGoal = Math.round(num(form.tasks.patel?.time) * targets.patel);
  const botGoal = Math.round(num(form.tasks.bot?.time) * targets.bot);

  function pickDate(date: string) {
    const existing = reportOn(date);
    setForm((f) => ({ ...f, date, mode: 'new' }));
    setModalDate(existing ? date : null);
  }

  async function submit() {
    if (busy || !user) return;
    if (!num(form.hours)) return setError('צריך למלא שעות משמרת.');
    if (form.calls === '') return setError('צריך למלא כמות שיחות.');
    if (!Object.keys(form.tasks).some((k) => form.tasks[k].on))
      return setError('צריך לסמן לפחות משימה אחת.');
    if (!form.mood) return setError('צריך לדרג איך עבר היום.');
    if (form.mood <= 7 && !form.moodText.trim())
      return setError('בדירוג 7 ומטה חובה לכתוב פירוט על היום.');

    const entries: Record<string, TaskEntry> = {};
    Object.keys(form.tasks).forEach((tid) => {
      const t = db.tasks.find((y) => y.id === tid);
      const e = form.tasks[tid];
      if (!t || !e.on) return;
      const nums: Record<number, number> = {};
      Object.keys(e.nums).forEach((k) => (nums[Number(k)] = num(e.nums[Number(k)])));
      entries[tid] = {
        on: true,
        nums,
        resets: { ...e.resets },
        time: t.timeMode === 'windows' ? 2 : num(e.time),
        window: e.window,
        note: e.note,
      };
    });

    const existing = reportOn(form.date);
    const base: Report = {
      id: existing?.id || uid('rep'),
      userId,
      date: form.date,
      place: form.place,
      hours: num(form.hours),
      hoursNote: form.hoursNote,
      calls: num(form.calls),
      mood: form.mood,
      moodText: form.moodText,
      tasks: entries,
      idea: form.idea,
      ideaAnon: form.ideaAnon,
      ideaStatus: existing?.ideaStatus || 'open',
      ideaReply: existing?.ideaReply || '',
      ideaDocId: existing?.ideaDocId,
      timestamp: new Date().toISOString(),
    };

    setBusy(true);
    try {
      if (form.mode === 'append' && existing) {
        // Quantities, hours and calls are summed; resets are OR-ed; texts are
        // concatenated with ' · '; the new mood rating replaces the old one.
        const merged: Report = {
          ...existing,
          hours: r1(num(existing.hours) + num(form.hours)),
          calls: num(existing.calls) + num(form.calls),
          mood: form.mood,
          moodText: [existing.moodText, form.moodText].filter(Boolean).join(' · '),
          idea: [existing.idea, form.idea].filter(Boolean).join(' · '),
          timestamp: base.timestamp,
          tasks: { ...existing.tasks },
        };
        Object.keys(entries).forEach((tid) => {
          const cur = merged.tasks[tid];
          if (!cur) {
            merged.tasks[tid] = entries[tid];
            return;
          }
          const next: TaskEntry = {
            on: true,
            time: r1(num(cur.time) + num(entries[tid].time)),
            nums: { ...cur.nums },
            resets: { ...cur.resets },
            window: entries[tid].window || cur.window,
            note: [cur.note, entries[tid].note].filter(Boolean).join(' · '),
          };
          Object.keys(entries[tid].nums).forEach((k) => {
            const i = Number(k);
            next.nums[i] = num(next.nums[i]) + num(entries[tid].nums[i]);
          });
          Object.keys(entries[tid].resets).forEach((k) => {
            const i = Number(k);
            next.resets[i] = next.resets[i] || entries[tid].resets[i];
          });
          merged.tasks[tid] = next;
        });
        await replaceReport(existing.id, merged, db.tasks, user.name);
        await persistIdea(merged, existing);
      } else if (existing) {
        await replaceReport(existing.id, base, db.tasks, user.name);
        await persistIdea(base, existing);
      } else {
        const docId = await createReport(base, db.tasks, user.name);
        await persistIdea({ ...base, id: docId }, null);
      }
      ui.flash(form.mode === 'append' ? 'הנתונים נוספו לדיווח של אותו יום.' : 'הדיווח נשמר. תודה!');
      setForm(blankForm(db.tasks, form.date, 'edit', reportOn(form.date) || base));
    } catch (e) {
      setError('שמירת הדיווח נכשלה: ' + ((e as Error)?.message || 'שגיאה'));
    } finally {
      setBusy(false);
    }
  }

  async function persistIdea(rep: Report, existing: Report | null) {
    const text = rep.idea.trim();
    if (!text || !user) return;
    if (existing?.ideaDocId) {
      await setDoc(
        docRef('ideas', existing.ideaDocId),
        {
          improvementText: text,
          isAnonymous: rep.ideaAnon,
          authorId: rep.ideaAnon ? 'anonymous' : userId,
          authorName: rep.ideaAnon ? 'אנונימי' : user.name,
        },
        { merge: true },
      );
      if (rep.ideaReply) await setIdeaReply(existing.ideaDocId, rep.ideaReply);
      return;
    }
    await saveIdea({
      reportId: rep.id,
      userId,
      userName: user.name,
      date: rep.date,
      text,
      anon: rep.ideaAnon,
    });
  }

  const existingForModal = modalDate ? reportOn(modalDate) : null;

  return (
    <>
      {/* top bar */}
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid ${C.border}`,
          padding: '16px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted }}>תאריך הדיווח</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
              <span
                style={{
                  fontSize: 19,
                  fontWeight: 700,
                  letterSpacing: '-.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                {fmtFull(form.date)}
              </span>
              {form.date === yesterday() && <Badge>אתמול</Badge>}
              {form.mode === 'edit' && (
                <Badge color="#fff" bg={C.ink2}>
                  עריכת דיווח קיים
                </Badge>
              )}
              {form.mode === 'append' && (
                <Badge color="#fff" bg={C.ink2}>
                  הוספה לדיווח קיים
                </Badge>
              )}
              <input
                type="date"
                value={form.date}
                max={today()}
                onChange={(e) => pickDate(e.target.value)}
                style={{
                  fontSize: 13,
                  color: C.ink,
                  border: `1px solid ${C.borderStrong}`,
                  borderRadius: 999,
                  padding: '6px 12px',
                  background: '#fff',
                }}
              />
            </div>
          </div>
          <span style={{ width: 1, height: 38, background: C.border }} />
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, maxWidth: 250 }}>
            ברירת המחדל היא אתמול. אפשר להחליף ליום אחר, כולל תאריכים מהעבר.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' }}>
            {form.mode === 'edit'
              ? 'עריכה של דיווח שנשמר'
              : form.mode === 'append'
                ? 'הנתונים יתווספו לדיווח הקיים'
                : 'טיוטה — לא נשלח עדיין'}
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: '#fff',
              background: C.brand,
              borderRadius: 999,
              padding: '10px 28px',
              whiteSpace: 'nowrap',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {form.mode === 'edit'
              ? 'שמירת השינויים'
              : form.mode === 'append'
                ? 'הוספה לדיווח'
                : 'שליחת דיווח'}
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 40px 40px' }}>
        {error && <ErrorBanner text={error} />}

        {/* thin shift strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            background: '#fff',
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 18px',
              borderInlineEnd: `1px solid ${C.border}`,
              background: C.surface,
              fontSize: 11.5,
              color: C.muted,
            }}
          >
            פרטי משמרת
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 18px',
              borderInlineEnd: `1px solid ${C.border}`,
            }}
          >
            {(['משרד', 'בית'] as const).map((p) => (
              <Pill key={p} label={p} active={form.place === p} onClick={() => patch({ place: p })} />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderInlineEnd: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: 11.5, color: C.muted }}>שעות</span>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={form.hours}
              onChange={(e) => patch({ hours: e.target.value })}
              style={{
                width: 64,
                fontSize: 17,
                fontWeight: 700,
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                padding: '4px 0',
                background: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '8px 18px' }}>
            <input
              value={form.hoursNote}
              onChange={(e) => patch({ hoursNote: e.target.value })}
              placeholder="הערה לשעות (לא חובה)"
              style={{
                width: '100%',
                fontSize: 12.5,
                border: 'none',
                background: 'none',
                padding: '6px 0',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'flex-start' }}>
          {/* 01 tasks */}
          <Card style={{ flex: 1 }}>
            <SectionHead
              num="01"
              title="משימות שביצעת"
              hint={onCount ? `${onCount} משימות סומנו` : 'סמן/י משימה כדי לפתוח את השדות שלה'}
            />
            {activeTasks.map((t) => {
              const e = form.tasks[t.id] || {
                on: false,
                nums: {},
                resets: {},
                time: '',
                window: '',
                note: '',
              };
              const hintBits: string[] = [];
              if (t.nums.length) hintBits.push('כמות');
              if (t.resets.length) hintBits.push('איפסתי כן/לא');
              if (t.time) hintBits.push(t.timeMode === 'windows' ? 'חלון שעות' : 'זמן');
              if (t.note) hintBits.push('הערה');

              if (!e.on) {
                return (
                  <div key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px' }}
                    >
                      <Checkbox on={false} onClick={() => patchTask(t.id, { on: true })} />
                      <span style={{ flex: 1, fontSize: 14.5, color: C.muted }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: C.muted2 }}>{hintBits.join(' · ')}</span>
                    </div>
                  </div>
                );
              }

              const timeSummary =
                t.timeMode === 'windows'
                  ? e.window || t.windows[0] || ''
                  : `${num(e.time) || 0} שעות`;

              return (
                <div key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '13px 22px',
                      background: C.brandTint2,
                    }}
                  >
                    <Checkbox on onClick={() => patchTask(t.id, { on: false })} />
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{t.name}</span>
                    <span style={{ fontSize: 11.5, color: C.muted }}>{timeSummary}</span>
                  </div>
                  <div style={{ padding: '4px 22px 16px 54px' }}>
                    {t.nums.map((label, i) => {
                      const rate = targets[t.id] ?? t.perHour ?? 0;
                      const hint =
                        t.targetType === 'perHour'
                          ? `יעד: ${Math.round(num(e.time) * rate)} לפי ${rate} לשעה`
                          : '';
                      return (
                        <div key={i} style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: 12,
                              borderBottom: `1.5px solid ${C.brand}`,
                              paddingBottom: 5,
                              marginTop: 4,
                              maxWidth: 420,
                            }}
                          >
                            <input
                              type="number"
                              min="0"
                              value={e.nums[i] ?? ''}
                              onChange={(ev) =>
                                patchTask(t.id, { nums: { ...e.nums, [i]: ev.target.value } })
                              }
                              style={{
                                width: 96,
                                fontSize: 24,
                                fontWeight: 800,
                                letterSpacing: '-.03em',
                                border: 'none',
                                background: 'none',
                                padding: '2px 0',
                              }}
                            />
                            <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>
                          </div>
                        </div>
                      );
                    })}

                    {t.resets.map((label, i) => (
                      <div
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}
                      >
                        <span style={{ fontSize: 13.5 }}>{label}</span>
                        <YesNo
                          yes={!!e.resets[i]}
                          onYes={() => patchTask(t.id, { resets: { ...e.resets, [i]: true } })}
                          onNo={() => patchTask(t.id, { resets: { ...e.resets, [i]: false } })}
                        />
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-end' }}>
                      {t.time && t.timeMode === 'hours' && (
                        <div style={{ width: 120 }}>
                          {/* Explicit unit: the old form asked for minutes. */}
                          <div style={{ fontSize: 12, color: C.muted }}>זמן במשימה (שעות)</div>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={e.time}
                            onChange={(ev) => patchTask(t.id, { time: ev.target.value })}
                            style={{
                              width: '100%',
                              fontSize: 16,
                              fontWeight: 700,
                              border: 'none',
                              borderBottom: `1px solid ${C.border}`,
                              padding: '6px 0',
                              background: 'none',
                            }}
                          />
                        </div>
                      )}
                      {t.time && t.timeMode === 'windows' && (
                        <div style={{ width: 220 }}>
                          <div style={{ fontSize: 12, color: C.muted }}>
                            באיזה שעות עשית את המשימה
                          </div>
                          <select
                            value={e.window}
                            onChange={(ev) => patchTask(t.id, { window: ev.target.value })}
                            style={{
                              width: '100%',
                              fontSize: 14,
                              fontWeight: 600,
                              border: `1px solid ${C.borderStrong}`,
                              borderRadius: 999,
                              padding: '8px 14px',
                              background: '#fff',
                              marginTop: 5,
                            }}
                          >
                            {t.windows.map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {t.note && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: C.muted }}>הערה למשימה</div>
                          <input
                            value={e.note}
                            onChange={(ev) => patchTask(t.id, { note: ev.target.value })}
                            placeholder="לא חובה"
                            style={{
                              width: '100%',
                              fontSize: 13.5,
                              border: 'none',
                              borderBottom: `1px solid ${C.border}`,
                              padding: '7px 0',
                              background: 'none',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* 02 calls + targets */}
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand }}>02</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>שיחות</span>
              </div>
              <input
                type="number"
                min="0"
                value={form.calls}
                onChange={(e) => patch({ calls: e.target.value })}
                style={{
                  width: '100%',
                  fontSize: 48,
                  fontWeight: 800,
                  letterSpacing: '-.04em',
                  border: 'none',
                  background: 'none',
                  padding: '4px 0',
                  marginTop: 2,
                }}
              />
              <div
                style={{
                  paddingTop: 12,
                  borderTop: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12.5,
                  color: C.muted,
                }}
              >
                <span>צפי לפי המשימות</span>
                <span style={{ fontWeight: 700, color: C.ink }}>{expected}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar
                  width={
                    expected
                      ? Math.min(100, Math.round((num(form.calls) / expected) * 100)) + '%'
                      : '0%'
                  }
                />
              </div>
            </Card>

            <Card style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>היעדים שלך היום</div>
              {[
                {
                  label: `פטל · ${targets.patel} לשעה`,
                  value: `${patelQty} / ${patelGoal}`,
                  good: patelGoal > 0 && patelQty >= patelGoal,
                },
                {
                  label: `בוט · ${targets.bot} לשעה`,
                  value: `${botQty} / ${botGoal}`,
                  good: botGoal > 0 && botQty >= botGoal,
                },
                {
                  label: `שיחות · ${targets.calls} לשעה`,
                  value: `${num(form.calls)} / ${Math.round(hours * targets.calls)}`,
                  good: hours > 0 && num(form.calls) >= hours * targets.calls,
                },
                {
                  label: 'איפוסים שסומנו',
                  value: `${rDone} / ${rTotal}`,
                  good: rTotal > 0 && rDone === rTotal,
                },
              ].map((g) => (
                <div
                  key={g.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 0',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{g.label}</span>
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: g.good ? C.success : C.ink }}
                  >
                    {g.value}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.65, marginTop: 10 }}>
                היעדים מחושבים מהשעות שדיווחת.
              </div>
            </Card>
          </div>
        </div>

        {/* 03 mood + 04 idea */}
        <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'stretch' }}>
          <Card accent={C.brand} style={{ flex: 1.55, padding: '26px 28px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand }}>03</span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>
                  איך עבר עליך היום?
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  זה החלק שהמנהל קורא קודם. אין תשובה נכונה — רק תשובה כנה.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 22 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={String(n)}
                  onClick={() => patch({ mood: n })}
                  style={{
                    flex: 1,
                    height: 46,
                    background: form.mood === n ? C.brand : C.idleBar,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                fontSize: 12,
                color: C.muted,
              }}
            >
              <span>1 · יום קשה</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.brand }}>
                {form.mood ? `${form.mood} · ${moodWord(form.mood)}` : 'לא דורג'}
              </span>
              <span>10 · יום מעולה</span>
            </div>
            <div style={{ marginTop: 22, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>אשמח לפירוט על היום שלך!</span>
                {form.mood > 0 && form.mood <= 7 && <Badge>חובה בדירוג 7 ומטה</Badge>}
              </div>
              <textarea
                value={form.moodText}
                onChange={(e) => patch({ moodText: e.target.value })}
                placeholder="מה עמד מאחורי המספר?"
                style={{
                  width: '100%',
                  minHeight: 76,
                  fontSize: 14,
                  lineHeight: 1.7,
                  border: 'none',
                  borderBottom: `1.5px solid ${C.brand}`,
                  padding: '10px 0',
                  background: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
                נראה למנהל הצוות בלבד
              </div>
            </div>
          </Card>

          <Card style={{ flex: 1, padding: '26px 28px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand }}>04</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                  רעיון לשיפור
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  לא חובה — אבל אם עולה לך משהו, זה המקום.
                </div>
              </div>
            </div>
            <textarea
              value={form.idea}
              onChange={(e) => patch({ idea: e.target.value })}
              placeholder="מה היית משנה בעבודה?"
              style={{
                flex: 1,
                width: '100%',
                minHeight: 110,
                fontSize: 14,
                lineHeight: 1.7,
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                padding: '14px 0',
                background: 'none',
                resize: 'vertical',
                marginTop: 8,
              }}
            />
            <button
              type="button"
              onClick={() => patch({ ideaAnon: !form.ideaAnon })}
              style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}
            >
              <Checkbox on={form.ideaAnon} size={15} />
              <span style={{ fontSize: 13, color: C.ink2 }}>שליחה אנונימית</span>
            </button>
          </Card>
        </div>
      </div>

      {modalDate && existingForModal && (
        <Modal>
          <div style={{ padding: '26px 30px 22px' }}>
            <div style={{ fontSize: 11.5, color: C.muted }}>{fmtFull(modalDate)}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', marginTop: 5 }}>
              כבר קיים דיווח בתאריך הזה
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.75, color: C.ink2 }}>
              {`דיווחת באותו יום: ${existingForModal.calls} שיחות, ${existingForModal.hours} שעות, מצב רוח ${existingForModal.mood}. מה תרצה/י לעשות?`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setForm(blankForm(db.tasks, modalDate, 'edit', existingForModal));
              setModalDate(null);
            }}
            style={choice}
          >
            <span
              style={{
                width: 16,
                height: 16,
                background: C.brand,
                display: 'block',
                marginTop: 3,
                flexShrink: 0,
              }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>
                עריכת הדיווח הקיים
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 13,
                  color: C.muted,
                  lineHeight: 1.65,
                  marginTop: 3,
                }}
              >
                הטופס ייפתח עם כל מה שהזנת אז — כמויות, איפוסים, הערות והפירוט.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setForm({ ...blankForm(db.tasks, modalDate, 'new', null), mode: 'append' });
              setModalDate(null);
            }}
            style={choice}
          >
            <span
              style={{
                width: 16,
                height: 16,
                border: `1.5px solid ${C.checkbox}`,
                display: 'block',
                marginTop: 3,
                flexShrink: 0,
              }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>
                הוספת נתונים לאותו יום
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 13,
                  color: C.muted,
                  lineHeight: 1.65,
                  marginTop: 3,
                }}
              >
                טופס ריק שהנתונים שתמלאי יתווספו לדיווח הקיים — שיחות, שעות וכמויות מסתכמים.
              </span>
            </span>
          </button>
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              padding: '16px 30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: C.surface,
            }}
          >
            <button
              type="button"
              onClick={() => setModalDate(null)}
              style={{ fontSize: 13, color: C.muted }}
            >
              ביטול
            </button>
            <span style={{ fontSize: 11.5, color: C.muted }}>בחר/י אפשרות כדי להמשיך</span>
          </div>
        </Modal>
      )}
    </>
  );
}

const choice: React.CSSProperties = {
  width: '100%',
  textAlign: 'start',
  borderTop: `1px solid ${C.border}`,
  padding: '18px 30px',
  display: 'flex',
  gap: 14,
  background: '#fff',
};

import { useEffect, useMemo, useRef } from 'react';
import { C } from '@/ui/tokens';
import { Card, Empty } from '@/ui/primitives';
import { CallsChart, ChartLegend, MoodScale, Sparkline } from '@/ui/Charts';
import { RangeBar } from '@/ui/RangeBar';
import { useDb } from '@/state/store';
import { useUi, useRangeState } from '@/state/ui';
import { useAuth } from '@/auth/AuthContext';
import { aggregate, barsFor, expectedFor, hourlyTargetTasks, qtyOf, rateFor, resetStats, targetsFor } from '@/domain/calc';
import { inRange, rangeLabel, unitLabel } from '@/domain/range';
import { fmtFull, yesterday } from '@/lib/date';
import { r1, signed } from '@/lib/num';

/**
 * "הנתונים שלי". Two different layouts: a range view (week / month / custom)
 * built on averages, and a single-day view — because averages are meaningless
 * for one day.
 */
export function MyData() {
  const db = useDb();
  // Opens on yesterday's single-day view: an employee coming here wants to see
  // the shift they just reported, not a weekly average. Only on the first
  // visit — after that the range the employee picked is respected.
  const seeded = useRef(false);
  const ui = useUi();
  const range = useRangeState();

  const { user } = useAuth();
  const userId = user?.id || '';

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    ui.setRange('day', yesterday());
  }, [ui]);

  const mine = useMemo(
    () =>
      db.reports
        .filter((r) => r.userId === userId && (r.hours || r.calls))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.reports, userId],
  );
  const reps = mine.filter((r) => inRange(range, r.date));
  const agg = aggregate(db.tasks, reps);
  const tg = targetsFor(db, userId);
  const label = rangeLabel(range);
  const latest = mine.length ? mine[mine.length - 1].date : undefined;

  const dayRep = range.range === 'day' ? mine.find((r) => r.date === range.anchor) : undefined;
  const moodAvg = (() => {
    const m = mine.filter((r) => r.mood);
    return m.length ? r1(m.reduce((a, b) => a + b.mood, 0) / m.length) : null;
  })();

  return (
    <>
      <RangeBar latestDate={latest} />
      {range.range === 'day' ? (
        dayRep ? (
          <DayView rep={dayRep} moodAvg={moodAvg} label={label} />
        ) : (
          <div style={{ padding: '60px 40px' }}>
            <Card style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>אין דיווח בתאריך הזה</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
                אפשר לעבור ליום אחר, או להוסיף דיווח דרך מסך "דיווח יומי".
              </div>
            </Card>
          </div>
        )
      ) : (
        <>
          {/* hero */}
          <div style={{ background: C.brand, padding: '26px 40px 30px', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: C.onBrandSoft }}>
              {label} · {agg.n} ימי דיווח
            </div>
            <div
              style={{
                fontSize: 56,
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
              שיחות {unitLabel(range.range)} · הצפי לפי המשימות שלך: {agg.expected} (
              {signed(agg.vsExp)})
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {[
                  { v: agg.patel, l: 'פטל שקבעת' },
                  { v: agg.cph ?? '—', l: 'שיחות לשעה' },
                  { v: agg.mood ?? '—', l: 'מצב רוח ממוצע' },
                  { v: agg.resetPct === null ? '—' : agg.resetPct + '%', l: 'אחוז איפוס משימות' },
                ].map((k, i) => (
                  <span key={k.l} style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <span style={{ width: 1, height: 36, background: C.onBrandRule }} />}
                    <span style={{ padding: '0 28px' }}>
                      <span
                        style={{ display: 'block', fontSize: 23, fontWeight: 800, color: '#fff' }}
                      >
                        {k.v}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11.5,
                          color: C.onBrandSoft,
                          marginTop: 2,
                        }}
                      >
                        {k.l}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '22px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card style={{ padding: '20px 24px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700 }}>השיחות שלי מול הצפי</div>
                  <ChartLegend />
                </div>
                <CallsChart bars={barsFor(db.tasks, reps)} />
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
                  <span style={{ fontSize: 16, fontWeight: 700 }}>פילוח לפי משימות</span>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{label}</span>
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
                  <span style={{ flex: 1 }}>משימה</span>
                  <span style={{ width: 130 }}>מה דיווחת</span>
                  <span style={{ width: 70 }}>שעות</span>
                  <span style={{ width: 170 }}>מול היעד / איפוס</span>
                </div>
                {db.tasks
                  .filter((t) => t.active)
                  .map((t) => {
                    let qty = 0;
                    let hours = 0;
                    let rTotal = 0;
                    let rDone = 0;
                    let used = 0;
                    reps.forEach((r) => {
                      const e = r.tasks[t.id];
                      if (!e?.on) return;
                      used++;
                      qty += Number(e.nums?.[0] || 0);
                      hours += Number(e.time || 0);
                      t.resets.forEach((_l, i) => {
                        rTotal++;
                        if (e.resets?.[i]) rDone++;
                      });
                    });
                    if (!used) return null;
                    const rate = tg.values[t.id] ?? t.perHour ?? 0;
                    const goal = t.targetType === 'perHour' ? Math.round(hours * rate) : 0;
                    const p = goal ? Math.round((qty / goal) * 100) : null;
                    const resetTxt = rTotal ? `אופס ${rDone} מתוך ${rTotal}` : '—';
                    const resetBad = rTotal > 0 && rDone < rTotal;
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px 24px',
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                        <span style={{ width: 130, fontSize: 13.5 }}>
                          {t.nums.length ? `${qty} ${t.name}` : 'איפוס בלבד'}
                        </span>
                        <span style={{ width: 70, fontSize: 13.5 }}>{r1(hours)}</span>
                        <span style={{ width: 170 }}>
                          {p !== null ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ flex: 1, height: 6, background: C.track, display: 'block' }}>
                                <span
                                  style={{
                                    display: 'block',
                                    height: 6,
                                    background: p >= 100 ? C.success : C.brand,
                                    width: Math.min(100, p) + '%',
                                  }}
                                />
                              </span>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  color: p >= 100 ? C.success : C.brand,
                                }}
                              >
                                {p}%
                              </span>
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 12.5,
                                color: resetBad ? C.danger : C.success,
                                fontWeight: resetBad ? 600 : 400,
                              }}
                            >
                              {resetTxt}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                {!reps.length && <Empty text="אין דיווחים בטווח הזה." />}
              </Card>
            </div>

            <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card accent={C.brand}>
                <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}` }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700 }}>היעדים שלי לשעה</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: tg.personal ? C.brand : C.muted,
                        background: tg.personal ? C.brandTint : C.idleBar,
                        borderRadius: 3,
                        padding: '2px 7px',
                      }}
                    >
                      {tg.personal ? 'יעד אישי' : 'יעד הצוות'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                    מה מצופה לכל שעת עבודה · לא צריך לדווח את זה
                  </div>
                </div>
                {hourlyTargetTasks(db).map((t) => {
                  const g = { label: t.name, v: rateFor(db, userId, t), unit: 'לשעה' };
                  return (
                  <div
                    key={g.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 22px',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <span style={{ fontSize: 13.5 }}>{g.label}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{g.v}</span>
                      <span style={{ fontSize: 11.5, color: C.muted }}>{g.unit}</span>
                    </span>
                  </div>
                  );
                })}
                {!hourlyTargetTasks(db).length && (
                  <div style={{ padding: '12px 22px', fontSize: 13, color: C.muted }}>
                    לא הוגדרו יעדים לשעה.
                  </div>
                )}
                <div style={{ padding: '12px 22px', fontSize: 11.5, color: C.muted, lineHeight: 1.65 }}>
                  משימות איפוס — אין יעד כמותי, רק לאפס. השיחות נמדדות מול הצפי לפי המשימות.
                </div>
              </Card>

              <Card style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>מצב הרוח שלי לאורך זמן</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                  12 הדיווחים האחרונים
                </div>
                <Sparkline bars={barsFor(db.tasks, mine.slice(-12))} />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 7,
                    fontSize: 11,
                    color: C.muted,
                  }}
                >
                  <span>לפני כמה שבועות</span>
                  <span>אחרון · {mine.length ? mine[mine.length - 1].mood : '—'}</span>
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
                  הדיווחים שלי בטווח
                </div>
                {reps
                  .slice()
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 6)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => ui.setRange('day', r.date)}
                      style={{
                        width: '100%',
                        textAlign: 'start',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '13px 22px',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <span>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
                          {fmtFull(r.date)}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11.5,
                            color: C.muted,
                            marginTop: 2,
                          }}
                        >
                          {r.calls} שיחות · {qtyOf(r, 'patel')} פטל · {r.hours} ש׳
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: r.mood <= 6 ? C.brand : C.ink,
                        }}
                      >
                        {r.mood}
                      </span>
                    </button>
                  ))}
                {!reps.length && <Empty text="אין דיווחים בטווח הזה." />}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DayView({
  rep,
  moodAvg,
  label,
}: {
  rep: import('@/types/models').Report;
  moodAvg: number | null;
  label: string;
}) {
  const db = useDb();
  const ui = useUi();
  const { user } = useAuth();
  const expected = expectedFor(db.tasks, rep);
  const rs = resetStats(db.tasks, rep);
  const note = db.notes.filter((n) => n.to === user?.id).slice(-1)[0];

  return (
    <>
      <div style={{ background: C.brand, padding: '24px 40px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.onBrandSoft }}>
              {label} · {rep.place} · {rep.hours} שעות
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '-.035em',
                  lineHeight: 1.05,
                }}
              >
                {rep.calls}
              </span>
              <span style={{ fontSize: 15, color: '#fff' }}>
                שיחות · הצפי ליום הזה היה {expected}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,.6)',
                  borderRadius: 999,
                  padding: '4px 12px',
                }}
              >
                {expected ? signed(Math.round(((rep.calls - expected) / expected) * 100)) : '—'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[
              { v: qtyOf(rep, 'patel'), l: 'פטל שקבעת' },
              { v: rep.hours ? r1(rep.calls / rep.hours) : 0, l: 'שיחות לשעה' },
              { v: rep.mood, l: `מצב רוח · ממוצע ${moodAvg ?? '—'}` },
              { v: `${rs.done} / ${rs.total}`, l: 'איפוסים שסומנו' },
            ].map((k, i) => (
              <span key={k.l} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ width: 1, height: 34, background: C.onBrandRule }} />}
                <span style={{ padding: '0 24px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: 22, fontWeight: 800, color: '#fff' }}>
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

      <div style={{ padding: '22px 40px 36px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1 }}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700 }}>מה דיווחת באותו יום</span>
            <button
              type="button"
              onClick={() => ui.requestEdit(rep.date)}
              style={{ fontSize: 12.5, color: C.brand, fontWeight: 600 }}
            >
              עריכת הדיווח
            </button>
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
            <span style={{ width: 150 }}>משימה</span>
            <span style={{ width: 110 }}>כמות</span>
            <span style={{ width: 104 }}>זמן</span>
            <span style={{ width: 200 }}>איפוס</span>
            <span style={{ flex: 1 }}>ההערה שכתבת</span>
          </div>
          {Object.keys(rep.tasks).map((tid) => {
            const t = db.tasks.find((x) => x.id === tid);
            const e = rep.tasks[tid];
            if (!t || !e.on) return null;
            const bad = t.resets.some((_l, i) => !e.resets?.[i]);
            const resetTxt = t.resets.length
              ? t.resets.length === 1
                ? e.resets?.[0]
                  ? 'אופס ✓'
                  : 'לא אופס ✗'
                : t.resets
                    .map(
                      (lbl, i) =>
                        lbl.replace('האם איפסת', '').replace('את', '').trim() +
                        ' ' +
                        (e.resets?.[i] ? '✓' : '✗'),
                    )
                    .join(' · ')
              : '—';
            return (
              <div
                key={tid}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '12px 24px',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ width: 150, fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
                  {t.name}
                </span>
                <span style={{ width: 110, fontSize: 13.5 }}>
                  {t.nums.length ? `${e.nums?.[0] ?? 0} ${t.name}` : 'איפוס בלבד'}
                </span>
                <span style={{ width: 104, fontSize: 12.5 }}>
                  {t.timeMode === 'windows' ? e.window || '' : `${e.time} ש׳`}
                </span>
                <span
                  style={{
                    width: 200,
                    fontSize: 12.5,
                    color: bad ? C.danger : C.success,
                    fontWeight: bad ? 600 : 400,
                  }}
                >
                  {resetTxt}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
                  {e.note || '—'}
                </span>
              </div>
            );
          })}
        </Card>

        <div style={{ width: 378, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card accent={C.brand} style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>איך עבר עליך היום</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{rep.mood} / 10</span>
            </div>
            <MoodScale value={rep.mood} />
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
              הממוצע שלך: {moodAvg ?? '—'}
            </div>
            <p
              style={{
                margin: '14px 0 0',
                fontSize: 14,
                lineHeight: 1.75,
                paddingTop: 14,
                borderTop: `1px solid ${C.border}`,
              }}
            >
              {rep.moodText || '—'}
            </p>
          </Card>

          {note && (
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>הערה אחרונה מהמנהל</div>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.75, color: C.ink2 }}>
                {note.text}
              </p>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>
                {note.date ? fmtFull(note.date) : ''}
              </div>
            </Card>
          )}

          {rep.idea && (
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>הרעיון שהעלית באותו יום</div>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.75, color: C.ink2 }}>
                {rep.idea}
              </p>
              {rep.ideaReply && (
                <div
                  style={{
                    marginTop: 12,
                    background: C.surface,
                    padding: '10px 12px',
                    fontSize: 13,
                    lineHeight: 1.7,
                  }}
                >
                  <strong style={{ fontWeight: 700 }}>תגובת המנהל: </strong>
                  {rep.ideaReply}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

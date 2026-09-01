import type { Db, Report } from '@/types/models';
import { type Aggregate } from './calc';

/**
 * The generated Hebrew paragraph the manager reads before any number.
 * Built from: calls vs expected, פטל vs the pro-rated team goal, reset
 * percentage, the worst un-cleared task, average mood and the lowest-mood
 * employee.
 */
export function rangeSummary(params: {
  agg: Aggregate;
  patelGoal: number;
  worstUnreset?: { label: string; n: number };
  lowestMood?: { name: string; mood: number };
}): string {
  const { agg, patelGoal, worstUnreset, lowestMood } = params;
  const patelPct = patelGoal ? Math.round((agg.patel / patelGoal) * 100) : 0;
  return (
    'הצוות עשה ' +
    agg.calls +
    ' שיחות מול צפי של ' +
    agg.expected +
    ' (' +
    (agg.vsExp >= 0 ? '+' : '') +
    agg.vsExp +
    '%), ' +
    agg.patel +
    ' פטל מול יעד צוותי של ' +
    patelGoal +
    ' (' +
    patelPct +
    '%). אחוז איפוס המשימות ' +
    (agg.resetPct === null ? '—' : agg.resetPct + '%') +
    (worstUnreset
      ? ', והחריגה הבולטת היא ' + worstUnreset.label + ' — ' + worstUnreset.n + ' פעמים שלא אופס'
      : '') +
    '. מצב הרוח הממוצע ' +
    (agg.mood === null ? '—' : agg.mood) +
    (lowestMood ? ', הנמוך ביותר אצל ' + lowestMood.name + ' (' + lowestMood.mood + ')' : '') +
    '.'
  );
}

export interface UnresetRow {
  label: string;
  n: number;
  who: string;
  bad: boolean;
}

/** Which reset questions went unanswered, and by whom. Red at 4 or more. */
export function unresetRows(db: Db, reps: Report[]): UnresetRow[] {
  const unreset: Record<string, { n: number; who: Record<string, boolean> }> = {};
  reps.forEach((r) => {
    Object.keys(r.tasks || {}).forEach((tid) => {
      const t = db.tasks.find((x) => x.id === tid);
      const e = r.tasks[tid];
      if (!t || !e?.on) return;
      t.resets.forEach((lbl, i) => {
        if (e.resets?.[i]) return;
        // Multi-question tasks name the question; single-question tasks name themselves.
        const key = t.resets.length > 1 ? lbl.replace('האם איפסת', '').trim() : t.name;
        if (!unreset[key]) unreset[key] = { n: 0, who: {} };
        unreset[key].n++;
        const name = db.employees.find((x) => x.id === r.userId)?.name || '';
        if (name) unreset[key].who[name] = true;
      });
    });
  });
  return Object.keys(unreset)
    .sort((a, c) => unreset[c].n - unreset[a].n)
    .slice(0, 4)
    .map((k) => ({
      label: k,
      n: unreset[k].n,
      who: Object.keys(unreset[k].who).slice(0, 4).join(', '),
      bad: unreset[k].n >= 4,
    }));
}

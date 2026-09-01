import type { Db, HourlyTargets, ManualCount, Report, Task } from '@/types/models';
import { num, r1 } from '@/lib/num';
import { fmtShort } from '@/lib/date';

/**
 * The single place where the productivity model lives. Both roles and the
 * management report read from here, so the numbers can never disagree.
 */

export function findTask(tasks: Task[], id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

/** Hours credited to a task entry. Window-based tasks always count as 2 hours. */
export function entryHours(task: Task, time: unknown): number {
  return task.timeMode === 'windows' ? 2 : num(time);
}

/**
 * expected = Σ over reported tasks: hoursSpent * weight
 *
 * A weight is always calls per HOUR of the task — there is no per-unit weight.
 * The quantity an employee reports (how much פטל, how much בוט) never enters
 * this: an hour of a task is worth the same whatever came out of it.
 */
export function expectedFor(tasks: Task[], rep: Pick<Report, 'tasks'>): number {
  let x = 0;
  const entries = rep.tasks || {};
  Object.keys(entries).forEach((tid) => {
    const t = findTask(tasks, tid);
    const e = entries[tid];
    if (!t || !e || !e.on) return;
    x += entryHours(t, e.time) * t.weight;
  });
  return Math.round(x);
}

export interface ResetStats {
  total: number;
  done: number;
  pct: number | null;
}

export function resetStats(tasks: Task[], rep: Pick<Report, 'tasks'>): ResetStats {
  let total = 0;
  let done = 0;
  const entries = rep.tasks || {};
  Object.keys(entries).forEach((tid) => {
    const t = findTask(tasks, tid);
    const e = entries[tid];
    if (!t || !e || !e.on) return;
    t.resets.forEach((_lbl, i) => {
      total++;
      if (e.resets && e.resets[i]) done++;
    });
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : null };
}

export function qtyOf(rep: Report, tid: string): number {
  const e = (rep.tasks || {})[tid];
  return e && e.on ? num(e.nums && e.nums[0]) : 0;
}

export function hoursOf(rep: Report, tid: string): number {
  const e = (rep.tasks || {})[tid];
  return e && e.on ? num(e.time) : 0;
}

export interface Aggregate {
  n: number;
  calls: number;
  expected: number;
  hours: number;
  patel: number;
  bot: number;
  resetPct: number | null;
  cph: number | null;
  mood: number | null;
  vsExp: number;
}

export function aggregate(tasks: Task[], reps: Report[]): Aggregate {
  let calls = 0;
  let expected = 0;
  let hours = 0;
  let patel = 0;
  let bot = 0;
  let rTotal = 0;
  let rDone = 0;
  let moodSum = 0;
  let moodN = 0;
  reps.forEach((r) => {
    calls += num(r.calls);
    expected += expectedFor(tasks, r);
    hours += num(r.hours);
    patel += qtyOf(r, 'patel');
    bot += qtyOf(r, 'bot');
    const rs = resetStats(tasks, r);
    rTotal += rs.total;
    rDone += rs.done;
    if (r.mood) {
      moodSum += r.mood;
      moodN++;
    }
  });
  return {
    n: reps.length,
    calls,
    expected,
    hours: r1(hours),
    patel,
    bot,
    resetPct: rTotal ? Math.round((rDone / rTotal) * 100) : null,
    cph: hours ? r1(calls / hours) : null,
    mood: moodN ? r1(moodSum / moodN) : null,
    vsExp: expected ? Math.round(((calls - expected) / expected) * 100) : 0,
  };
}

/**
 * Hourly targets for one employee. A personal override wins over the team row;
 * clearing the override falls back to the team values.
 */
export function targetsFor(db: Db, userId: string): { values: HourlyTargets; personal: boolean } {
  const own = db.targets.byEmp[userId];
  return { values: own || db.targets.team, personal: !!own };
}

/**
 * The tasks that carry an hourly target, in the order the manager configured
 * them. This is what drives every "יעדים לשעה" list: a task the manager set to
 * "ללא יעד" disappears from all of them, and one given a per-hour target
 * appears without any code change.
 */
export function hourlyTargetTasks(db: Db): Task[] {
  return db.tasks.filter((t) => t.active && t.targetType === 'perHour');
}

/** Per-hour rate for a task: the employee's or team's override, else the task's own. */
export function rateFor(db: Db, userId: string, task: Task): number {
  const values = targetsFor(db, userId).values;
  const override = values[task.id];
  return num(override !== undefined ? override : (task.perHour ?? 0));
}

export interface Bar {
  h: string;
  fh: string;
  mh: string;
  label: string;
  low: boolean;
  color: string;
}

/** Last 10 reports as CSS bar heights: calls, expected marker, mood. */
export function barsFor(tasks: Task[], reps: Report[]): Bar[] {
  const list = reps
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-10);
  let max = 1;
  list.forEach((r) => {
    max = Math.max(max, num(r.calls), expectedFor(tasks, r));
  });
  return list.map((r) => {
    const exp = expectedFor(tasks, r);
    const low = num(r.calls) < exp * 0.9;
    return {
      h: Math.round((num(r.calls) / max) * 100) + '%',
      fh: Math.round((exp / max) * 100) + '%',
      mh: Math.round(((r.mood || 0) / 10) * 100) + '%',
      label: fmtShort(r.date),
      low,
      color: low ? '#C42A2A' : '#BD1854',
    };
  });
}

/**
 * Manual counts overlapping [from, to] are summed. Team-scope and
 * employee-scope entries are completely independent of one another.
 */
export function manualFor(
  counts: ManualCount[],
  scope: 'team' | 'emp',
  empId: string | null,
  from: string,
  to: string,
): { checklist: number; completions: number; benji: number; n: number } {
  const list = (counts || []).filter(
    (m) =>
      m.scope === scope &&
      (scope === 'team' || m.empId === empId) &&
      !(m.to < from || m.from > to),
  );
  const sum = { checklist: 0, completions: 0, benji: 0, n: list.length };
  list.forEach((m) => {
    sum.checklist += num(m.checklist);
    sum.completions += num(m.completions);
    sum.benji += num(m.benji);
  });
  return sum;
}

export const MANUAL_TASK_IDS = ['checklist', 'completions', 'benji'] as const;
export type ManualTaskId = (typeof MANUAL_TASK_IDS)[number];

export function isManualTask(id: string): id is ManualTaskId {
  return (MANUAL_TASK_IDS as readonly string[]).includes(id);
}

export function moodWord(n: number): string {
  return n <= 3 ? 'יום קשה' : n <= 6 ? 'יום סביר' : n <= 8 ? 'יום טוב' : 'יום מעולה';
}

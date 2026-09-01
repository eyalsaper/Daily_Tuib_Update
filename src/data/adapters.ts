/**
 * The translation boundary between the live Firestore documents (written by
 * `midrag-app-legacy.html`) and the domain model the UI works with.
 *
 * Nothing outside this module may know about legacy field names. Existing
 * documents are never rewritten: new writes keep every legacy field and only
 * ADD the fields the new model needs (`date`, per-task `taskId` and `window`).
 */

import type {
  AlertConfig,
  Employee,
  HourlyTargets,
  ManagerNote,
  ManualCount,
  MessageReply,
  Report,
  Task,
  TaskEntry,
  TeamMessage,
} from '@/types/models';
import { fromLegacyDate, toLegacyDate } from '@/lib/date';
import { num, r1 } from '@/lib/num';

/* ------------------------------------------------------------------ tasks */

/**
 * Ids for the seed task list. The legacy data keys tasks by their Hebrew name,
 * the new model keys them by a stable id — this is the bridge between the two.
 */
export const NAME_TO_ID: Record<string, string> = {
  'פטל': 'patel',
  'בוט': 'bot',
  'מענה איפוס וליקוט': 'mail',
  "צ'קליסט": 'checklist',
  'צ׳קליסט': 'checklist',
  'השלמות': 'completions',
  "בנג'י": 'benji',
  'בנג׳י': 'benji',
  'קבוצת בוט בזוהו': 'zohoBot',
  'קבוצת מענה בזוהו': 'zohoAns',
  'קיימת משימה עתידית': 'future',
  'משימות צוותים': 'teams',
};

/** The task list from the handoff, used when the project has no config yet. */
export const SEED_TASKS: Task[] = [
  { id: 'patel', name: 'פטל', nums: ['כמות פטל סה"כ (רגיל וקולקטיבי)'], resets: [], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'perHour', perHour: 4, teamWeekly: 275, weight: 2.4, active: true, visibleTo: 'all' },
  { id: 'bot', name: 'בוט', nums: ['כמה בוט קולקטיבי קבעת היום?'], resets: ['האם איפסת את המשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'perHour', perHour: 3, weight: 1.1, active: true, visibleTo: 'all' },
  { id: 'mail', name: 'מענה איפוס וליקוט', nums: [], resets: ['האם איפסת מייל', 'האם איפסת ריספונד'], time: true, timeMode: 'windows', windows: ['09:00–11:00', '11:00–13:00', '13:00–15:00'], note: true, targetType: 'none', weight: 9, active: true, visibleTo: 'all' },
  { id: 'checklist', name: "צ'קליסט", nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 3, active: true, visibleTo: 'all' },
  { id: 'completions', name: 'השלמות', nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 3, active: true, visibleTo: 'all' },
  { id: 'benji', name: "בנג'י", nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 2, active: true, visibleTo: 'all' },
  { id: 'zohoBot', name: 'קבוצת בוט בזוהו', nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 6, active: true, visibleTo: 'all' },
  { id: 'zohoAns', name: 'קבוצת מענה בזוהו', nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 8, active: true, visibleTo: 'all' },
  { id: 'future', name: 'קיימת משימה עתידית', nums: [], resets: ['האם איפסת את הרשימה'], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 2, active: true, visibleTo: 'all' },
  { id: 'teams', name: 'משימות צוותים', nums: ['כמות עסקים שטיפלתי בהם'], resets: [], time: true, timeMode: 'hours', windows: [], note: true, targetType: 'none', weight: 0.8, active: false, visibleTo: 'all' },
];

export interface LegacySchema {
  numFields?: string[];
  txtFields?: string[];
  cbFields?: string[];
  hasTime?: boolean;
  notes?: boolean;
  hasCustomTitle?: boolean;
}

export function idForName(name: string): string {
  return NAME_TO_ID[name] || 'task_' + String(name).replace(/[/.\s#$[\]]/g, '_');
}

/**
 * Build the task list.
 *
 * `tasksV2` is the new app's own configuration, stored alongside the legacy
 * `tasks` array on the same `team_configs/{team}` document. When it is absent
 * (first run against the live project) the list is derived from the legacy
 * schemas, enriched with the weights and targets from the handoff.
 */
export function buildTasks(
  schemas: Record<string, LegacySchema>,
  teamActive: string[],
  tasksV2?: Task[],
): Task[] {
  if (tasksV2 && tasksV2.length) return tasksV2.map(normaliseTask);

  const names = Object.keys(schemas || {});
  if (!names.length) return SEED_TASKS.map((t) => ({ ...t }));

  const active = new Set(teamActive || []);
  return names
    .filter((name) => !schemas[name]?.hasCustomTitle) // ad-hoc "זמן צוותי" is not a configured task
    .map((name) => {
      const s = schemas[name] || {};
      const id = idForName(name);
      const seed = SEED_TASKS.find((t) => t.id === id);
      return normaliseTask({
        id,
        name,
        nums: s.numFields || seed?.nums || [],
        resets: s.cbFields || seed?.resets || [],
        time: s.hasTime !== false,
        timeMode: seed?.timeMode || 'hours',
        windows: seed?.windows || [],
        note: s.notes !== false,
        targetType: seed?.targetType || 'none',
        perHour: seed?.perHour,
        teamWeekly: seed?.teamWeekly,
        weight: seed?.weight ?? 1,
        active: active.size ? active.has(name) : (seed?.active ?? true),
        visibleTo: 'all',
      });
    });
}

function normaliseTask(t: Task): Task {
  return {
    ...t,
    nums: t.nums || [],
    resets: t.resets || [],
    windows: t.windows || [],
    weight: num(t.weight),
    timeMode: t.timeMode === 'windows' ? 'windows' : 'hours',
    visibleTo: t.visibleTo === 'some' ? 'some' : 'all',
  };
}

/**
 * Firestore rejects `undefined` outright, and a task with no target carries
 * `perHour: undefined` / `teamWeekly: undefined`. Writing the list unfiltered
 * throws, which is how task configuration silently failed to save at all.
 */
export function tasksForStorage(tasks: Task[]): Task[] {
  return tasks.map((t) => {
    const out = { ...normaliseTask(t) } as Record<string, unknown>;
    Object.keys(out).forEach((k) => {
      if (out[k] === undefined) delete out[k];
    });
    return out as unknown as Task;
  });
}

/** The legacy schema map, regenerated from the new task list. */
export function tasksToLegacySchemas(
  tasks: Task[],
  existing: Record<string, LegacySchema>,
): Record<string, LegacySchema> {
  const out: Record<string, LegacySchema> = {};
  // Preserve schemas the new app does not model (e.g. the ad-hoc "זמן צוותי").
  Object.keys(existing || {}).forEach((k) => {
    if (existing[k]?.hasCustomTitle) out[k] = existing[k];
  });
  tasks.forEach((t) => {
    out[t.name] = {
      numFields: t.nums,
      txtFields: existing?.[t.name]?.txtFields || [],
      cbFields: t.resets,
      hasTime: t.time,
      notes: t.note,
    };
  });
  return out;
}

/* ----------------------------------------------------------------- report */

/**
 * The legacy form asks for time in MINUTES ("זמן שהושקע (דקות)") and stores it
 * that way; the domain model works in hours throughout. Convert at the boundary
 * in both directions — getting this wrong silently multiplies every
 * hours-based figure, including expected calls, by 60.
 */
export function minutesToHours(mins: unknown): number {
  return r1(num(mins) / 60);
}

export function hoursToMinutes(hours: unknown): number {
  return Math.round(num(hours) * 60);
}

interface LegacyTaskEntry {
  id?: string;
  taskId?: string;
  type?: string;
  customTitle?: string;
  notes?: string;
  timeSpent?: number;
  window?: string;
  numValues?: Record<string, number>;
  txtValues?: Record<string, string>;
  cbValues?: Record<string, boolean>;
}

export interface LegacyReport {
  id?: string;
  userId?: string;
  employeeName?: string;
  dateString?: string;
  /** Added by this app; legacy documents do not have it. */
  date?: string;
  timestamp?: string;
  mood?: number;
  moodScale?: number;
  workLocation?: string;
  totalHours?: number;
  totalCalls?: number;
  totalCallsNote?: string;
  hoursExplanation?: string;
  tasks?: LegacyTaskEntry[];
  ventingText?: string;
  /** Added by this app: when the form was actually submitted. */
  submittedAt?: string;
}

/**
 * Legacy document -> domain report.
 *
 * `tasks` is an ARRAY keyed by Hebrew task name with values keyed by question
 * label; the domain model is a map keyed by task id with values keyed by
 * question index. Matching is by `taskId` when present (documents this app
 * wrote), otherwise by name.
 */
export function reportFromLegacy(docId: string, d: LegacyReport, tasks: Task[]): Report {
  const entries: Record<string, TaskEntry> = {};
  (d.tasks || []).forEach((raw) => {
    const id = raw.taskId || (raw.type ? idForName(raw.type) : '');
    const task = tasks.find((t) => t.id === id) || tasks.find((t) => t.name === raw.type);
    if (!task) return; // ad-hoc "זמן צוותי" rows have no configured task — skip them
    const nums: Record<number, number> = {};
    task.nums.forEach((label, i) => {
      const v = raw.numValues?.[label];
      if (v !== undefined) nums[i] = num(v);
    });
    // Fall back to positional matching when a question label was renamed.
    if (!Object.keys(nums).length && raw.numValues) {
      Object.values(raw.numValues).forEach((v, i) => {
        if (i < task.nums.length) nums[i] = num(v);
      });
    }
    const resets: Record<number, boolean> = {};
    task.resets.forEach((label, i) => {
      const v = raw.cbValues?.[label];
      if (v !== undefined) resets[i] = !!v;
    });
    if (!Object.keys(resets).length && raw.cbValues) {
      Object.values(raw.cbValues).forEach((v, i) => {
        if (i < task.resets.length) resets[i] = !!v;
      });
    }
    const existing = entries[task.id];
    if (existing) {
      // Two rows for the same task in one legacy report: fold them together.
      existing.time = r1(existing.time + minutesToHours(raw.timeSpent));
      Object.keys(nums).forEach((k) => {
        const i = Number(k);
        existing.nums[i] = num(existing.nums[i]) + nums[i];
      });
      Object.keys(resets).forEach((k) => {
        const i = Number(k);
        existing.resets[i] = existing.resets[i] || resets[i];
      });
      existing.note = [existing.note, raw.notes].filter(Boolean).join(' · ');
      return;
    }
    entries[task.id] = {
      on: true,
      nums,
      resets,
      time: task.timeMode === 'windows' ? 2 : minutesToHours(raw.timeSpent),
      window: raw.window || (task.timeMode === 'windows' ? task.windows[0] : undefined),
      note: raw.notes || '',
    };
  });

  const date = d.date || (d.dateString ? fromLegacyDate(d.dateString) : '');
  return {
    id: docId,
    userId: d.userId || '',
    date,
    place: d.workLocation === 'בית' ? 'בית' : 'משרד',
    hours: num(d.totalHours),
    hoursNote: d.hoursExplanation || d.totalCallsNote || '',
    calls: num(d.totalCalls),
    mood: num(d.mood),
    moodText: d.ventingText || '',
    tasks: entries,
    idea: '',
    ideaAnon: false,
    ideaStatus: 'open',
    ideaReply: '',
    timestamp: d.timestamp || new Date(date || Date.now()).toISOString(),
  };
}

/**
 * Domain report -> legacy document. Every legacy field is written so the old
 * app keeps working, plus `date`, `taskId` and `window` for this one.
 */
export function reportToLegacy(rep: Report, tasks: Task[], employeeName: string): LegacyReport {
  const rows: LegacyTaskEntry[] = [];
  Object.keys(rep.tasks || {}).forEach((tid) => {
    const t = tasks.find((x) => x.id === tid);
    const e = rep.tasks[tid];
    if (!t || !e || !e.on) return;
    const numValues: Record<string, number> = {};
    t.nums.forEach((label, i) => {
      numValues[label] = num(e.nums?.[i]);
    });
    const cbValues: Record<string, boolean> = {};
    t.resets.forEach((label, i) => {
      cbValues[label] = !!e.resets?.[i];
    });
    rows.push({
      id: 'task_' + t.id,
      taskId: t.id,
      type: t.name,
      notes: e.note || '',
      // Written back in minutes, the unit the legacy app reads.
      timeSpent: hoursToMinutes(t.timeMode === 'windows' ? 2 : num(e.time)),
      window: e.window || '',
      numValues,
      txtValues: {},
      cbValues,
    });
  });

  return {
    id: rep.id,
    userId: rep.userId,
    employeeName,
    dateString: toLegacyDate(rep.date),
    date: rep.date,
    // `timestamp` is what every range query — this app's and the legacy app's —
    // filters on, so it has to describe the day being REPORTED, not the moment
    // the form was submitted. Backdating a report otherwise files it under the
    // week it was typed in. The submission time is kept separately.
    timestamp: rep.date + 'T12:00:00.000Z',
    submittedAt: rep.timestamp,
    mood: rep.mood,
    moodScale: 10,
    workLocation: rep.place,
    totalHours: num(rep.hours),
    totalCalls: num(rep.calls),
    totalCallsNote: '',
    hoursExplanation: rep.hoursNote || '',
    tasks: rows,
    ventingText: rep.moodText || '',
  };
}

/* ------------------------------------------------------------------ ideas */

export interface LegacyIdea {
  id?: string;
  timestamp?: string;
  dateString?: string;
  date?: string;
  isAnonymous?: boolean;
  authorName?: string;
  authorId?: string;
  improvementText?: string;
  isCompleted?: boolean;
  managerReply?: string;
  reportId?: string;
}

/**
 * Ideas live in their own collection, not on the report. They are joined back
 * onto the report by `reportId` when this app wrote them, otherwise by author
 * plus date, exactly as the legacy dashboard does.
 */
export function attachIdeas(reports: Report[], ideas: (LegacyIdea & { docId: string })[]): void {
  const byReportId = new Map<string, LegacyIdea & { docId: string }>();
  const byAuthorDate = new Map<string, LegacyIdea & { docId: string }>();
  ideas.forEach((i) => {
    if (i.reportId) byReportId.set(i.reportId, i);
    const date = i.date || (i.dateString ? fromLegacyDate(i.dateString) : '');
    if (i.authorId && i.authorId !== 'anonymous') byAuthorDate.set(i.authorId + '|' + date, i);
  });
  reports.forEach((r) => {
    const hit = byReportId.get(r.id) || byAuthorDate.get(r.userId + '|' + r.date);
    if (!hit) return;
    r.idea = hit.improvementText || '';
    r.ideaAnon = !!hit.isAnonymous;
    r.ideaStatus = hit.isCompleted ? 'done' : 'open';
    r.ideaReply = hit.managerReply || '';
    r.ideaDocId = hit.docId;
  });
}

/** Anonymous ideas cannot be joined to a report, so they are surfaced on their own. */
export function orphanIdeas(reports: Report[], ideas: (LegacyIdea & { docId: string })[]): Report[] {
  const used = new Set(reports.map((r) => r.ideaDocId).filter(Boolean) as string[]);
  return ideas
    .filter((i) => !used.has(i.docId) && i.improvementText)
    .map((i) => {
      const date = i.date || (i.dateString ? fromLegacyDate(i.dateString) : '');
      return {
        id: 'idea:' + i.docId,
        userId: i.authorId && i.authorId !== 'anonymous' ? i.authorId : '',
        date,
        place: 'משרד',
        hours: 0,
        hoursNote: '',
        calls: 0,
        mood: 0,
        moodText: '',
        tasks: {},
        idea: i.improvementText || '',
        ideaAnon: !!i.isAnonymous,
        ideaStatus: i.isCompleted ? 'done' : 'open',
        ideaReply: i.managerReply || '',
        ideaDocId: i.docId,
        timestamp: i.timestamp || new Date(date || Date.now()).toISOString(),
      } satisfies Report;
    });
}

/* -------------------------------------------------------------- feedbacks */

export interface LegacyFeedback {
  id?: string;
  userId?: string;
  targetUserName?: string;
  authorId?: string;
  authorName?: string;
  type?: 'general' | 'task' | 'vent' | 'reply';
  contextText?: string;
  replyText?: string;
  taskType?: string;
  taskCustomTitle?: string;
  isKudo?: boolean;
  requiresReply?: boolean;
  mustReply?: boolean;
  parentId?: string;
  timestamp?: string;
  dateString?: string;
  date?: string;
  /** Added by this app. */
  title?: string;
  mustRead?: boolean;
  onlyMgr?: boolean;
}

type Feedback = LegacyFeedback & { docId: string };

function fbDate(f: LegacyFeedback): string {
  if (f.date) return f.date;
  if (f.timestamp) return f.timestamp.slice(0, 10);
  if (f.dateString) return fromLegacyDate(f.dateString);
  return '';
}

/**
 * The whole messaging layer is one `feedbacks` collection discriminated by
 * `type`. It maps onto two domain concepts:
 *   - private manager notes  (type 'general' | 'vent' | 'task', userId = employee)
 *   - team messages          (type 'general', userId 'all') with 'reply' children
 */
export function splitFeedbacks(
  feedbacks: Feedback[],
  readIds: Set<string>,
): { notes: ManagerNote[]; messages: TeamMessage[] } {
  const notes: ManagerNote[] = [];
  const broadcasts: Feedback[] = [];
  const replies: Feedback[] = [];

  feedbacks.forEach((f) => {
    if (f.type === 'reply') {
      replies.push(f);
      return;
    }
    if (f.userId === 'all') {
      broadcasts.push(f);
      return;
    }
    if (!f.userId) return;
    notes.push({
      id: f.docId,
      to: f.userId,
      text: f.replyText || '',
      date: fbDate(f),
      // The legacy app marks these read by their `id` FIELD, not by document id.
      read: readIds.has(f.docId) || (!!f.id && readIds.has(f.id)),
      kind: f.type === 'vent' ? 'ideaReply' : f.type === 'task' ? 'taskReply' : 'note',
      contextText: f.contextText || '',
    });
  });

  const messages: TeamMessage[] = broadcasts
    .map((b) => ({
      id: b.docId,
      title: b.title || firstLine(b.replyText || ''),
      body: b.title ? b.replyText || '' : rest(b.replyText || ''),
      must: !!(b.mustRead ?? b.mustReply ?? b.requiresReply),
      date: fbDate(b),
      replies: replies
        .filter((r) => r.parentId === b.docId || r.parentId === b.id)
        .sort((a, c) => (a.timestamp || '') < (c.timestamp || '') ? -1 : 1)
        .map<MessageReply>((r) => ({
          by: r.authorId || '',
          text: r.replyText || '',
          onlyMgr: !!r.onlyMgr,
          date: fbDate(r),
          docId: r.docId,
        })),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { notes: notes.sort((a, b) => (a.date < b.date ? -1 : 1)), messages };
}

/** Legacy broadcasts have no title field — use the first line as one. */
function firstLine(s: string): string {
  const i = s.indexOf('\n');
  return (i > 0 ? s.slice(0, i) : s).slice(0, 80);
}

function rest(s: string): string {
  const i = s.indexOf('\n');
  return i > 0 ? s.slice(i + 1).trim() : s;
}

/* ---------------------------------------------------------------- targets */

export interface LegacyTargets {
  tasks?: Record<string, number>;
  manual?: Record<string, number>;
  resetPct?: number | null;
  /** Written by this app: the hourly targets exactly as the new model holds them. */
  hourly?: HourlyTargets;
  /** Written by an earlier build; no longer produced. */
  callsPerHour?: number;
}

export const TARGETS_DEFAULT_KEY = 'team_default';

export const DEFAULT_TEAM_TARGETS: HourlyTargets = { patel: 4, bot: 3, calls: 11, teams: 2 };

/**
 * Hourly targets.
 *
 * Only the `hourly` block this app writes is trusted. The legacy `tasks` rate
 * map is deliberately NOT imported: the live values there are not per working
 * hour (the team default carries פטל: 50), so reading them would put a wrong
 * number in front of every employee. Until the manager sets the targets in
 * "ניהול משימות ויעדים", the documented defaults apply.
 */
export function targetsFromLegacy(d: LegacyTargets | undefined): HourlyTargets | null {
  if (!d) return null;
  if (d.hourly) return { ...DEFAULT_TEAM_TARGETS, ...d.hourly };
  return null;
}

/**
 * Saves the hourly targets as the `hourly` block, leaving every legacy field
 * exactly as it was.
 *
 * The legacy `tasks` rate map is deliberately NOT mirrored into. Its numbers
 * are not per working hour (the live team default carries פטל: 50) and the old
 * app still reads them, so writing per-hour values there would quietly destroy
 * figures this app never even uses.
 */
export function targetsToLegacy(values: HourlyTargets, existing?: LegacyTargets): LegacyTargets {
  return {
    ...existing,
    tasks: existing?.tasks || {},
    manual: existing?.manual || {},
    resetPct: existing?.resetPct ?? null,
    hourly: values,
  };
}

/* ----------------------------------------------------------------- misc */

export interface LegacyUser {
  id?: string;
  name?: string;
  pass?: string;
  role?: string;
  team?: string;
  email?: string;
  authUid?: string;
}

export function employeeFromLegacy(docId: string, d: LegacyUser): Employee {
  return {
    id: d.id || docId,
    name: d.name || '',
    role: d.role === 'מנהל' ? 'manager' : 'employee',
    team: d.team || '',
    email: d.email,
    authUid: d.authUid,
  };
}

export const DEFAULT_ALERTS: AlertConfig = {
  moodLow: true,
  unresetOn: true,
  unresetTasks: [],
  prodDrop: false,
};

export function manualCountFromDoc(docId: string, d: Partial<ManualCount>): ManualCount {
  return {
    id: docId,
    scope: d.scope === 'emp' ? 'emp' : 'team',
    empId: d.empId ?? null,
    from: d.from || '',
    to: d.to || '',
    checklist: num(d.checklist),
    completions: num(d.completions),
    benji: num(d.benji),
    note: d.note || '',
    at: d.at || '',
  };
}

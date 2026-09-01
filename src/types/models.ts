/**
 * The domain model of "סיכום יום".
 *
 * These are the shapes the UI works with. They are NOT the shapes stored in
 * Firestore — the live project was written by an earlier version of this app
 * and keeps a different, flatter document layout. Everything is translated in
 * `src/data/adapters.ts`, which is the only place allowed to know about both.
 */

export type TargetType = 'perHour' | 'team' | 'personal' | 'none';
export type TimeMode = 'hours' | 'windows';
export type Place = 'משרד' | 'בית';
export type Role = 'employee' | 'manager';

export interface Task {
  id: string;
  /** Hebrew name shown to the employee. Also the legacy Firestore key. */
  name: string;
  /** Numeric questions. Each string is the exact label the employee sees. */
  nums: string[];
  /** Yes/no "did you clear it?" questions. Each string is a question label. */
  resets: string[];
  time: boolean;
  timeMode: TimeMode;
  /** Selectable time windows, used when timeMode === 'windows'. */
  windows: string[];
  note: boolean;
  targetType: TargetType;
  /** Target per working hour, when targetType === 'perHour'. */
  perHour?: number;
  /** Team-level weekly goal (used by פטל). */
  teamWeekly?: number;
  /** Expected phone conversations per unit (or per hour for reset-only tasks). */
  weight: number;
  active: boolean;
  visibleTo: 'all' | 'some';
}

export interface TaskEntry {
  on: true;
  /** Values of the numeric questions, keyed by index into Task.nums. */
  nums: Record<number, number>;
  /** Answers to the reset questions, keyed by index into Task.resets. */
  resets: Record<number, boolean>;
  time: number;
  window?: string;
  note: string;
}

export interface Report {
  id: string;
  userId: string;
  /** 'YYYY-MM-DD'. One report per user per date. */
  date: string;
  place: Place;
  hours: number;
  hoursNote: string;
  calls: number;
  mood: number;
  /** Free text. Mandatory when mood <= 7. */
  moodText: string;
  tasks: Record<string, TaskEntry>;
  idea: string;
  ideaAnon: boolean;
  ideaStatus: 'open' | 'done';
  ideaReply: string;
  /** Id of the backing document in the `ideas` collection, when there is one. */
  ideaDocId?: string;
  /** ISO timestamp — the field every range query in the live data is indexed on. */
  timestamp: string;
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  team: string;
  email?: string;
  /** Firebase Auth uid, once the account has been migrated. */
  authUid?: string;
}

/**
 * Per-hour targets, keyed by task id. These are OVERRIDES only: a task with no
 * entry here uses the rate set on the task itself, so the task configuration
 * stays the single source of truth.
 */
export interface HourlyTargets {
  [taskId: string]: number;
}

export interface TargetsConfig {
  team: HourlyTargets;
  byEmp: Record<string, HourlyTargets>;
}

/** Private 1:1 message from the manager to one employee. */
export interface ManagerNote {
  id: string;
  to: string;
  text: string;
  /** 'YYYY-MM-DD' */
  date: string;
  read: boolean;
  /** Set when the note is the manager's reply to an idea or to a task note. */
  kind?: 'note' | 'ideaReply' | 'taskReply';
  contextText?: string;
}

export interface MessageReply {
  by: string;
  text: string;
  /** When true only the manager and the author may see this reply. */
  onlyMgr: boolean;
  /** 'YYYY-MM-DD' — used to age a reply out of the unread count. */
  date?: string;
  /** Firestore id of the backing `feedbacks` document. */
  docId?: string;
}

/** Manager broadcast to the whole team. */
export interface TeamMessage {
  id: string;
  title: string;
  body: string;
  must: boolean;
  date: string;
  replies: MessageReply[];
}

export interface ManualCount {
  id: string;
  scope: 'team' | 'emp';
  empId: string | null;
  from: string;
  to: string;
  checklist: number;
  completions: number;
  benji: number;
  note: string;
  at: string;
}

export type ReadKind = 'ideas' | 'taskNotes' | 'replies' | 'messages';
export type ReadState = Record<ReadKind, Record<string, boolean>>;

export interface AlertConfig {
  moodLow: boolean;
  unresetOn: boolean;
  unresetTasks: string[];
  prodDrop: boolean;
}

/** Everything the screens read from, assembled by the store. */
export interface Db {
  tasks: Task[];
  employees: Employee[];
  manager: Employee;
  reports: Report[];
  notes: ManagerNote[];
  messages: TeamMessage[];
  targets: TargetsConfig;
  readState: ReadState;
  manualCounts: ManualCount[];
  alerts: AlertConfig;
  /** Manager's free-text summary per range, keyed by the range start date. */
  mgrSummary: Record<string, string>;
}

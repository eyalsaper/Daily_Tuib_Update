/**
 * All Firestore writes. Reads live in `src/state/store.tsx`.
 *
 * Every write keeps the legacy document shape intact so `midrag-app-legacy.html`
 * keeps working against the same data while the team switches over.
 */

import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { TEAM, col, docRef, keySanitize, uid } from '@/lib/firebase';
import type {
  HourlyTargets,
  ManualCount,
  Report,
  Task,
  ReadKind,
  AlertConfig,
} from '@/types/models';
import {
  type LegacyFeedback,
  type LegacyIdea,
  type LegacySchema,
  type LegacyTargets,
  TARGETS_DEFAULT_KEY,
  reportToLegacy,
  targetsToLegacy,
  tasksForStorage,
  tasksToLegacySchemas,
} from './adapters';
import { toLegacyDate, today } from '@/lib/date';

const nowIso = () => new Date().toISOString();

/* ---------------------------------------------------------------- reports */

export async function createReport(rep: Report, tasks: Task[], employeeName: string) {
  const payload = reportToLegacy({ ...rep, id: rep.id || uid('rep') }, tasks, employeeName);
  const ref = await addDoc(col('reports'), payload);
  return ref.id;
}

export async function replaceReport(
  docId: string,
  rep: Report,
  tasks: Task[],
  employeeName: string,
) {
  await setDoc(docRef('reports', docId), reportToLegacy(rep, tasks, employeeName));
}

export async function deleteReport(docId: string) {
  await deleteDoc(docRef('reports', docId));
}

/* ------------------------------------------------------------------ ideas */

export async function saveIdea(params: {
  reportId: string;
  userId: string;
  userName: string;
  date: string;
  text: string;
  anon: boolean;
}) {
  const payload: LegacyIdea = {
    id: uid('idea'),
    timestamp: nowIso(),
    dateString: toLegacyDate(params.date),
    date: params.date,
    isAnonymous: params.anon,
    authorName: params.anon ? 'אנונימי' : params.userName,
    authorId: params.anon ? 'anonymous' : params.userId,
    improvementText: params.text,
    isCompleted: false,
    reportId: params.reportId,
  };
  const ref = await addDoc(col('ideas'), payload);
  return ref.id;
}

export async function setIdeaCompleted(ideaDocId: string, done: boolean) {
  await setDoc(docRef('ideas', ideaDocId), { isCompleted: done }, { merge: true });
}

export async function setIdeaReply(ideaDocId: string, reply: string) {
  await setDoc(docRef('ideas', ideaDocId), { managerReply: reply }, { merge: true });
}

/* -------------------------------------------------------------- feedbacks */

/** Private 1:1 note from the manager to one employee. */
export async function sendManagerNote(params: {
  toUserId: string;
  toUserName: string;
  authorId: string;
  authorName: string;
  text: string;
  context?: string;
  kind?: 'general' | 'vent' | 'task';
  taskType?: string;
  dateString?: string;
}) {
  const payload: LegacyFeedback = {
    id: uid('fb'),
    userId: params.toUserId,
    targetUserName: params.toUserName,
    authorId: params.authorId,
    authorName: params.authorName,
    type: params.kind || 'general',
    contextText: params.context || '',
    replyText: params.text,
    taskType: params.taskType || '',
    taskCustomTitle: '',
    isKudo: false,
    requiresReply: false,
    timestamp: nowIso(),
    dateString: params.dateString || toLegacyDate(today()),
    date: today(),
  };
  const ref = await addDoc(col('feedbacks'), payload);
  return ref.id;
}

/** Manager broadcast to the whole team. */
export async function publishTeamMessage(params: {
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  must: boolean;
}) {
  const payload: LegacyFeedback = {
    id: uid('fb'),
    userId: 'all',
    targetUserName: 'כלל הצוות',
    authorId: params.authorId,
    authorName: params.authorName,
    type: 'general',
    contextText: '',
    // The legacy app renders `replyText` only, so the title has to lead it there.
    replyText: params.title + '\n' + params.body,
    title: params.title,
    mustRead: params.must,
    isKudo: true,
    requiresReply: false,
    timestamp: nowIso(),
    dateString: toLegacyDate(today()),
    date: today(),
  };
  const ref = await addDoc(col('feedbacks'), payload);
  return ref.id;
}

export async function deleteTeamMessage(docId: string, replyDocIds: string[]) {
  await Promise.all(replyDocIds.map((id) => deleteDoc(docRef('feedbacks', id))));
  await deleteDoc(docRef('feedbacks', docId));
}

/**
 * Reply to a team message. `onlyMgr` hides the reply from the rest of the team;
 * the rule is enforced in firestore.rules, not only here.
 */
export async function replyToMessage(params: {
  parentDocId: string;
  authorId: string;
  authorName: string;
  text: string;
  onlyMgr: boolean;
}) {
  const payload: LegacyFeedback = {
    id: uid('rep'),
    parentId: params.parentDocId,
    authorId: params.authorId,
    authorName: params.authorName,
    type: 'reply',
    replyText: params.text,
    onlyMgr: params.onlyMgr,
    timestamp: nowIso(),
    dateString: toLegacyDate(today()),
    date: today(),
  };
  const ref = await addDoc(col('feedbacks'), payload);
  return ref.id;
}

/* ------------------------------------------------------------- read marks */

/**
 * Read state is per manager/employee and lives in `read_marks`. Keys are
 * namespaced by kind and sanitised, because Firestore rejects ids containing
 * path characters.
 */
export function readMarkId(kind: ReadKind, key: string): string {
  return keySanitize(`${kind}__${key}`);
}

export async function setReadMark(kind: ReadKind, key: string, userId: string, read: boolean) {
  const id = readMarkId(kind, key);
  if (read) await setDoc(docRef('read_marks', id), { at: nowIso(), userId, kind, key });
  else await deleteDoc(docRef('read_marks', id));
}

export async function setReadMarks(
  entries: { kind: ReadKind; key: string }[],
  userId: string,
) {
  await Promise.all(entries.map((e) => setReadMark(e.kind, e.key, userId, true)));
}

/** Marks a legacy manager note read, using the id the legacy app also uses. */
export async function setLegacyItemRead(itemId: string, userId: string, read: boolean) {
  const id = keySanitize(itemId);
  if (read) await setDoc(docRef('read_marks', id), { at: nowIso(), userId });
  else await deleteDoc(docRef('read_marks', id));
}

/* ------------------------------------------------------------ task config */

/**
 * The new task configuration is stored as `tasksV2` on the same
 * `team_configs/{team}` document the legacy app uses, and the legacy
 * `tasks` array plus `task_schemas/global` are regenerated alongside it so the
 * old app keeps rendering the same form.
 */
export async function saveTasks(tasks: Task[]) {
  const schemasSnap = await getDoc(docRef('task_schemas', 'global'));
  const existing = (schemasSnap.exists() ? schemasSnap.data() : {}) as Record<string, LegacySchema>;
  // team_configs first: it is this app's source of truth. If it fails, the two
  // documents must not be left describing different task lists.
  await setDoc(
    docRef('team_configs', TEAM),
    {
      tasks: tasks.filter((t) => t.active).map((t) => t.name),
      tasksV2: tasksForStorage(tasks),
    },
    { merge: true },
  );
  await setDoc(docRef('task_schemas', 'global'), tasksToLegacySchemas(tasks, existing));
}

/* ---------------------------------------------------------------- targets */

export async function saveTargets(scope: string, values: HourlyTargets) {
  const id = scope === 'team' ? TARGETS_DEFAULT_KEY : scope;
  const snap = await getDoc(docRef('employee_targets', id));
  const existing = (snap.exists() ? snap.data() : undefined) as LegacyTargets | undefined;
  await setDoc(docRef('employee_targets', id), targetsToLegacy(values, existing));
}

export async function clearPersonalTargets(userId: string) {
  await deleteDoc(docRef('employee_targets', userId));
}

/* ----------------------------------------------------------- manual counts */

/**
 * Manual counts go in their own `manual_counts` collection. The legacy
 * `monthly_outputs` / `weekly_outputs` documents are left untouched — the new
 * design allows an arbitrary date range, and changing those docs needs the
 * client's approval first (open question 7 in the handoff).
 */
export async function addManualCount(entry: Omit<ManualCount, 'id'>) {
  const ref = await addDoc(col('manual_counts'), { ...entry, id: uid('mc') });
  return ref.id;
}

export async function deleteManualCount(docId: string) {
  await deleteDoc(docRef('manual_counts', docId));
}

/* -------------------------------------------------------- manager summary */

/** The manager's free-text summary for a range, keyed by the range start date. */
export async function saveManagerSummary(rangeKey: string, text: string, userId: string) {
  await setDoc(
    docRef('dashboard_checks', keySanitize('summary_' + rangeKey)),
    { summary: text, at: nowIso(), userId },
    { merge: true },
  );
}

/* ----------------------------------------------------------------- alerts */

export async function saveAlerts(config: AlertConfig) {
  await setDoc(docRef('team_configs', TEAM), { alerts: config }, { merge: true });
}

/* ------------------------------------------------------------------ users */

export async function updateUserProfile(docId: string, patch: Record<string, unknown>) {
  await updateDoc(doc(col('users'), docId), patch);
}

export async function findUserByAuthUid(authUid: string) {
  const snap = await getDocs(query(col('users'), where('authUid', '==', authUid)));
  return snap.empty ? null : { docId: snap.docs[0].id, data: snap.docs[0].data() };
}

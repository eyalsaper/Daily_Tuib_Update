import type { Db } from '@/types/models';
import { addDays, today } from '@/lib/date';

/** Unread counters. Nav badges count unread items only, never totals. */

/**
 * Anything older than this counts as already read, whether or not a read mark
 * exists. Without it the first manager to open the app lands on a backlog of
 * hundreds of items written before this app existed. Older items are still
 * reachable through the "הצג הכל" filter — they just stop being "new".
 */
export const READ_AFTER_DAYS = 7;

export function isStale(date: string | undefined): boolean {
  return !!date && date < addDays(today(), -READ_AFTER_DAYS);
}

export function isRead(db: Db, kind: keyof Db['readState'], key: string): boolean {
  return !!db.readState[kind]?.[key];
}

/** Unread means: no read mark, and recent enough to still be worth flagging. */
export function isUnread(
  db: Db,
  kind: keyof Db['readState'],
  key: string,
  date: string | undefined,
): boolean {
  return !isRead(db, kind, key) && !isStale(date);
}

export function employeeUnread(db: Db, userId: string): number {
  const notes = db.notes.filter((n) => n.to === userId && !n.read && !isStale(n.date)).length;
  const messages = db.messages.filter((m) => isUnread(db, 'messages', m.id, m.date)).length;
  return notes + messages;
}

export function managerIdeaUnread(db: Db): number {
  let pending = db.reports.filter((r) => r.idea && isUnread(db, 'ideas', r.id, r.date)).length;
  db.reports.forEach((r) =>
    Object.keys(r.tasks || {}).forEach((tid) => {
      const e = r.tasks[tid];
      if (e && e.on && e.note && isUnread(db, 'taskNotes', r.id + ':' + tid, r.date)) pending++;
    }),
  );
  return pending;
}

export function managerReplyUnread(db: Db): number {
  return db.messages.reduce(
    (a, m) =>
      a + m.replies.filter((rp, i) => isUnread(db, 'replies', m.id + ':' + i, rp.date || m.date))
        .length,
    0,
  );
}

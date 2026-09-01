import type { Db } from '@/types/models';

/** Unread counters. Nav badges count unread items only, never totals. */

export function isRead(db: Db, kind: keyof Db['readState'], key: string): boolean {
  return !!db.readState[kind]?.[key];
}

export function employeeUnread(db: Db, userId: string): number {
  const notes = db.notes.filter((n) => n.to === userId && !n.read).length;
  const messages = db.messages.filter((m) => !isRead(db, 'messages', m.id)).length;
  return notes + messages;
}

export function managerIdeaUnread(db: Db): number {
  let pending = db.reports.filter((r) => r.idea && !isRead(db, 'ideas', r.id)).length;
  db.reports.forEach((r) =>
    Object.keys(r.tasks || {}).forEach((tid) => {
      const e = r.tasks[tid];
      if (e && e.on && e.note && !isRead(db, 'taskNotes', r.id + ':' + tid)) pending++;
    }),
  );
  return pending;
}

export function managerReplyUnread(db: Db): number {
  return db.messages.reduce(
    (a, m) => a + m.replies.filter((_rp, i) => !isRead(db, 'replies', m.id + ':' + i)).length,
    0,
  );
}

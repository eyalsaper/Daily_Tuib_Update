import { MONTHS, addDays, fmtFull, iso, parse } from '@/lib/date';

export type RangeKind = 'day' | 'week' | 'month' | 'custom';

export interface RangeState {
  range: RangeKind;
  anchor: string;
  from: string | null;
  to: string | null;
}

export interface Bounds {
  from: string;
  to: string;
}

export function rangeBounds(s: RangeState): Bounds {
  if (s.range === 'day') return { from: s.anchor, to: s.anchor };
  if (s.range === 'week') {
    const d = parse(s.anchor);
    const from = new Date(d);
    from.setDate(d.getDate() - d.getDay()); // weeks start on Sunday
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: iso(from), to: iso(to) };
  }
  if (s.range === 'month') {
    const d = parse(s.anchor);
    return {
      from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  }
  return { from: s.from || addDays(s.anchor, -13), to: s.to || s.anchor };
}

export function rangeLabel(s: RangeState): string {
  const b = rangeBounds(s);
  if (s.range === 'day') return fmtFull(b.from);
  const f = parse(b.from);
  const t = parse(b.to);
  if (f.getMonth() === t.getMonth()) {
    return f.getDate() + '–' + t.getDate() + ' ב' + MONTHS[f.getMonth()] + ' ' + t.getFullYear();
  }
  return f.getDate() + ' ב' + MONTHS[f.getMonth()] + ' – ' + t.getDate() + ' ב' + MONTHS[t.getMonth()];
}

/** Move the range one step back (-1) or forward (+1). */
export function shiftRange(s: RangeState, dir: number): Partial<RangeState> {
  if (s.range === 'day') return { anchor: addDays(s.anchor, dir) };
  if (s.range === 'week') return { anchor: addDays(s.anchor, dir * 7) };
  if (s.range === 'month') {
    const d = parse(s.anchor);
    d.setMonth(d.getMonth() + dir);
    return { anchor: iso(d) };
  }
  const from = s.from || s.anchor;
  const to = s.to || s.anchor;
  const days = Math.max(1, Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1);
  return { from: addDays(from, dir * days), to: addDays(to, dir * days) };
}

export function inRange(s: RangeState, date: string): boolean {
  const b = rangeBounds(s);
  return date >= b.from && date <= b.to;
}

export function unitLabel(range: RangeKind): string {
  return range === 'month' ? 'בחודש' : range === 'week' ? 'בשבוע' : 'בטווח';
}

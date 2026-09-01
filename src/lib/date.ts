export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

/** Date -> 'YYYY-MM-DD', in local time (never UTC — a shift belongs to a local day). */
export function iso(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function parse(s: string): Date {
  const p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function today(): string {
  return iso(new Date());
}

export function yesterday(): string {
  return addDays(today(), -1);
}

/** 'ראשון, 3 בספטמבר 2025' */
export function fmtFull(s: string): string {
  const d = parse(s);
  return DAYS[d.getDay()] + ', ' + d.getDate() + ' ב' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/** '3/9' */
export function fmtShort(s: string): string {
  const d = parse(s);
  return d.getDate() + '/' + (d.getMonth() + 1);
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', the he-IL format the legacy documents store. */
export function toLegacyDate(s: string): string {
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

/** 'DD/MM/YYYY' (or 'DD.MM.YYYY') -> 'YYYY-MM-DD'. */
export function fromLegacyDate(s: string): string {
  const p = String(s).replace(/\./g, '/').split('/');
  if (p.length !== 3) return s;
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1;
}

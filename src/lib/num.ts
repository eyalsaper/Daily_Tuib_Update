export function num(v: unknown): number {
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/** Round to one decimal — the precision every figure in the design uses. */
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function pct(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 100) : null;
}

export function initials(name: string): string {
  return String(name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

export function signed(n: number): string {
  return (n >= 0 ? '+' : '') + n + '%';
}

import { C } from './tokens';
import type { Bar } from '@/domain/calc';

/**
 * Charts are CSS bars, not a charting library — the design is flat and
 * border-based and a chart library's defaults fight it.
 */

export function CallsChart({
  bars,
  height = 132,
  withMood,
}: {
  bars: Bar[];
  height?: number;
  /** Adds the narrow grey mood bar per day used on the manager's employee card. */
  withMood?: boolean;
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          height,
          marginTop: 18,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {bars.map((b, i) => (
          <span
            key={i}
            style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2 }}
          >
            <span
              style={{
                position: 'absolute',
                insetInline: -1,
                height: 2,
                background: C.ink2,
                bottom: b.fh,
              }}
            />
            <span style={{ flex: 1, background: b.color, height: b.h }} />
            {withMood && (
              <span style={{ width: 5, background: C.checkbox, height: b.mh, display: 'block' }} />
            )}
          </span>
        ))}
        {!bars.length && (
          <span style={{ fontSize: 12.5, color: C.muted, alignSelf: 'center' }}>אין דיווחים בטווח.</span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 11.5,
          color: C.muted,
        }}
      >
        {bars.map((b, i) => (
          <span key={i}>{b.label}</span>
        ))}
      </div>
    </>
  );
}

export function ChartLegend({ mood }: { mood?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: C.muted }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 10, background: C.brand }} /> בפועל
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 2, background: C.ink2 }} /> צפי
      </span>
      {mood && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 10, background: C.checkbox }} /> מצב רוח
        </span>
      )}
    </div>
  );
}

/** The 10-cell mood scale, used read-only on the day views. */
export function MoodScale({ value, height = 22 }: { value: number; height?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <span
          key={n}
          style={{ flex: 1, height, background: value === n ? C.brand : C.idleBar }}
        />
      ))}
    </div>
  );
}

export function Sparkline({ bars, height = 74 }: { bars: Bar[]; height?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, marginTop: 16 }}>
      {bars.map((b, i) => (
        <span key={i} style={{ flex: 1, background: C.track, height: b.mh }} />
      ))}
    </div>
  );
}

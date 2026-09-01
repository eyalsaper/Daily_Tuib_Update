import type { ReactNode } from 'react';
import { C } from './tokens';
import { useUi } from '@/state/ui';
import { rangeLabel } from '@/domain/range';
import type { RangeKind } from '@/domain/range';
import { addDays } from '@/lib/date';

const TABS: { key: RangeKind; label: string }[] = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'custom', label: 'טווח תאריכים' },
];

/**
 * The shared range bar: יום · שבוע · חודש · טווח תאריכים, the resolved label
 * and the two steppers. Picking "יום" jumps to the latest date that actually
 * has a report, so the day view never opens empty by default.
 */
export function RangeBar({
  latestDate,
  right,
}: {
  /** Latest date with a report in the current scope. */
  latestDate?: string;
  right?: ReactNode;
}) {
  const ui = useUi();
  const label = rangeLabel({ range: ui.range, anchor: ui.anchor, from: ui.from, to: ui.to });

  return (
    <div
      style={{
        background: '#fff',
        padding: '14px 40px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {TABS.map((t) => {
          const active = ui.range === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => ui.setRange(t.key, t.key === 'day' ? latestDate : undefined)}
              style={{
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                color: active ? C.ink : C.muted,
                padding: '0 16px',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Jump straight to a date instead of stepping one period at a time.
            In week and month mode the picked date selects the period it falls in. */}
        {ui.range !== 'custom' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>
              {ui.range === 'day' ? 'תאריך' : ui.range === 'week' ? 'שבוע של' : 'חודש של'}
            </span>
            <input
              type="date"
              value={ui.anchor}
              onChange={(e) => e.target.value && ui.setRange(ui.range, e.target.value)}
              style={dateInput}
            />
          </span>
        )}
        {ui.range === 'custom' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={ui.from || addDays(ui.anchor, -13)}
              onChange={(e) => ui.setFrom(e.target.value)}
              style={dateInput}
            />
            <span style={{ fontSize: 12, color: C.muted }}>עד</span>
            <input
              type="date"
              value={ui.to || ui.anchor}
              onChange={(e) => ui.setTo(e.target.value)}
              style={dateInput}
            />
          </span>
        )}
        <span style={{ fontSize: 13, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => ui.step(-1)} style={stepper}>
            → קודם
          </button>
          <button type="button" onClick={() => ui.step(1)} style={stepper}>
            הבא ←
          </button>
        </span>
        {right}
      </div>
    </div>
  );
}

const dateInput: React.CSSProperties = {
  fontSize: 12.5,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '6px 12px',
  background: '#fff',
};

const stepper: React.CSSProperties = {
  fontSize: 12.5,
  color: C.muted,
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 999,
  padding: '6px 14px',
  background: '#fff',
  whiteSpace: 'nowrap',
};

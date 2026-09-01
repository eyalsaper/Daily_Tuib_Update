import type { CSSProperties, ReactNode } from 'react';
import { C, card } from './tokens';

/* ------------------------------------------------------------------ card */

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: CSSProperties;
  /** Colour of the 3px top rule that marks a primary section. */
  accent?: string;
}) {
  return (
    <div style={{ ...card, ...(accent ? { borderTop: `3px solid ${accent}` } : {}), ...style }}>
      {children}
    </div>
  );
}

export function SectionHead({
  num,
  title,
  hint,
  right,
}: {
  num?: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '15px 22px',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {num && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand }}>{num}</span>}
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
      </div>
      {right ?? (hint && <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>)}
    </div>
  );
}

/* ------------------------------------------------------------------ pill */

export function Pill({
  label,
  active,
  onClick,
  activeBg = C.ink2,
  style,
}: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
  activeBg?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        borderRadius: 999,
        padding: '6px 16px',
        ...(active
          ? { color: '#fff', background: activeBg, border: '1px solid transparent' }
          : { color: C.muted, border: `1px solid ${C.borderStrong}`, background: 'none' }),
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function Badge({
  children,
  color = C.brand,
  bg = C.brandTint,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        borderRadius: 3,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- controls */

/** A 15–16px square checkbox, filled magenta when on. */
export function Checkbox({
  on,
  onClick,
  size = 16,
}: {
  on: boolean;
  onClick?: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: size,
        height: size,
        display: 'block',
        flexShrink: 0,
        background: on ? C.brand : 'none',
        border: on ? 'none' : `1.5px solid ${C.checkbox}`,
      }}
    />
  );
}

/** A 34×19 pill toggle with a 13px white knob. */
export function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: 34,
        height: 19,
        borderRadius: 999,
        background: on ? C.success : C.checkbox,
        display: 'flex',
        alignItems: 'center',
        padding: 3,
        justifyContent: on ? 'flex-start' : 'flex-end',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 13, height: 13, borderRadius: 999, background: '#fff', display: 'block' }} />
    </button>
  );
}

export function YesNo({
  yes,
  onYes,
  onNo,
}: {
  yes: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <Pill label="כן" active={yes} activeBg={C.success} onClick={onYes} style={{ padding: '5px 18px' }} />
      <Pill label="לא" active={!yes} activeBg={C.danger} onClick={onNo} style={{ padding: '5px 18px' }} />
    </span>
  );
}

/* --------------------------------------------------------------- charts */

export function ProgressBar({
  width,
  color = C.brand,
  height = 6,
  track = C.track,
}: {
  width: string;
  color?: string;
  height?: number;
  track?: string;
}) {
  return (
    <div style={{ height, background: track }}>
      <span style={{ display: 'block', height, background: color, width }} />
    </div>
  );
}

/** One figure in a hero band or KPI strip. */
export function Stat({
  label,
  value,
  sub,
  onBrand,
  valueSize = 22,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  onBrand?: boolean;
  valueSize?: number;
  color?: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11.5, color: onBrand ? C.onBrandSoft : C.muted }}>{label}</div>
      <div
        style={{
          fontSize: valueSize,
          fontWeight: 800,
          letterSpacing: '-.02em',
          marginTop: 5,
          color: color || (onBrand ? '#fff' : C.ink),
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: onBrand ? C.onBrandSoft : C.muted, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function StatStrip({ children, onBrand }: { children: ReactNode; onBrand?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        marginTop: 20,
      }}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                paddingInlineStart: i === 0 ? 0 : 18,
                paddingInlineEnd: 18,
                borderInlineEnd:
                  i === (children as unknown[]).length - 1
                    ? 'none'
                    : `1px solid ${onBrand ? C.onBrandRule : C.border}`,
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}

/* ---------------------------------------------------------------- states */

export function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div style={{ padding: '34px 22px', textAlign: 'center' }}>
      <div style={{ fontSize: 13.5, color: C.muted }}>{text}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted2, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        background: C.brandTint,
        border: `1px solid ${C.brandBorder}`,
        padding: '12px 18px',
        fontSize: 13.5,
        color: C.brandDark,
        marginBottom: 14,
      }}
    >
      {text}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      style={{
        position: 'fixed',
        insetInlineStart: '50%',
        transform: 'translateX(-50%)',
        bottom: 28,
        background: C.ink,
        color: '#fff',
        fontSize: 13.5,
        padding: '11px 22px',
        borderRadius: 999,
        zIndex: 60,
      }}
    >
      {text}
    </div>
  );
}

export function Modal({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(35,31,41,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 40,
      }}
    >
      <div
        dir="rtl"
        style={{
          width: 560,
          maxWidth: '100%',
          background: '#fff',
          borderTop: `3px solid ${C.brand}`,
          boxShadow: '0 20px 50px rgba(35,31,41,.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

export function Avatar({
  name,
  size = 34,
  bg = C.idleBar,
  color = C.muted,
}: {
  name: string;
  size?: number;
  bg?: string;
  color?: string;
}) {
  const text = String(name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: bg,
        color,
        fontSize: size <= 30 ? 11.5 : 12.5,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

export function Divider({ vertical, height }: { vertical?: boolean; height?: number }) {
  return vertical ? (
    <span style={{ width: 1, height: height ?? 38, background: C.border, flexShrink: 0 }} />
  ) : (
    <div style={{ height: 1, background: C.border }} />
  );
}

/** The design tokens from the handoff, section 4. Exact values — do not round. */
export const C = {
  brand: '#BD1854',
  brandDark: '#8E0F3E',
  brandTint: '#FBEAF1',
  brandTint2: '#FDF6F9',
  brandBorder: '#EFC6D8',
  ink: '#231F29',
  ink2: '#3C3745',
  muted: '#5E5866',
  muted2: '#6E6875',
  placeholder: '#8E8896',
  border: '#E5E3E8',
  borderStrong: '#D8D5DD',
  checkbox: '#C9C5D0',
  track: '#EBE8EE',
  idleBar: '#F1EFF3',
  surface: '#FAF9FB',
  canvas: '#F7F6F8',
  loginCanvas: '#F1EFF3',
  footer: '#2F2B37',
  success: '#0B7B4E',
  danger: '#C42A2A',
  statusDot: '#4CC38A',
  onBrand: '#fff',
  onBrandSoft: 'rgba(255,255,255,.9)',
  onBrandFaint: 'rgba(255,255,255,.62)',
  onBrandRule: 'rgba(255,255,255,.32)',
} as const;

/** Chart series colours for the stacked hours bar. */
export const PALETTE = ['#BD1854', '#D6538A', '#3C3745', '#8B8395', '#C9C5D0'];

export const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${C.border}`,
};

/** Primary sections carry a 3px coloured top border. */
export function topRule(color: string = C.brand): React.CSSProperties {
  return { ...card, borderTop: `3px solid ${color}` };
}

export const pill = { borderRadius: 999 } as const;

export const bigNumber: React.CSSProperties = {
  fontWeight: 800,
  letterSpacing: '-.03em',
  lineHeight: 1,
};

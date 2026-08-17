import type { CSSProperties, ReactNode } from 'react';
import type { Approvals } from '../../types';

export const APPR_DEFS: { k: keyof Approvals; l: string }[] = [
  { k: 'pid', l: 'POSITIVE ID (PID)' },
  { k: 'jag', l: 'ROE / JAG REVIEW' },
  { k: 'strike', l: 'STRIKE CELL CONCUR' },
  { k: 'tea', l: 'TARGET ENGAGEMENT AUTH' },
];

export function SectionLabel({ children, top = 0 }: { children: ReactNode; top?: number }) {
  return <div style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', margin: top ? `${top}px 0 8px` : '0 0 8px' }}>{children}</div>;
}

export function KV({ label, value, color = 'var(--ink-bright)' }: { label: string; value: ReactNode; color?: string }) {
  return (
    <>
      <span style={{ color: 'var(--ink-dim2)' }}>{label}</span>
      <span style={{ color, textAlign: 'right' }}>{value}</span>
    </>
  );
}

export function KVGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 14, fontSize: 11 }}>{children}</div>;
}

export function ProgressRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
        <span style={{ letterSpacing: '.1em' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--hairline-subtle2)' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export function LinkRow({
  affColor,
  affShape,
  idShort,
  name,
  pillLabel,
  pillColor,
  dist,
  onClick,
}: {
  affColor: string;
  affShape: CSSProperties;
  idShort: string;
  name: string;
  pillLabel?: string;
  pillColor?: string;
  dist?: string;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ width: 11, height: 11, background: '#0c1416', border: `1.5px solid ${affColor}`, flexShrink: 0, ...affShape }} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink-brighter)' }}>{idShort}</span>
      <span style={{ fontSize: 10, color: affColor, flex: 1 }}>{name}</span>
      {pillLabel && <span style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '1px 6px', border: `1px solid ${pillColor}`, color: pillColor, fontWeight: 600 }}>{pillLabel}</span>}
      {dist && <span style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 54, textAlign: 'right' }}>{dist}</span>}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>{children}</div>;
}

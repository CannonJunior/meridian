import { useStore } from '../store';
import { ROES } from '../types';

export function TopClassificationBanner() {
  return (
    <div
      className="classification-banner classification-banner-top"
      style={{
        background: '#2a3324',
        borderBottom: '1px solid #3c4a30',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        fontFamily: 'var(--font-display)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.32em',
        color: '#c7e08a',
      }}
    >
      <span className="classification-banner-marker">// CLASSIFICATION // DISSEMINATION //</span>
      <span className="classification-banner-simulation-notice" style={{ color: 'var(--amber)', letterSpacing: '.32em' }}>
        SIMULATION — TRAINING USE ONLY — NOT FOR OPERATIONAL USE
      </span>
      <span className="classification-banner-marker">// CLASSIFICATION // DISSEMINATION //</span>
    </div>
  );
}

export function BottomClassificationBanner() {
  const roeIdx = useStore((s) => s.roeIdx);
  const opStatus = ROES[roeIdx].label;
  return (
    <div
      className="classification-banner classification-banner-bottom"
      style={{
        background: '#2a3324',
        borderTop: '1px solid #3c4a30',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontFamily: 'var(--font-display)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '.28em',
        color: '#c7e08a',
      }}
    >
      <span className="classification-banner-marker">// CLASSIFICATION // DISSEMINATION //</span>
      <span className="classification-banner-status" style={{ color: 'var(--ink-dim2)', letterSpacing: '.16em' }}>
        MERIDIAN·FIRES v4.2 · NODE STRIKE-CELL-7 · {opStatus}
      </span>
      <span className="classification-banner-marker">// CLASSIFICATION // DISSEMINATION //</span>
    </div>
  );
}

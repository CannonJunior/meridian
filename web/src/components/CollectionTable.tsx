import { useStore } from '../store';
import { affColor, affShapeStyle, C, effName, sensorName, statusColorFor, STAGES, confColor } from '../selectors';
import type { Target } from '../types';

const GRID_COLS = '34px 96px 1fr 64px 96px 52px 70px 100px 58px';
const AFF_FULL: Record<Target['aff'], string> = { HOS: 'HOSTILE', UNK: 'UNKNOWN', FRD: 'FRIENDLY', NEU: 'NEUTRAL' };

export default function CollectionTable() {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const effectors = useStore((s) => s.effectors);
  const selectedId = useStore((s) => s.selectedId);
  const selectTarget = useStore((s) => s.selectTarget);
  const openCard = useStore((s) => s.openCard);

  const tracksTotal = targets.filter((t) => t.stage < 4).length;
  const hostileCount = targets.filter((t) => t.aff === 'HOS' && t.stage < 4).length;
  const execCount = targets.filter((t) => t.stage === 3).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--hairline)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-2)' }}>
        <span style={{ width: 5, height: 13, background: 'var(--amber)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>TARGET COLLECTION · HPTL</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'var(--ink-dim2)', letterSpacing: '.08em' }}>
          {tracksTotal} TRACKS · {hostileCount} HOSTILE · {execCount} IN EXECUTION
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 6, padding: '6px 12px', borderBottom: '1px solid #131e1d', fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
        <span>PRI</span>
        <span>TGT</span>
        <span>TYPE</span>
        <span>AFF</span>
        <span>STAGE</span>
        <span>CONF</span>
        <span>CUSTODY</span>
        <span>EFFECTOR</span>
        <span>STATUS</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {targets.map((t) => {
          const selected = t.id === selectedId;
          const priColor = t.pri && t.pri <= 3 ? C.amber : '#7a8d8a';
          const stage = STAGES[t.stage];
          const effLabel = t.effector ? effName(effectors, t.effector) : '— UNPAIRED';
          const statusColor = statusColorFor(t);
          return (
            <div
              key={t.id}
              onClick={() => selectTarget(t.id)}
              onDoubleClick={() => openCard(t.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLS,
                gap: 6,
                padding: '6px 12px',
                borderBottom: '1px solid #0e1716',
                cursor: 'pointer',
                alignItems: 'center',
                background: selected ? 'rgba(255,171,56,.07)' : 'transparent',
                borderLeft: `2px solid ${selected ? C.amber : 'transparent'}`,
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: priColor }}>{t.pri ? `#${t.pri}` : '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, background: '#0c1416', border: `1.5px solid ${affColor(t.aff)}`, flexShrink: 0, ...affShapeStyle(t.aff) }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>{t.id.slice(1)}</span>
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.name} · {t.type}
              </span>
              <span style={{ fontSize: 9, color: affColor(t.aff), fontWeight: 600 }}>{AFF_FULL[t.aff]}</span>
              <span style={{ fontSize: 9, color: stage.color, fontWeight: 600, letterSpacing: '.04em' }}>{stage.name}</span>
              <span style={{ fontSize: 10, color: confColor(t.conf), fontVariantNumeric: 'tabular-nums' }}>{t.conf}%</span>
              <span style={{ fontSize: 9.5, color: 'var(--cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sensorName(sensors, t.custody)}</span>
              <span style={{ fontSize: 9.5, color: t.effector ? C.amber : '#5d6f6c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{effLabel}</span>
              <span style={{ fontSize: 8, letterSpacing: '.04em', color: statusColor, fontWeight: 600 }}>{t.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

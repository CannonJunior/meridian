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
    <div className="collection-table" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--hairline)', overflow: 'hidden' }}>
      <div className="collection-table-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-2)' }}>
        <span className="collection-table-header-accent" style={{ width: 5, height: 13, background: 'var(--amber)' }} />
        <span className="collection-table-title" style={{ fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>
          TARGET COLLECTION · HPTL
        </span>
        <span className="collection-table-spacer" style={{ flex: 1 }} />
        <span className="collection-table-summary" style={{ fontSize: 9, color: 'var(--ink-dim2)', letterSpacing: '.08em' }}>
          {tracksTotal} TRACKS · {hostileCount} HOSTILE · {execCount} IN EXECUTION
        </span>
      </div>

      <div className="collection-table-column-headers" style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 6, padding: '6px 12px', borderBottom: '1px solid #131e1d', fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
        <span className="collection-table-column-header">PRI</span>
        <span className="collection-table-column-header">TGT</span>
        <span className="collection-table-column-header">TYPE</span>
        <span className="collection-table-column-header">AFF</span>
        <span className="collection-table-column-header">STAGE</span>
        <span className="collection-table-column-header">CONF</span>
        <span className="collection-table-column-header">CUSTODY</span>
        <span className="collection-table-column-header">EFFECTOR</span>
        <span className="collection-table-column-header">STATUS</span>
      </div>

      <div className="collection-table-rows" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {targets.map((t) => {
          const selected = t.id === selectedId;
          const priColor = t.pri && t.pri <= 3 ? C.amber : '#7a8d8a';
          const stage = STAGES[t.stage];
          const effLabel = t.effector ? effName(effectors, t.effector) : '— UNPAIRED';
          const statusColor = statusColorFor(t);
          return (
            <div
              key={t.id}
              className="collection-table-row"
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
              <span className="collection-table-cell-pri" style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: priColor }}>
                {t.pri ? `#${t.pri}` : '—'}
              </span>
              <span className="collection-table-cell-tgt" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="collection-table-cell-tgt-shape" style={{ width: 8, height: 8, background: '#0c1416', border: `1.5px solid ${affColor(t.aff)}`, flexShrink: 0, ...affShapeStyle(t.aff) }} />
                <span className="collection-table-cell-tgt-id" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>
                  {t.id.slice(1)}
                </span>
              </span>
              <span className="collection-table-cell-type" style={{ fontSize: 10.5, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.name} · {t.type}
              </span>
              <span className="collection-table-cell-aff" style={{ fontSize: 9, color: affColor(t.aff), fontWeight: 600 }}>
                {AFF_FULL[t.aff]}
              </span>
              <span className="collection-table-cell-stage" style={{ fontSize: 9, color: stage.color, fontWeight: 600, letterSpacing: '.04em' }}>
                {stage.name}
              </span>
              <span className="collection-table-cell-conf" style={{ fontSize: 10, color: confColor(t.conf), fontVariantNumeric: 'tabular-nums' }}>
                {t.conf}%
              </span>
              <span className="collection-table-cell-custody" style={{ fontSize: 9.5, color: 'var(--cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sensorName(sensors, t.custody)}
              </span>
              <span className="collection-table-cell-effector" style={{ fontSize: 9.5, color: t.effector ? C.amber : '#5d6f6c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {effLabel}
              </span>
              <span className="collection-table-cell-status" style={{ fontSize: 8, letterSpacing: '.04em', color: statusColor, fontWeight: 600 }}>
                {t.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useStore } from '../store';
import TacticalMap from './TacticalMap';
import Workbench from './Workbench';

export default function CenterPanel() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const isMap = view === 'MAP';

  return (
    <div style={{ position: 'relative', background: 'var(--map-bg)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-2)', zIndex: 5 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>{isMap ? 'COMMON OPERATING PICTURE' : 'TARGET WORKBENCH'}</span>
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.12em' }}>{isMap ? 'GEO · MULTI-INT FUSION · DBL-CLICK TRACK → OBJECT CARD' : 'KANBAN · DRAG CARDS TO ADVANCE LIFECYCLE'}</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--hairline-mid)' }}>
          <div
            onClick={() => setView('MAP')}
            style={{ padding: '4px 14px', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.14em', fontWeight: 600, cursor: 'pointer', background: isMap ? 'var(--amber)' : 'transparent', color: isMap ? '#06090a' : '#7a8d8a' }}
          >
            MAP
          </div>
          <div
            onClick={() => setView('BOARD')}
            style={{ padding: '4px 14px', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.14em', fontWeight: 600, cursor: 'pointer', background: !isMap ? 'var(--amber)' : 'transparent', color: !isMap ? '#06090a' : '#7a8d8a', borderLeft: '1px solid var(--hairline-mid)' }}
          >
            WORKBENCH
          </div>
        </div>
      </div>

      {isMap ? <TacticalMap /> : <Workbench />}
    </div>
  );
}

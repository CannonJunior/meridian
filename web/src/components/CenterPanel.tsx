import { lazy, Suspense } from 'react';
import { useStore } from '../store';
import TacticalMap from './TacticalMap';
import Workbench from './Workbench';
import Toasts from './Toasts';

// Lazily loaded: cytoscape.js is a sizeable dependency that only the
// Knowledge Base graph view needs — same reasoning App.tsx already applies
// to lazy-loading ObjectCard, just for a heavy third-party lib instead of
// app code.
const KnowledgeGraphView = lazy(() => import('./KnowledgeGraphView'));

export default function CenterPanel() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const activeManager = useStore((s) => s.activeManager);
  const isMap = view === 'MAP';
  // The Knowledge Base manager takes over the center panel with a graph
  // canvas regardless of the MAP/BOARD toggle — same swap mechanism as
  // MAP vs BOARD, just keyed on activeManager instead of view, since a
  // node-link graph needs real canvas space the 308px left rail can't give
  // it (see KnowledgeBaseManager.tsx for the browse/search rail).
  const isKb = activeManager === 'kb';

  return (
    <div className="center-panel" style={{ position: 'relative', background: 'var(--map-bg)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="center-panel-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-2)', zIndex: 5 }}>
        <span className="center-panel-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: isKb ? 'var(--violet)' : 'var(--amber)', fontWeight: 600 }}>
          {isKb ? 'KNOWLEDGE GRAPH' : isMap ? 'COMMON OPERATING PICTURE' : 'TARGET WORKBENCH'}
        </span>
        <span className="center-panel-subtitle" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.12em' }}>
          {isKb ? 'JSON-LD ONTOLOGY · CLICK A NODE → OBJECT CARD' : isMap ? 'GEO · MULTI-INT FUSION · DBL-CLICK TRACK → OBJECT CARD' : 'KANBAN · DRAG CARDS TO ADVANCE LIFECYCLE'}
        </span>
        <span className="center-panel-spacer" style={{ flex: 1 }} />
        {!isKb && (
          <div className="center-panel-view-toggle" style={{ display: 'flex', border: '1px solid var(--hairline-mid)' }}>
            <div
              className="center-panel-view-toggle-map"
              onClick={() => setView('MAP')}
              style={{ padding: '4px 14px', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.14em', fontWeight: 600, cursor: 'pointer', background: isMap ? 'var(--amber)' : 'transparent', color: isMap ? '#06090a' : '#7a8d8a' }}
            >
              MAP
            </div>
            <div
              className="center-panel-view-toggle-workbench"
              onClick={() => setView('BOARD')}
              style={{ padding: '4px 14px', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.14em', fontWeight: 600, cursor: 'pointer', background: !isMap ? 'var(--amber)' : 'transparent', color: !isMap ? '#06090a' : '#7a8d8a', borderLeft: '1px solid var(--hairline-mid)' }}
            >
              WORKBENCH
            </div>
          </div>
        )}
      </div>

      {isKb ? (
        <Suspense fallback={null}>
          <KnowledgeGraphView />
        </Suspense>
      ) : isMap ? (
        <TacticalMap />
      ) : (
        <Workbench />
      )}
      <Toasts />
    </div>
  );
}

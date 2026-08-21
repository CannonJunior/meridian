import { lazy, Suspense } from 'react';
import { TopClassificationBanner, BottomClassificationBanner } from './components/ClassificationBanner';
import CommandBar from './components/CommandBar';
import IconSidebar from './components/IconSidebar';
import ContextLayerManager from './components/ContextLayerManager';
import LeftRail from './components/LeftRail';
import OobManager from './components/OobManager';
import ListsManager from './components/ListsManager';
import ChatManager from './components/ChatManager';
import StyleManager from './components/StyleManager';
import CenterPanel from './components/CenterPanel';
import TargetWorkup from './components/TargetWorkup';
import BottomPanel from './components/BottomPanel';
import TutorialOverlay from './components/TutorialOverlay';
import { useStore } from './store';

// Lazily loaded: ObjectCard pulls in all 7 card-body variants (target,
// sensor/unit, NAI, zone, OOB, port, airfield — ~1,500 lines combined) but
// only ever mounts once a card is actually opened, so there's no reason
// for that code to sit in the initial bundle.
const ObjectCard = lazy(() => import('./components/ObjectCard'));

export default function App() {
  const cardId = useStore((s) => s.cardId);
  const activeManager = useStore((s) => s.activeManager);
  const rightRailWidth = useStore((s) => s.rightRailWidth);

  return (
    <div
      className="app-root"
      style={{
        width: '100vw',
        height: '100vh',
        minWidth: 1280,
        minHeight: 760,
        background: 'var(--bg-base)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-mono)',
        display: 'grid',
        gridTemplateRows: '24px 58px 1fr 234px 22px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <TopClassificationBanner />
      <CommandBar />

      <div className="app-main-row" style={{ display: 'grid', gridTemplateColumns: `48px 308px 1fr ${rightRailWidth}px`, minHeight: 0, overflow: 'hidden' }}>
        <IconSidebar />
        <div className="app-manager-slot app-manager-slot-context" style={{ display: activeManager === 'context' ? 'contents' : 'none' }}>
          <ContextLayerManager />
        </div>
        <div className="app-manager-slot app-manager-slot-isr" style={{ display: activeManager === 'isr' ? 'contents' : 'none' }}>
          <LeftRail />
        </div>
        <div className="app-manager-slot app-manager-slot-oob" style={{ display: activeManager === 'oob' ? 'contents' : 'none' }}>
          <OobManager />
        </div>
        <div className="app-manager-slot app-manager-slot-lists" style={{ display: activeManager === 'lists' ? 'contents' : 'none' }}>
          <ListsManager />
        </div>
        <div className="app-manager-slot app-manager-slot-chat" style={{ display: activeManager === 'chat' ? 'contents' : 'none' }}>
          <ChatManager />
        </div>
        <div className="app-manager-slot app-manager-slot-style" style={{ display: activeManager === 'style' ? 'contents' : 'none' }}>
          <StyleManager />
        </div>
        <CenterPanel />
        <TargetWorkup />
      </div>

      <BottomPanel />
      <BottomClassificationBanner />

      {cardId != null && (
        <Suspense fallback={null}>
          <ObjectCard />
        </Suspense>
      )}
      <TutorialOverlay />
    </div>
  );
}

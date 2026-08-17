import { TopClassificationBanner, BottomClassificationBanner } from './components/ClassificationBanner';
import CommandBar from './components/CommandBar';
import LeftRail from './components/LeftRail';
import CenterPanel from './components/CenterPanel';
import TargetWorkup from './components/TargetWorkup';
import BottomPanel from './components/BottomPanel';
import ObjectCard from './components/ObjectCard';
import { useStore } from './store';

export default function App() {
  const cardId = useStore((s) => s.cardId);

  return (
    <div
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

      <div style={{ display: 'grid', gridTemplateColumns: '308px 1fr 372px', minHeight: 0, overflow: 'hidden' }}>
        <LeftRail />
        <CenterPanel />
        <TargetWorkup />
      </div>

      <BottomPanel />
      <BottomClassificationBanner />

      {cardId != null && <ObjectCard />}
    </div>
  );
}

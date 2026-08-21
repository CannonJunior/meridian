import CollectionTable from './CollectionTable';
import EventLog from './EventLog';
import { useStore } from '../store';

export default function BottomPanel() {
  const rightRailWidth = useStore((s) => s.rightRailWidth);
  return (
    <div className="bottom-panel" style={{ display: 'grid', gridTemplateColumns: `1fr ${rightRailWidth}px`, borderTop: '1px solid var(--hairline)', minHeight: 0, overflow: 'hidden', background: 'var(--panel-1)' }}>
      <CollectionTable />
      <EventLog />
    </div>
  );
}

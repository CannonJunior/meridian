import CollectionTable from './CollectionTable';
import EventLog from './EventLog';

export default function BottomPanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', borderTop: '1px solid var(--hairline)', minHeight: 0, overflow: 'hidden', background: 'var(--panel-1)' }}>
      <CollectionTable />
      <EventLog />
    </div>
  );
}

import { useStore } from '../../store';
import { formatLatLng, parentOf, pathNodes, siblingObjectsOf, statusMeta } from '../../oobSelectors';
import { EmptyNote, KV, KVGrid, LinkRow, SectionLabel } from './shared';

const STATUS_NOTE: Record<string, string> = {
  VISIBLE: 'Positive custody held — track corroborated by current collection.',
  OBSCURED: 'Contact obscured (e.g. submerged, EMCON, or terrain/weather masking). Last known position shown.',
  MISIDENTIFIED: 'Classification unconfirmed — signature is ambiguous with another platform.',
  DESTROYED: 'Assessed destroyed. Retained on the order of battle for historical reference.',
  UNKNOWN: 'Contact lost — missing for reasons not yet established.',
};

export default function OobObjectCardBody({ id, tab }: { id: string; tab: number }) {
  const selectOob = useStore((s) => s.selectOob);

  const node = pathNodes(id).at(-1);
  if (!node) return null;

  const meta = statusMeta(node.status);
  const parent = parentOf(id);
  const path = pathNodes(id);
  const siblings = siblingObjectsOf(id);

  if (tab === 0) {
    return (
      <>
        <KVGrid>
          <KV label="CLASS" value={node.kind === 'ship' ? 'SHIP' : node.kind.toUpperCase()} />
          <KV label="ROLE" value={node.role || '—'} />
          <KV label="PARENT COMMAND" value={parent?.name || '—'} />
          <KV label="STATUS" value={meta.label} color={meta.color} />
          <KV label="POSITION" value={node.lat != null && node.lng != null ? formatLatLng(node.lat, node.lng) : '—'} color="var(--ink-mute)" />
        </KVGrid>
        <div className="oob-object-card-status-box" style={{ marginTop: 14, padding: '9px 10px', border: `1px solid ${meta.color}`, background: 'rgba(255,255,255,.02)' }}>
          <div className="oob-object-card-status-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="oob-object-card-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
            <span className="oob-object-card-status-label" style={{ fontSize: 9, letterSpacing: '.12em', color: meta.color, fontWeight: 600 }}>
              {meta.label}
            </span>
          </div>
          <div className="oob-object-card-status-note" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 6, lineHeight: 1.5 }}>
            {STATUS_NOTE[node.status ?? 'VISIBLE']}
          </div>
        </div>
      </>
    );
  }

  if (tab === 1) {
    return (
      <>
        <SectionLabel>CHAIN OF COMMAND</SectionLabel>
        <div className="oob-object-card-chain" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {path.map((n, i) => (
            <div
              key={n.id}
              className="oob-object-card-chain-row"
              onClick={() => n.id !== id && selectOob(n.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 9px',
                paddingLeft: 9 + i * 14,
                cursor: n.id !== id ? 'pointer' : 'default',
                background: n.id === id ? 'rgba(63,210,230,.08)' : 'transparent',
                borderLeft: `2px solid ${n.id === id ? 'var(--cyan)' : 'transparent'}`,
              }}
            >
              <span className="oob-object-card-chain-dot" style={{ width: 5, height: 5, background: n.id === id ? 'var(--cyan)' : 'var(--ink-faint)', flexShrink: 0 }} />
              <span className="oob-object-card-chain-name" style={{ fontSize: 10, color: n.id === id ? 'var(--ink-brighter)' : 'var(--ink-mute)', fontWeight: n.id === id ? 700 : 500 }}>
                {n.name}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>CO-LOCATED / SISTER UNITS</SectionLabel>
      <div className="oob-object-card-siblings-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {siblings.map((s) => {
          const sMeta = statusMeta(s.status);
          return <LinkRow key={s.id} affColor="var(--cyan)" affShape={{ borderRadius: '50%' }} idShort={s.kind.toUpperCase()} name={s.name} pillLabel={sMeta.label} pillColor={sMeta.color} onClick={() => selectOob(s.id)} />;
        })}
        {siblings.length === 0 && <EmptyNote>No other objects under {parent?.name ?? 'this command'}.</EmptyNote>}
      </div>
      <div className="oob-object-card-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>
        ▸ Click a linked object to open its card.
      </div>
    </>
  );
}

import { useStore } from '../../store';
import { affColor, affFull, affShapeStyle } from '../../selectors';
import { EmptyNote, KV, KVGrid, LinkRow, SectionLabel } from './shared';

const RESTRICTIONS = [
  'No kinetic fires within NSZ boundary',
  'PID required for any adjacent engagement',
  'CDE-1 maximum · collateral mitigation mandatory',
  'De-conflict with maritime ROE Annex C',
  'Civilian fishing fleet active vicinity — heightened scrutiny',
];

export default function ZoneCardBody({ tab }: { tab: number }) {
  const targets = useStore((s) => s.targets);
  const openCard = useStore((s) => s.openCard);

  const drift = targets.find((t) => t.id === 'T2210');
  const inside = drift
    ? targets.filter((t) => Math.hypot(t.x - drift.x, t.y - drift.y) < 11).map((t) => ({ idShort: t.id.slice(1), name: t.name, affColor: affColor(t.aff), affShape: affShapeStyle(t.aff), affFull: affFull(t.aff), id: t.id }))
    : [];

  if (tab === 0) {
    return (
      <>
        <KVGrid>
          <KV label="ZONE TYPE" value="NO-STRIKE / NSL ENTITY" />
          <KV label="PROTECTS" value="M/V DRIFT — civilian cargo" color="var(--green)" />
          <KV label="RADIUS" value="~6 NM" />
          <KV label="AUTHORITY" value="CJTF SJA · ROE ANNEX C" />
          <KV label="STATUS" value="ENFORCED" color="var(--green)" />
        </KVGrid>
        <SectionLabel top={14}>RATIONALE</SectionLabel>
        <div className="zone-card-rationale" style={{ fontSize: 10.5, color: 'var(--ink-mute)', lineHeight: 1.55, borderLeft: '2px solid #244536', paddingLeft: 10 }}>
          Protected civilian maritime traffic transiting the strait. Kinetic fires are prohibited inside the zone; adjacent engagements require positive ID and CDE-1 weaponeering with collateral mitigation.
        </div>
      </>
    );
  }

  if (tab === 1) {
    return (
      <>
        <SectionLabel>PROTECTED / AFFECTED ENTITIES</SectionLabel>
        <div className="zone-card-protected-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {inside.map((r) => (
            <LinkRow key={r.id} affColor={r.affColor} affShape={r.affShape} idShort={r.idShort} name={r.name} pillLabel={r.affFull} pillColor={r.affColor} onClick={() => openCard(r.id)} />
          ))}
          {inside.length === 0 && <EmptyNote>No entities currently inside the zone.</EmptyNote>}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>ENGAGEMENT RESTRICTIONS</SectionLabel>
      <div className="zone-card-restrictions-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {RESTRICTIONS.map((x, i) => (
          <div key={i} className="zone-card-restriction-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px' }}>
            <span className="zone-card-restriction-icon" style={{ color: 'var(--red)', fontSize: 11, flexShrink: 0 }}>
              ⊘
            </span>
            <span className="zone-card-restriction-text" style={{ fontSize: 10, color: 'var(--ink)', lineHeight: 1.4 }}>
              {x}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

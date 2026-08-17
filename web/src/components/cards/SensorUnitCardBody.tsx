import { useStore } from '../../store';
import { affColor, affShapeStyle, C, mgrs } from '../../selectors';
import { EmptyNote, KV, KVGrid, LinkRow, ProgressRow, SectionLabel } from './shared';
import type { CardKind } from '../../types';

const COV_LABEL: Record<string, string> = {
  cone: 'DIRECTIONAL EO/IR CONE',
  wide: 'WIDE-AREA SAR / GMTI',
  area: 'AREA AEW RADAR',
  none: 'POINT / NON-IMAGING',
};

export default function SensorUnitCardBody({ kind, id, tab }: { kind: CardKind; id: string; tab: number }) {
  const state = useStore((s) => s);
  const openCard = useStore((s) => s.openCard);

  const ae = kind === 'sensor' ? state.sensors.find((x) => x.id === id) : state.units.find((x) => x.id === id);
  if (!ae) return null;

  const isSensor = kind === 'sensor';
  const stc = ae.status === 'DEGRADED' ? C.red : ae.status === 'TASKED' ? C.amber : C.cyan;
  const linked = state.targets
    .filter((t) => (isSensor ? t.custody === ae.id : 'effId' in ae && ae.effId && t.effector === ae.effId))
    .map((t) => ({ idShort: t.id.slice(1), name: t.name, affColor: affColor(t.aff), affShape: affShapeStyle(t.aff), rel: isSensor ? 'CUSTODY' : 'PAIRED', relColor: isSensor ? C.cyan : C.amber, id: t.id }));

  if (tab === 0) {
    const endur = ae.endur;
    const endColor = endur > 60 ? C.green : endur > 35 ? C.amber : C.red;
    const aType = isSensor && 'intType' in ae ? ae.intType : 'type' in ae ? ae.type : '—';
    const aRole = isSensor ? 'ISR / COLLECTION' : 'role' in ae ? ae.role : '—';
    const aArmLabel = isSensor ? 'SENSOR PKG' : 'ARMAMENT';
    const aArm = isSensor && 'intType' in ae ? ae.intType : 'weapon' in ae ? ae.weapon : '—';
    return (
      <>
        <KVGrid>
          <KV label="PLATFORM" value={ae.platform} />
          <KV label="TYPE" value={aType} />
          <KV label="ROLE" value={aRole} />
          <KV label="STATUS" value={ae.status} color={stc} />
          <KV label="POSITION" value={mgrs(ae)} color="var(--ink-mute)" />
          <KV label={aArmLabel} value={aArm} />
        </KVGrid>
        <ProgressRow label="ENDURANCE / READINESS" value={endur} color={endColor} />
      </>
    );
  }

  if (tab === 1) {
    const tasking = 'tasking' in ae ? ae.tasking : undefined;
    const cov = isSensor && 'cov' in ae ? COV_LABEL[ae.cov] : 'WEAPONS ENGAGEMENT ZONE';
    return (
      <>
        <KVGrid>
          <KV label="CURRENT TASKING" value={tasking || '—'} color="var(--amber)" />
          <KV label="COVERAGE" value={cov} />
        </KVGrid>
        <SectionLabel top={14}>{isSensor ? 'TRACKS UNDER CUSTODY' : 'PAIRED TARGETS'}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linked.map((r) => (
            <LinkRow key={r.id} affColor={r.affColor} affShape={r.affShape} idShort={r.idShort} name={r.name} pillLabel={r.rel} pillColor={r.relColor} onClick={() => openCard(r.id)} />
          ))}
          {linked.length === 0 && <EmptyNote>No tracks currently associated.</EmptyNote>}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>LINKED ENTITIES</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {linked.map((r) => (
          <LinkRow key={r.id} affColor={r.affColor} affShape={r.affShape} idShort={r.idShort} name={r.name} pillLabel={r.rel} pillColor={r.relColor} onClick={() => openCard(r.id)} />
        ))}
        {linked.length === 0 && <EmptyNote>No linked tracks.</EmptyNote>}
      </div>
      <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>▸ Click a linked track to open its object card.</div>
    </>
  );
}

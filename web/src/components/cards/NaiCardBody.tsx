import { useStore } from '../../store';
import { affColor, affShapeStyle, C, distanceNm, threatColor } from '../../selectors';
import { EmptyNote, KV, KVGrid, LinkRow, SectionLabel } from './shared';
import { ClickableDiv } from '../Clickable';

export default function NaiCardBody({ id, tab }: { id: string; tab: number }) {
  const nais = useStore((s) => s.nais);
  const sensors = useStore((s) => s.sensors);
  const targets = useStore((s) => s.targets);
  const openEntity = useStore((s) => s.openEntity);

  const n = nais.find((x) => x.id === id) ?? nais[0];
  if (!n) return null;

  const cover = sensors
    .filter((s) => (s.tasking || '').indexOf(n.id) >= 0)
    .map((s) => ({ callsign: s.callsign, platform: s.platform, intType: s.intType, statusColor: s.status === 'DEGRADED' ? C.red : s.status === 'TASKED' ? C.amber : C.cyan, id: s.id }));

  const inside = targets
    .filter((t) => t.lng >= n.lngMin && t.lng <= n.lngMax && t.lat >= n.latMin && t.lat <= n.latMax)
    .map((t) => ({ idShort: t.id.slice(1), name: t.name, affColor: affColor(t.aff), affShape: affShapeStyle(t.aff), threat: t.threat || '—', threatColor: threatColor(t.threat), id: t.id }));

  // Real width/height in NM, along the box's mid-latitude/mid-longitude —
  // not exact for a large box (meridians converge toward the poles) but
  // more than accurate enough at NAI scale, and a real geodesic distance
  // rather than the old abstract-grid-units * 0.6 approximation.
  const latMid = (n.latMin + n.latMax) / 2;
  const lngMid = (n.lngMin + n.lngMax) / 2;
  const areaWidthNm = Math.round(distanceNm(n.lngMin, latMid, n.lngMax, latMid));
  const areaHeightNm = Math.round(distanceNm(lngMid, n.latMin, lngMid, n.latMax));

  if (tab === 0) {
    return (
      <>
        <KVGrid>
          <KV label="DESIGNATION" value={n.id} />
          <KV label="DESCRIPTION" value={n.desc} />
          <KV label="LINKED PIR" value={n.pir} color="var(--amber)" />
          <KV label="AREA" value={`~${areaWidthNm} × ${areaHeightNm} NM`} />
          <KV label="STATUS" value="ACTIVE COLLECTION" color="var(--green)" />
        </KVGrid>
        <div className="nai-card-overview-note" style={{ fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>
          Named Area of Interest — a geospatial trigger where collection is focused to answer a Priority Intelligence Requirement. See COLLECTION for tasked sensors and TRACKS for entities inside.
        </div>
      </>
    );
  }

  if (tab === 1) {
    return (
      <>
        <SectionLabel>SENSORS ON COLLECTION</SectionLabel>
        <div className="nai-card-sensor-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cover.map((s) => (
            <ClickableDiv key={s.id} className="nai-card-sensor-row" onClick={() => openEntity('sensor', s.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: 'pointer' }}>
              <span className="nai-card-sensor-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: s.statusColor, flexShrink: 0 }} />
              <span className="nai-card-sensor-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>
                {s.callsign}
              </span>
              <span className="nai-card-sensor-platform" style={{ fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>
                {s.platform}
              </span>
              <span className="nai-card-sensor-int-type" style={{ fontSize: 9, color: 'var(--cyan)' }}>
                {s.intType}
              </span>
            </ClickableDiv>
          ))}
          {cover.length === 0 && <EmptyNote>No sensors currently tasked to this NAI.</EmptyNote>}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>TRACKS INSIDE NAI</SectionLabel>
      <div className="nai-card-tracks-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {inside.map((r) => (
          <LinkRow key={r.id} affColor={r.affColor} affShape={r.affShape} idShort={r.idShort} name={r.name} pillLabel={r.threat} pillColor={r.threatColor} onClick={() => openEntity('target', r.id)} />
        ))}
        {inside.length === 0 && <EmptyNote>No tracks currently inside this NAI.</EmptyNote>}
      </div>
    </>
  );
}

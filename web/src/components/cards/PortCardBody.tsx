import { useStore } from '../../store';
import { KV, KVGrid } from './shared';

export default function PortCardBody({ id }: { id: string }) {
  const port = useStore((s) => s.ports[id]);
  if (!port) return null;

  return (
    <>
      <KVGrid>
        <KV label="COUNTRY" value={port.country || '—'} />
        <KV label="STATE / REGION" value={port.state || '—'} />
        <KV label="PORT SIZE" value={port.portSize || '—'} />
        <KV label="MAX VESSEL SIZE" value={port.maxVesselSize || '—'} />
        <KV label="CARGO PIER DEPTH" value={port.cargoPierDepthMaxM != null ? `${port.cargoPierDepthMaxM} m` : '—'} color="var(--ink-mute)" />
        <KV label="POSITION" value={`${port.lat.toFixed(2)}°${port.lat >= 0 ? 'N' : 'S'} ${Math.abs(port.lng).toFixed(2)}°${port.lng >= 0 ? 'E' : 'W'}`} color="var(--ink-mute)" />
      </KVGrid>
      <div className="port-card-source" style={{ marginTop: 14, padding: '9px 10px', border: '1px solid var(--hairline-mid)', background: 'var(--panel-3)' }}>
        <div className="port-card-source-label" style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--ink-faint)' }}>SOURCE</div>
        <div className="port-card-source-text" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.5 }}>
          NGA Publication 150, World Port Index (2019 ed.) — fixed reference data, served from GeoServer. Not a live track; independent of the simulation's collection picture.
        </div>
      </div>
    </>
  );
}

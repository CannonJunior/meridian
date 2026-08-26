import { useStore } from '../../store';
import { DrawnShapesNote, KV, KVGrid } from './shared';

export default function AirfieldCardBody({ id }: { id: string }) {
  const airfield = useStore((s) => s.airfields[id]);
  if (!airfield) return null;

  return (
    <>
      <KVGrid>
        <KV label="ICAO CODE" value={airfield.icao || '—'} />
        <KV label="POSITION" value={`${airfield.lat.toFixed(4)}°${airfield.lat >= 0 ? 'N' : 'S'} ${Math.abs(airfield.lng).toFixed(4)}°${airfield.lng >= 0 ? 'E' : 'W'}`} color="var(--ink-mute)" />
      </KVGrid>
      <DrawnShapesNote layerId="airfields" objectId={id} />
      <div className="airfield-card-source" style={{ marginTop: 14, padding: '9px 10px', border: '1px solid var(--hairline-mid)', background: 'var(--panel-3)' }}>
        <div className="airfield-card-source-label" style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--ink-faint)' }}>SOURCE</div>
        <div className="airfield-card-source-text" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.5 }}>
          OpenStreetMap contributors — fixed reference data, served from GeoServer. Boundary/runway/taxiway polygons for this airfield are shown on the map but are not independently selectable; not a live track.
        </div>
      </div>
    </>
  );
}

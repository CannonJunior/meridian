// The map's own dimension/basemap/projection picker overlay (bottom-left
// on the map surface, not a rail panel) — split out of TacticalMap.tsx
// itself (see this repo's maintainability audit) since it's a
// self-contained control with no dependency on map lifecycle internals.
import { useStore } from '../../store';
import { ClickableDiv } from '../Clickable';
import { BASEMAP_STYLES, PROJECTION_OPTIONS } from '../../mapProjection';
import { ALTITUDE_EXAGGERATION, MODE_25D_LOOK_ANGLE_DEG } from '../../cesium3d';
import type { MapMode } from '../../cesium3d';

export function StylePicker() {
  const basemapId = useStore((s) => s.basemapId);
  const setBasemap = useStore((s) => s.setBasemap);
  const mapProjectionCode = useStore((s) => s.mapProjectionCode);
  const setMapProjectionCode = useStore((s) => s.setMapProjectionCode);
  const mapMode = useStore((s) => s.mapMode);
  const setMapMode = useStore((s) => s.setMapMode);
  const dimensionTitle: Record<MapMode, string> = {
    '2D': 'Flat top-down map',
    '2.5D': `Standardized oblique view — look angle locked at ${MODE_25D_LOOK_ANGLE_DEG}° from nadir, heading locked north, pan/zoom only; altitude uses a log scale and stems are colored by altitude band rather than affiliation`,
    '3D': `Free-camera Cesium globe — pan, zoom, tilt and rotate freely; altitude is exaggerated ×${ALTITUDE_EXAGGERATION} for visibility`,
  };
  // Distinct per-option selected color so the picker itself hints at which
  // mode is live without reading the label — cyan/amber/violet, none of
  // which collide with the basemap group's amber or the projection group's
  // cyan directly below (different control, so an eye already on this one
  // reads its own color first).
  const dimensionColor: Record<MapMode, string> = { '2D': 'var(--cyan)', '2.5D': 'var(--amber)', '3D': 'var(--violet)' };
  return (
    <div className="style-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        className="style-picker-dimension-group"
        title={dimensionTitle[mapMode]}
        style={{ display: 'flex', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}
      >
        {(['2D', '2.5D', '3D'] as const).map((d) => (
          <ClickableDiv
            key={d}
            className="style-picker-dimension-option"
            onClick={() => setMapMode(d)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '4px 6px',
              fontFamily: 'var(--font-display)',
              fontSize: 9.5,
              letterSpacing: '.06em',
              fontWeight: 600,
              cursor: 'pointer',
              color: mapMode === d ? '#06090a' : 'var(--ink-mute)',
              background: mapMode === d ? dimensionColor[d] : 'transparent',
            }}
          >
            {d}
          </ClickableDiv>
        ))}
      </div>
      <div className="style-picker-basemap-group" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}>
        {BASEMAP_STYLES.map((b) => (
          <ClickableDiv
            key={b.id}
            className="style-picker-option"
            onClick={() => setBasemap(b.id)}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--font-display)',
              fontSize: 9.5,
              letterSpacing: '.1em',
              fontWeight: 600,
              cursor: 'pointer',
              color: basemapId === b.id ? '#06090a' : 'var(--ink-mute)',
              background: basemapId === b.id ? 'var(--amber)' : 'transparent',
            }}
          >
            {b.label}
          </ClickableDiv>
        ))}
      </div>
      <div className="style-picker-projection-group" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}>
        {PROJECTION_OPTIONS.map((p) => (
          <ClickableDiv
            key={p.code}
            className="style-picker-projection-option"
            onClick={() => setMapProjectionCode(p.code)}
            title={p.code}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--font-display)',
              fontSize: 9.5,
              letterSpacing: '.1em',
              fontWeight: 600,
              cursor: 'pointer',
              color: mapProjectionCode === p.code ? '#06090a' : 'var(--ink-mute)',
              background: mapProjectionCode === p.code ? 'var(--cyan)' : 'transparent',
            }}
          >
            {p.label}
          </ClickableDiv>
        ))}
      </div>
    </div>
  );
}

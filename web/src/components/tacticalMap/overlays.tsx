// The 2D SVG overlay layer — every live-entity marker, range ring, and
// airspace annotation drawn on top of the OpenLayers/Cesium map surface.
// Split out of TacticalMap.tsx itself (see this repo's maintainability
// audit) as its own concern: given a `project()` function and the current
// live state, render the picture. Nothing here manages map/view lifecycle
// or OL layer sync — see TacticalMap.tsx and contextLayerStyles.ts for that.
import { memo, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import {
  affColor,
  altBand,
  atoDayFor,
  domainForSensor,
  domainForTarget,
  domainForUnit,
  geodesicCircleLngLat,
  geodesicSectorLngLat,
  geodesicEllipseLngLat,
  sortieStatusColor,
} from '../../selectors';
import { hexToRgba } from '../../assets/palette';
import { AIRSPACE_CONTROL_MEASURES } from '../../assets/airspaceControlMeasures';
import { loadAirfieldIcaoIndex } from '../../airfieldIcaoIndex';
import type { AirfieldLocation } from '../../airfieldIcaoIndex';
import { loadSortieHistoryTrack } from '../../airTrackHistory';
import type { CardKind, Nai, Sensor, Sortie, Target } from '../../types';
import type { ProjectFn } from './geometryHelpers';
import { OWNSHIP_RINGS_LNGLAT, BULLSEYE_RINGS_LNGLAT, BULLSEYE_LNG_LAT } from './mapConstants';

// A true geodesic shape (range ring, sensor coverage circle/sector/
// ellipse): each vertex is an individual lng/lat point run through the same
// project() every other geographic overlay element uses, rather than a flat
// SVG <circle>/<ellipse>/<polygon> built from fixed pixel offsets around one
// projected center. That's what makes it correct away from the equator (the
// polygon inherits whatever distortion the active 2D projection applies)
// and under a tilted/rotated 3D or 2.5D camera (each vertex gets its own
// real perspective projection, so the shape foreshortens the same way the
// ground plane itself does — see selectors.ts's geodesicCircleLngLat /
// geodesicSectorLngLat / geodesicEllipseLngLat for the vertex math).
// Vertices that project() can't place (e.g. behind the camera at a steep 3D
// tilt) come back as project()'s off-screen sentinel and are dropped rather
// than drawn, so an unreachable vertex leaves a small gap instead of a
// spike across the screen.
export function GeodesicShape({
  className,
  points: lngLatPoints,
  project,
  fill = 'none',
  stroke,
  strokeWidth = 1,
  strokeDasharray,
}: {
  className: string;
  points: [number, number][];
  project: ProjectFn;
  fill?: string;
  stroke: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}) {
  const points = lngLatPoints
    .map(([lng, lat]) => project(lng, lat))
    .filter((p) => p.x !== -9999 && p.y !== -9999)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
  return <polygon className={className} points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} style={{ pointerEvents: 'none' }} />;
}

// NM values are illustrative doctrinal figures for each sensor's coverage
// footprint — same as the range rings above, there was no prior real-world
// radius (these were flat 240/230×120/200px screen-space shapes), and no
// spec ties a specific range to HAWK-01/GLOBE-7/SENTRY-3's actual
// EO-IR/WAS/AEW-radar sensors, so these are reasonable stand-ins sized to
// stay proportionate to the ~27NM-wide AO rather than a reverse-engineered
// match to the old pixel sizing.
const SENSOR_CONE_RADIUS_NM = 25;
const SENSOR_CONE_HALF_ANGLE_DEG = 30;
const SENSOR_WIDE_MAJOR_NM = 35;
const SENSOR_WIDE_MINOR_NM = 18;
const SENSOR_AREA_RADIUS_NM = 30;

// Memoized: a sensor's coverage shape is 30-70+ geodesic vertices of trig
// math (geodesicSectorLngLat/EllipseLngLat/CircleLngLat), recomputed from
// scratch on every call. Sensor coverage practically never changes
// (retasking touches status/tasking, not lng/lat/cov/covDir), but
// MapOverlaySvg re-renders every sim tick because it also reads `targets`
// — without this, all 6 sensors' shapes were being rebuilt every second
// regardless. Skipped whenever `s` and `project` are both referentially
// unchanged, which is now the common case for both (see TacticalMap.tsx's
// `project` useCallback and store.ts's deepEqual-gated patching).
export const SensorCoverage = memo(function SensorCoverage({ s, project }: { s: Sensor; project: ProjectFn }) {
  if (s.cov === 'cone') {
    const points = geodesicSectorLngLat(s.lng, s.lat, SENSOR_CONE_RADIUS_NM, s.covDir ?? 120, SENSOR_CONE_HALF_ANGLE_DEG);
    return <GeodesicShape className="sensor-coverage-cone" points={points} project={project} fill="rgba(63,210,230,.045)" stroke="rgba(63,210,230,.18)" strokeDasharray="4 4" />;
  }
  if (s.cov === 'wide') {
    // No covDir on 'wide' sensors — the ellipse's original screen-space
    // orientation (wider east-west than north-south) had no geographic
    // basis either, so 90°/east-west is kept as the default major-axis
    // bearing for visual continuity rather than picking a new one.
    const points = geodesicEllipseLngLat(s.lng, s.lat, SENSOR_WIDE_MAJOR_NM, SENSOR_WIDE_MINOR_NM, s.covDir ?? 90);
    return <GeodesicShape className="sensor-coverage-wide" points={points} project={project} fill="rgba(63,210,230,.035)" stroke="rgba(63,210,230,.14)" strokeDasharray="4 5" />;
  }
  if (s.cov === 'area') {
    const points = geodesicCircleLngLat(s.lng, s.lat, SENSOR_AREA_RADIUS_NM);
    return <GeodesicShape className="sensor-coverage-area" points={points} project={project} fill="rgba(91,157,255,.03)" stroke="rgba(91,157,255,.12)" strokeDasharray="3 6" />;
  }
  return null;
});

export function TrackSymbol({ t, selected, project, onSelect, onOpen }: { t: Target; selected: boolean; project: ProjectFn; onSelect: () => void; onOpen: () => void }) {
  const showAltitude = useStore((s) => s.showAltitude);
  const cesiumActive = useStore((s) => s.mapMode !== '2D');
  if (t.stage === 4 && t.id !== 'T2198') return null;
  // In 3D/2.5D mode airborne entities get a real Cesium point at true
  // altitude (see the 3D-entity-sync effect below) instead of this flat 2D
  // symbol — ground/surface targets are unaffected and keep rendering here
  // exactly as in 2D, just reprojected through the Cesium camera by
  // `project()`.
  if (cesiumActive && t.altFt != null) return null;
  const { x, y } = project(t.lng, t.lat);
  const col = affColor(t.aff);
  const stale = t.decay >= 35 && t.stage < 4;
  const lock = t.stage === 3 || t.engagedAt != null;
  const labelW = selected ? 112 : 62;
  const labelH = selected ? 26 : 13;

  return (
    <g className="track-symbol" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={onSelect} onDoubleClick={onOpen}>
      {t.speed > 0 && t.stage < 4 && (() => {
        const a = ((t.course - 90) * Math.PI) / 180;
        const len = Math.min(46, 14 + t.speed * 0.28);
        return <line className="track-symbol-heading-line" x1={x} y1={y} x2={x + Math.cos(a) * len} y2={y + Math.sin(a) * len} stroke={col} strokeWidth={1.5} opacity={0.7} />;
      })()}

      {t.aff === 'HOS' && <polygon className="track-symbol-hostile-shape" points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`} fill={selected ? '#16100e' : '#0c1416'} stroke={col} strokeWidth={2} />}
      {t.aff === 'FRD' && <circle className="track-symbol-friendly-shape" cx={x} cy={y} r={11} fill="#0c1416" stroke={col} strokeWidth={2} />}
      {t.aff !== 'HOS' && t.aff !== 'FRD' && <rect className="track-symbol-other-shape" x={x - 11} y={y - 11} width={22} height={22} fill="#0c1416" stroke={col} strokeWidth={2} />}

      {t.stage === 4 ? (
        <text className="track-symbol-destroyed-glyph" x={x} y={y + 5} fill={col} fontSize={15} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ╳
        </text>
      ) : (
        <circle className="track-symbol-dot" cx={x} cy={y} r={2} fill={col} />
      )}

      <rect className="track-symbol-label-bg" x={x + 15} y={y - 12} width={labelW} height={labelH} fill="rgba(7,11,12,.72)" />
      <text className="track-symbol-label" x={x + 17} y={y - 2} fill={col} fontSize={10} fontWeight={700} fontFamily="Chakra Petch" letterSpacing={0.5}>
        {t.id.slice(1)} {t.name}
      </text>
      {selected && (
        <text className="track-symbol-type-label" x={x + 17} y={y + 9} fill="#8aa09c" fontSize={8.5} fontFamily="IBM Plex Mono">
          {t.type}
        </text>
      )}
      {stale && (
        <text className="track-symbol-stale-label" x={x - 12} y={y + 24} fill={affColor('HOS')} fontSize={8} fontFamily="IBM Plex Mono" fontWeight={600}>
          ◬ STALE
        </text>
      )}

      {showAltitude &&
        t.altFt != null &&
        (() => {
          const band = altBand(t.altFt);
          const chevron = t.vsFtMin != null && Math.abs(t.vsFtMin) >= 500 ? (t.vsFtMin > 0 ? '▲' : '▼') : null;
          const stemY = y + band.stemLen;
          const tagW = chevron ? 46 : 38;
          return (
            <g className="track-symbol-altitude-group">
              <line className="track-symbol-altitude-stem" x1={x} y1={y} x2={x} y2={stemY} stroke={band.color} strokeWidth={1.5} strokeDasharray="1 3" opacity={0.85} />
              <circle className="track-symbol-altitude-stem-foot" cx={x} cy={stemY} r={1.5} fill={band.color} />
              <rect className="track-symbol-altitude-tag-bg" x={x - tagW - 4} y={stemY - 7} width={tagW} height={14} fill="rgba(7,11,12,.78)" />
              <text className="track-symbol-altitude-tag-label" x={x - tagW} y={stemY + 3} fill={band.color} fontSize={9} fontWeight={700} fontFamily="IBM Plex Mono" letterSpacing={0.3}>
                {chevron ? `${chevron} ${band.label}` : band.label}
              </text>
            </g>
          );
        })()}

      {selected && (
        <>
          <g className="track-symbol-lock-ring" style={{ transformOrigin: `${x}px ${y}px`, animation: 'twbspin 7s linear infinite' }}>
            <circle className="track-symbol-lock-ring-circle" cx={x} cy={y} r={24} fill="none" stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.4} strokeDasharray="4 6" />
            <line className="track-symbol-lock-ring-tick" x1={x} y1={y - 30} x2={x} y2={y - 20} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line className="track-symbol-lock-ring-tick" x1={x} y1={y + 20} x2={x} y2={y + 30} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line className="track-symbol-lock-ring-tick" x1={x - 30} y1={y} x2={x - 20} y2={y} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line className="track-symbol-lock-ring-tick" x1={x + 20} y1={y} x2={x + 30} y2={y} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
          </g>
          {lock && (
            <text className="track-symbol-lock-status-label" x={x} y={y - 34} fill="var(--red)" fontSize={9} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch" letterSpacing={1}>
              {t.engagedAt != null ? 'ENGAGED' : 'LOCKED'}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// Phase C of the "Rolling Air Picture" plan. A sortie's flight line is
// origin airfield -> (its first linked target, if it has one) -> recovery
// airfield — not a plain origin-to-recovery line, because most sorties in
// this AO launch and recover at the same base (a combat air patrol/strike
// round-trip, not a transit), which would otherwise draw a zero-length
// line. A sortie with neither a linked target nor a different recovery
// airfield (an on-station AAR/AEW/ISR orbit) has no resolvable route at
// all yet — see the design brief's RT-08 finding — and is skipped rather
// than drawn with invented geometry.
function sortieRoutePoints(s: Sortie, airfields: Record<string, AirfieldLocation>, targets: Target[]): [number, number][] | null {
  const origin = airfields[s.originAirfield];
  const recovery = airfields[s.recoveryAirfield];
  if (!origin || !recovery) return null;
  if (s.targetIds.length > 0) {
    const t = targets.find((x) => x.id === s.targetIds[0]);
    if (t) return [[origin.lng, origin.lat], [t.lng, t.lat], [recovery.lng, recovery.lat]];
  }
  if (s.originAirfield !== s.recoveryAirfield) return [[origin.lng, origin.lat], [recovery.lng, recovery.lat]];
  return null;
}

function FlightLine({ sortie, points, project }: { sortie: Sortie; points: [number, number][]; project: ProjectFn }) {
  const proj = points.map(([lng, lat]) => project(lng, lat)).filter((p) => p.x !== -9999 && p.y !== -9999);
  if (proj.length < 2) return null;
  const mid = proj[Math.floor(proj.length / 2)];
  const color = sortieStatusColor(sortie.status);
  // Dashed for a sortie not yet airborne (a planned/fragged future leg,
  // per the design brief's §III.4) — solid for anything currently or
  // already flown. Phase D is what eventually replaces the solid case
  // with a real historical track from entity_track_history instead of
  // this straight-line approximation.
  const dashed = sortie.status === 'FRAGGED';
  return (
    <g className="map-overlay-flight-line-group" style={{ pointerEvents: 'none' }}>
      <polyline
        className="map-overlay-flight-line"
        points={proj.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeDasharray={dashed ? '5 4' : undefined}
        opacity={0.8}
      />
      <text className="map-overlay-flight-line-label" x={mid.x + 6} y={mid.y - 6} fill={color} fontSize={8.5} fontFamily="IBM Plex Mono" letterSpacing={0.4}>
        {sortie.callsign}
      </text>
    </g>
  );
}
export const MemoFlightLine = memo(FlightLine);

// Memoized: AIRSPACE_CONTROL_MEASURES is fixed reference data (not even a
// prop), so with `project` now stable (see TacticalMap.tsx's project
// useCallback), this renders once and then never again on a plain sim
// tick — versus rebuilding these polylines/boxes from scratch every
// second, unconditionally, before.
export const AcoOverlayLayer = memo(function AcoOverlayLayer({ project }: { project: ProjectFn }) {
  return (
    <>
      {AIRSPACE_CONTROL_MEASURES.map((acm) => {
        if (acm.kind === 'ROZ' && acm.box) {
          const p1 = project(acm.box.lngMin, acm.box.latMax);
          const p2 = project(acm.box.lngMax, acm.box.latMin);
          const rx = Math.min(p1.x, p2.x);
          const ry = Math.min(p1.y, p2.y);
          const rw = Math.abs(p2.x - p1.x);
          const rh = Math.abs(p2.y - p1.y);
          return (
            <g key={acm.id} className="map-overlay-acm-roz" style={{ pointerEvents: 'none' }}>
              <rect className="map-overlay-acm-roz-box" x={rx} y={ry} width={rw} height={rh} fill={hexToRgba(acm.color, 0.05)} stroke={acm.color} strokeWidth={1.2} strokeDasharray="3 5" />
              <text className="map-overlay-acm-roz-label" x={rx + 4} y={ry + 13} fill={acm.color} fontSize={9.5} fontFamily="Chakra Petch" fontWeight={700}>
                {acm.name}
              </text>
              <text className="map-overlay-acm-roz-alt-label" x={rx + 4} y={ry + 25} fill={acm.color} fontSize={8} fontFamily="IBM Plex Mono" opacity={0.85}>
                {acm.altitudeBlock}
              </text>
            </g>
          );
        }
        if (acm.kind === 'CORRIDOR' && acm.line) {
          const proj = acm.line.map(([lng, lat]) => project(lng, lat)).filter((p) => p.x !== -9999 && p.y !== -9999);
          if (proj.length < 2) return null;
          const mid = proj[Math.floor(proj.length / 2)];
          return (
            <g key={acm.id} className="map-overlay-acm-corridor" style={{ pointerEvents: 'none' }}>
              <polyline
                className="map-overlay-acm-corridor-line"
                points={proj.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={acm.color}
                strokeWidth={2}
                strokeDasharray="1 6"
                strokeLinecap="round"
                opacity={0.65}
              />
              <text className="map-overlay-acm-corridor-label" x={mid.x + 6} y={mid.y - 6} fill={acm.color} fontSize={8.5} fontFamily="IBM Plex Mono">
                {acm.name} · {acm.altitudeBlock}
              </text>
            </g>
          );
        }
        return null;
      })}
    </>
  );
});

// Memoized: nais rarely changes (no live sim mutation touches it), and
// with `project`/`openEntity` both stable now (see TacticalMap.tsx's project
// useCallback; Zustand actions are stable by construction), this skips
// re-rendering the NAI boxes/labels on the sim ticks that don't touch any
// of the three — versus recomputing every box's screen rect from scratch
// every second regardless, before.
export const NaiLayer = memo(function NaiLayer({ nais, project, openEntity }: { nais: Nai[]; project: ProjectFn; openEntity: (kind: CardKind, id: string) => void }) {
  return (
    <>
      {nais.map((n) => {
        const p1 = project(n.lngMin, n.latMax);
        const p2 = project(n.lngMax, n.latMin);
        const rx = Math.min(p1.x, p2.x);
        const ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p2.x - p1.x);
        const rh = Math.abs(p2.y - p1.y);
        return (
          <g key={n.id} className="map-overlay-nai">
            <rect className="map-overlay-nai-box" x={rx} y={ry} width={rw} height={rh} fill={n.color === '#ff5a47' ? 'rgba(255,90,71,.04)' : 'rgba(255,171,56,.03)'} stroke={n.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.5} style={{ pointerEvents: 'none' }} />
            <g className="map-overlay-nai-label-group" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => openEntity('nai', n.id)} onDoubleClick={() => openEntity('nai', n.id)}>
              <rect className="map-overlay-nai-label-bg" x={rx + 2} y={ry + 5} width={50} height={15} fill="rgba(7,11,12,.65)" />
              <text className="map-overlay-nai-label" x={rx + 6} y={ry + 16} fill={n.color} fontSize={11} fontFamily="Chakra Petch" fontWeight={700}>
                {n.id}
              </text>
            </g>
          </g>
        );
      })}
    </>
  );
});

export function MapOverlaySvg({ project, width, height }: { project: ProjectFn; width: number; height: number }) {
  const cesiumActive = useStore((s) => s.mapMode !== '2D');
  const nais = useStore((s) => s.nais);
  const allSensors = useStore((s) => s.sensors);
  const allUnits = useStore((s) => s.units);
  const allTargets = useStore((s) => s.targets);
  const domainVisibility = useStore((s) => s.domainVisibility);
  // LayerManager.tsx's per-domain checkboxes — filters which live entities
  // this overlay draws, without touching the underlying arrays or any of
  // the click/select/open-card interactivity below (see that component's
  // header comment for why this stays additive rather than switching this
  // overlay's data source to GeoServer WFS).
  const sensors = useMemo(() => allSensors.filter((s) => domainVisibility[domainForSensor(s)]), [allSensors, domainVisibility]);
  const units = useMemo(() => allUnits.filter((u) => domainVisibility[domainForUnit(u)]), [allUnits, domainVisibility]);
  const targets = useMemo(() => allTargets.filter((t) => domainVisibility[domainForTarget(t)]), [allTargets, domainVisibility]);
  const selectedId = useStore((s) => s.selectedId);
  const selectTarget = useStore((s) => s.selectTarget);
  const openCard = useStore((s) => s.openCard);
  const openEntity = useStore((s) => s.openEntity);
  const sorties = useStore((s) => s.sorties);
  const selectedAtoDay = useStore((s) => s.selectedAtoDay);
  const showFlightLines = useStore((s) => s.showFlightLines);
  const showAcoOverlay = useStore((s) => s.showAcoOverlay);

  // Fetched lazily (only once FLT is actually toggled on) via the same
  // cached WFS loader every context layer uses — see airfieldIcaoIndex.ts.
  // Not fetched at all if the toggle is never touched this session.
  const [airfieldIndex, setAirfieldIndex] = useState<Record<string, AirfieldLocation>>({});
  useEffect(() => {
    if (!showFlightLines) return;
    let cancelled = false;
    loadAirfieldIcaoIndex().then((idx) => {
      if (!cancelled) setAirfieldIndex(idx);
    });
    return () => {
      cancelled = true;
    };
  }, [showFlightLines]);

  // Phase D — a COMPLETE sortie's real historical track, once fetched,
  // replaces sortieRoutePoints()'s straight-line approximation for that
  // one sortie below. Only fetched for COMPLETE sorties on the day
  // currently in view, not the whole fixture set, since that's the only
  // status this app models as having a track to fetch at all.
  const [historyTracks, setHistoryTracks] = useState<Record<string, [number, number][]>>({});
  useEffect(() => {
    if (!showFlightLines) return;
    const completed = sorties.filter((s) => atoDayFor(s.totWindowStart) === selectedAtoDay && s.status === 'COMPLETE' && !historyTracks[s.id]);
    if (completed.length === 0) return;
    let cancelled = false;
    Promise.all(
      completed.map((s) =>
        loadSortieHistoryTrack(s).then((points) => [s.id, points.map((p) => [p.lng, p.lat] as [number, number])] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const withTracks = entries.filter(([, points]) => points.length >= 2);
      if (withTracks.length === 0) return;
      setHistoryTracks((prev) => ({ ...prev, ...Object.fromEntries(withTracks) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFlightLines, selectedAtoDay, sorties]);

  const drift = targets.find((t) => t.id === 'T2210');
  const bullseye = project(...BULLSEYE_LNG_LAT);

  return (
    <svg className="map-overlay-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Doctrinal-spacing NM values (no prior real-world radius existed —
          these were flat 120/230/340/460px circles) rather than a reverse-
          engineered match to that arbitrary pixel sizing. */}
      {OWNSHIP_RINGS_LNGLAT.map(({ nm, points }) => (
        <GeodesicShape className="map-overlay-ownship-ring" key={`ring${nm}`} points={points} project={project} stroke="rgba(63,210,230,.10)" strokeDasharray="2 7" />
      ))}

      {BULLSEYE_RINGS_LNGLAT.map(({ nm, points }) => (
        <GeodesicShape className="map-overlay-bullseye-ring" key={`bulls${nm}`} points={points} project={project} stroke="rgba(255,171,56,.18)" />
      ))}
      <line className="map-overlay-bullseye-line-v" x1={bullseye.x} y1={bullseye.y - 72} x2={bullseye.x} y2={bullseye.y + 72} stroke="rgba(255,171,56,.16)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <line className="map-overlay-bullseye-line-h" x1={bullseye.x - 72} y1={bullseye.y} x2={bullseye.x + 72} y2={bullseye.y} stroke="rgba(255,171,56,.16)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <text className="map-overlay-bullseye-label" x={bullseye.x + 70} y={bullseye.y - 50} fill="#7a5e24" fontSize={9} fontFamily="IBM Plex Mono" letterSpacing={1} style={{ pointerEvents: 'none' }}>
        BULLSEYE
      </text>

      <NaiLayer nais={nais} project={project} openEntity={openEntity} />

      {showAcoOverlay && <AcoOverlayLayer project={project} />}

      {showFlightLines &&
        sorties
          .filter((s) => atoDayFor(s.totWindowStart) === selectedAtoDay)
          .map((s) => {
            // A real historical track (Phase D), once fetched, replaces
            // the straight-line approximation for that one sortie — see
            // the historyTracks effect above.
            const points = historyTracks[s.id] ?? sortieRoutePoints(s, airfieldIndex, targets);
            return points ? <MemoFlightLine key={s.id} sortie={s} points={points} project={project} /> : null;
          })}

      {sensors.map((s) => (
        <SensorCoverage key={`cov-${s.id}`} s={s} project={project} />
      ))}

      {sensors
        .filter((s) => !(cesiumActive && s.altFt != null))
        .map((s) => {
          const { x: sx, y: sy } = project(s.lng, s.lat);
          const col = s.status === 'DEGRADED' ? 'var(--red)' : 'var(--cyan)';
          return (
            <g key={s.id} className="map-overlay-sensor-marker" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => openEntity('sensor', s.id)} onDoubleClick={() => openEntity('sensor', s.id)}>
              <rect className="map-overlay-sensor-marker-shape" x={sx - 6} y={sy - 6} width={12} height={12} fill="#0a1316" stroke={col} strokeWidth={1.5} transform={`rotate(45 ${sx} ${sy})`} />
              <circle className="map-overlay-sensor-marker-dot" cx={sx} cy={sy} r={2} fill={col} />
              <text className="map-overlay-sensor-marker-label" x={sx + 11} y={sy + 3} fill={col} fontSize={9} fontFamily="IBM Plex Mono" opacity={0.85}>
                {s.callsign}
              </text>
            </g>
          );
        })}

      {drift && (() => {
        const { x: dx, y: dy } = project(drift.lng, drift.lat);
        return (
          <>
            <circle className="map-overlay-nsz-circle" cx={dx} cy={dy} r={62} fill="rgba(95,227,154,.04)" stroke="rgba(95,227,154,.45)" strokeWidth={1.5} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
            <g className="map-overlay-nsz-label-group" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => openEntity('zone', 'NSZ')} onDoubleClick={() => openEntity('zone', 'NSZ')}>
              <rect className="map-overlay-nsz-label-bg" x={dx - 47} y={dy - 60} width={94} height={14} fill="rgba(7,11,12,.65)" />
              <text className="map-overlay-nsz-label" x={dx - 44} y={dy - 50} fill="#4fae7e" fontSize={9} fontFamily="IBM Plex Mono" letterSpacing={1}>
                NO-STRIKE ZONE
              </text>
            </g>
          </>
        );
      })()}

      {units.map((u) => {
        const { x: fx, y: fy } = project(u.lng, u.lat);
        return (
          <g key={u.id} className="map-overlay-unit-marker" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => openEntity('unit', u.id)} onDoubleClick={() => openEntity('unit', u.id)}>
            <circle className="map-overlay-unit-marker-shape" cx={fx} cy={fy} r={9} fill="#0a1316" stroke="var(--cyan)" strokeWidth={1.5} />
            <circle className="map-overlay-unit-marker-dot" cx={fx} cy={fy} r={2.5} fill="var(--cyan)" />
            <text className="map-overlay-unit-marker-label" x={fx + 13} y={fy + 3} fill="var(--cyan)" fontSize={9} fontFamily="IBM Plex Mono" opacity={0.8}>
              {u.callsign}
            </text>
          </g>
        );
      })}

      {targets.map((t) => (
        <TrackSymbol key={t.id} t={t} selected={t.id === selectedId} project={project} onSelect={() => selectTarget(t.id)} onOpen={() => openCard(t.id)} />
      ))}
    </svg>
  );
}

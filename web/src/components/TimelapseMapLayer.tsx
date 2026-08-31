import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { C } from '../selectors';
import { entityStatesAtTime, groupByEntity, TIMELAPSE_LAYERS } from '../timelapse';
import type { EntityState, TimelapseLayerId } from '../timelapse';

type ProjectLL = (lng: number, lat: number) => { x: number; y: number };

// How long the flash-on-toggle ring plays for (theme.css's twbmarkerflash
// keyframes run 0.6s, repeated 3x below — kept in sync with that 1.8s
// total so the "flashing" state doesn't linger past the last ring cycle).
const FLASH_DURATION_MS = 1800;

function affiliationColor(a: string | null): string {
  return a === 'HOS' ? C.red : a === 'UNK' ? C.yellow : a === 'FRD' ? C.cyan : a === 'NEU' ? C.green : C.dim;
}

function EntityTrail({ e, project }: { e: EntityState; project: ProjectLL }) {
  if (e.trail.length === 0) return null;
  const color = affiliationColor(e.current.affiliation);
  const points = [e.current, ...e.trail].map((p) => project(p.lng, p.lat));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return <path className="timelapse-map-layer-trail" d={d} fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.4} strokeDasharray="1 3" />;
}

function EntityMarker({ e, project, flashing }: { e: EntityState; project: ProjectLL; flashing: boolean }) {
  const { x, y } = project(e.current.lng, e.current.lat);
  const color = affiliationColor(e.current.affiliation);
  return (
    <g className="timelapse-map-layer-marker">
      {flashing && (
        <circle
          className="timelapse-map-layer-marker-flash-ring"
          cx={x}
          cy={y}
          r={4}
          fill="none"
          stroke={color}
          strokeWidth={2}
          style={{ animation: 'twbmarkerflash 0.6s ease-out 3' }}
        />
      )}
      <circle className="timelapse-map-layer-marker-dot" cx={x} cy={y} r={4} fill="#0a1316" stroke={color} strokeWidth={1.6} />
      <circle className="timelapse-map-layer-marker-core" cx={x} cy={y} r={1.4} fill={color} />
      <rect className="timelapse-map-layer-marker-label-bg" x={x + 7} y={y - 9} width={Math.max(40, e.name.length * 4.4)} height={11} fill="rgba(7,11,12,.72)" />
      <text className="timelapse-map-layer-marker-label" x={x + 9} y={y - 1} fill={color} fontSize={8} fontFamily="IBM Plex Mono" opacity={0.92}>
        {e.name}
      </text>
    </g>
  );
}

// One instance per TimelapseLayerId, each reading only its own slot of
// timelapseByLayer — pulled out as its own component (rather than a plain
// helper called in a .map()) because it needs its own useMemo pair per
// layer, and hooks can't be called from inside a loop body. This is what
// keeps AIR's and MARITIME's playback fully independent: each layer has
// its own features/cursor/visible, so one showing or hiding on the map
// never touches another's.
function TimelapseLayerGroup({ layerId, project }: { layerId: TimelapseLayerId; project: ProjectLL }) {
  const layer = useStore((s) => s.timelapseByLayer[layerId]);

  // Split in two so the expensive part (grouping + per-entity sort) only
  // reruns when `features` actually changes (once per Load), not on every
  // playback tick — `cursor` updates 5x/second while playing (see
  // LayerManager's usePlaybackTick), and entityStatesAtTime's binary
  // search over the already-grouped map is cheap enough to redo on every
  // one of those without re-grouping from scratch each time.
  const grouped = useMemo(() => groupByEntity(layer.features), [layer.features]);
  const visibleEntities = useMemo(() => (layer.cursor ? entityStatesAtTime(grouped, layer.cursor) : []), [grouped, layer.cursor]);

  // Plays a brief flash ring on every marker the moment this layer's
  // TIMELAPSE checkbox flips from off to on — a satellite's small dot (or
  // any marker scattered off wherever the map happens to be centered) is
  // easy to miss at a glance otherwise. Component stays mounted whether or
  // not it's currently rendering anything (see the early return below), so
  // this ref-tracked "was it on last render" survives the visible↔hidden
  // toggle instead of resetting every time.
  const [flashing, setFlashing] = useState(false);
  const wasVisibleRef = useRef(layer.visible);
  useEffect(() => {
    const justTurnedOn = layer.visible && !wasVisibleRef.current;
    wasVisibleRef.current = layer.visible;
    if (!justTurnedOn) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => clearTimeout(t);
  }, [layer.visible]);

  if (!layer.visible || visibleEntities.length === 0) return null;

  return (
    <>
      {visibleEntities.map((e) => (
        <EntityTrail key={`${layerId}-${e.entityId}-trail`} e={e} project={project} />
      ))}
      {visibleEntities.map((e) => (
        <EntityMarker key={`${layerId}-${e.entityId}`} e={e} project={project} flashing={flashing} />
      ))}
    </>
  );
}

export default function TimelapseMapLayer({ project, width, height }: { project: ProjectLL; width: number; height: number }) {
  return (
    <svg className="timelapse-map-layer" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {TIMELAPSE_LAYERS.map((l) => (
        <TimelapseLayerGroup key={l.id} layerId={l.id} project={project} />
      ))}
    </svg>
  );
}

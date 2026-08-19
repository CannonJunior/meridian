import { useEffect, useRef, useState } from 'react';
import { AttributionControl, Map as MaplibreMap, type RasterTileSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store';
import { affColor } from '../selectors';
import { statusMeta } from '../oobSelectors';
import type { ObjectStatus } from '../assets/oob';
import { AO_BOUNDS, AO_CENTER, BASEMAP_STYLES, toLngLat } from '../mapProjection';
import type { Sensor, Target } from '../types';
import OobMapLayer from './OobMapLayer';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import type { ContextLayer } from '../assets/contextLayers';
import { loadContextLayerData } from '../contextLayerData';
import { portFeatureFromGeoJSON } from '../portFeature';
import { airfieldFeatureFromGeoJSON } from '../airfieldFeature';
import { fetchLatestRadarTileUrl } from '../rainviewer';

type ProjectFn = (x: number, y: number) => { x: number; y: number };

const OOB_LEGEND_ROWS: { status: ObjectStatus; glyph?: string }[] = [
  { status: 'VISIBLE' },
  { status: 'UNIDENTIFIED', glyph: '?' },
  { status: 'MISIDENTIFIED', glyph: '?' },
  { status: 'OBSCURED' },
  { status: 'UNKNOWN' },
  { status: 'DESTROYED', glyph: '╳' },
];

function outlineLayerId(layerId: string): string {
  return `${layerId}-outline`;
}
function pointLayerId(layerId: string): string {
  return `${layerId}-point`;
}

// The MapLibre layer that should receive click/hover interaction for a
// context layer: for plain point layers (ports) that's the base layer
// itself; for 'mixed' layers (airfields) the polygons stay non-interactive
// and only the dedicated point sub-layer is identifiable.
function identifyLayerId(layer: ContextLayer): string {
  const base = `ctx-layer-${layer.id}`;
  return layer.geometryType === 'mixed' ? pointLayerId(base) : base;
}

// Context layers are external GeoJSON overlays (GeoServer WFS), rendered as
// native MapLibre vector layers (point -> circle; polygon -> fill + line
// outline; mixed -> fill + line outline + a circle for the one identifiable
// point per feature group) — real feature hit-testing instead of
// raster-tile pixels. map.setStyle() wipes all custom sources/layers, so
// this must be re-run after every style swap, not just when the visibility
// toggle changes. Adding is async (data must be fetched/cached first), so
// re-check desired visibility once the fetch resolves in case the user
// toggled it back off in the meantime.
// Builds line paint for a 'line' geometry context layer: a per-feature
// MapLibre `match` expression keyed on layer.lineColorProperty when the
// layer defines one (e.g. shipping lanes' Major/Middle/Minor `lane_type`),
// falling back to the layer's flat line* fields otherwise.
function buildLinePaint(layer: ContextLayer): Record<string, unknown> {
  const { lineColorProperty, lineColorMap, lineWidthMap, lineOpacityMap } = layer;
  if (lineColorProperty && lineColorMap) {
    const toMatch = (map: Record<string, number> | undefined, fallback: number) => {
      if (!map) return fallback;
      const expr: unknown[] = ['match', ['get', lineColorProperty]];
      for (const [k, v] of Object.entries(map)) expr.push(k, v);
      expr.push(fallback);
      return expr;
    };
    const colorExpr: unknown[] = ['match', ['get', lineColorProperty]];
    for (const [k, v] of Object.entries(lineColorMap)) colorExpr.push(k, v);
    colorExpr.push(layer.lineColor ?? '#ffffff');
    return {
      'line-color': colorExpr,
      'line-width': toMatch(lineWidthMap, layer.lineWidth ?? 1),
      'line-opacity': toMatch(lineOpacityMap, layer.lineOpacity ?? 0.6),
    };
  }
  return {
    'line-color': layer.lineColor ?? '#ffffff',
    'line-width': layer.lineWidth ?? 1,
    'line-opacity': layer.lineOpacity ?? 0.6,
  };
}

function syncContextLayers(map: MaplibreMap, visibility: Record<string, boolean>) {
  for (const layer of CONTEXT_LAYERS) {
    const srcId = `ctx-src-${layer.id}`;
    const layerId = `ctx-layer-${layer.id}`;
    const shouldShow = !!visibility[layer.id];
    const hasLayer = !!map.getLayer(layerId);

    if (layer.geometryType === 'raster') {
      if (shouldShow && !hasLayer) {
        fetchLatestRadarTileUrl()
          .then((url) => {
            if (!useStore.getState().contextLayerVisibility[layer.id] || map.getLayer(layerId)) return;
            // RainViewer's tile server tops out at zoom 7 (returns a "Zoom
            // Level Not Supported" placeholder image beyond that) — maxzoom
            // tells MapLibre to keep requesting z7 tiles and upsample them
            // for closer views instead of requesting nonexistent z8+ tiles.
            if (!map.getSource(srcId)) map.addSource(srcId, { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 7 });
            map.addLayer({ id: layerId, type: 'raster', source: srcId, paint: { 'raster-opacity': layer.rasterOpacity ?? 0.6 } });
          })
          .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
      } else if (!shouldShow && hasLayer) {
        map.removeLayer(layerId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      }
      continue;
    }

    if (shouldShow && !hasLayer) {
      loadContextLayerData(layer)
        .then((geojson) => {
          if (!useStore.getState().contextLayerVisibility[layer.id] || map.getLayer(layerId)) return;
          if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: geojson });

          if (layer.geometryType === 'polygon' || layer.geometryType === 'mixed') {
            // Airfields carry a `kind` property (boundary/runway/taxiway/
            // centerpoint) — style each differently, matching the
            // GeoServer-side SLD used for non-MapLibre WMS consumers
            // (geoserver-init/airfields_style.sld). Fill/line layers only
            // ever draw polygon geometry, so the centerpoint features are
            // naturally ignored here. Other polygon layers (e.g. EEZ) have
            // no `kind` property and use their own flat paint overrides
            // instead (see ContextLayer.polygon* fields).
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: srcId,
              paint:
                layer.id === 'airfields'
                  ? {
                      'fill-color': ['match', ['get', 'kind'], 'boundary', '#ffab38', 'runway', '#cdd9d7', 'taxiway', '#9fb2ae', '#5fe39a'],
                      'fill-opacity': ['match', ['get', 'kind'], 'boundary', 0.06, 'runway', 0.85, 'taxiway', 0.7, 0.5],
                    }
                  : {
                      'fill-color': layer.polygonFillColor ?? '#5fe39a',
                      'fill-opacity': layer.polygonFillOpacity ?? 0.5,
                    },
            });
            map.addLayer({
              id: outlineLayerId(layerId),
              type: 'line',
              source: srcId,
              paint:
                layer.id === 'airfields'
                  ? {
                      'line-color': ['match', ['get', 'kind'], 'boundary', '#ffab38', '#06090a'],
                      'line-width': ['match', ['get', 'kind'], 'boundary', 1.2, 0.4],
                    }
                  : {
                      'line-color': layer.polygonLineColor ?? '#06090a',
                      'line-width': layer.polygonLineWidth ?? 0.4,
                      ...(layer.polygonLineDasharray ? { 'line-dasharray': layer.polygonLineDasharray } : {}),
                    },
            });
          }
          if (layer.geometryType === 'line') {
            map.addLayer({
              id: layerId,
              type: 'line',
              source: srcId,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: buildLinePaint(layer),
            });
          }
          if (layer.geometryType === 'point' || layer.geometryType === 'mixed') {
            // Circle layers only ever draw point geometry, so for 'mixed'
            // this naturally picks out just the centerpoint features.
            const id = layer.geometryType === 'mixed' ? pointLayerId(layerId) : layerId;
            map.addLayer({
              id,
              type: 'circle',
              source: srcId,
              filter: layer.geometryType === 'mixed' ? ['==', ['get', 'kind'], 'centerpoint'] : undefined,
              paint: {
                'circle-radius': layer.geometryType === 'mixed' ? 5 : 3,
                'circle-color': layer.pointColor ?? '#3fd2e6',
                'circle-opacity': 0.85,
                'circle-stroke-color': '#06090a',
                'circle-stroke-width': 0.6,
              },
            });
          }
        })
        .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
    } else if (!shouldShow && hasLayer) {
      for (const id of [layerId, outlineLayerId(layerId), pointLayerId(layerId)]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(srcId)) map.removeSource(srcId);
    }
  }
}

// `style.load` is not consistently reliable to catch right after a
// setStyle() call (it can fire before the listener is attached, or not at
// all in some MapLibre versions/timings). Polling isStyleLoaded() is the
// robust way to know when it's safe to add sources/layers again.
function whenStyleReady(map: MaplibreMap, cb: () => void) {
  if (map.isStyleLoaded()) {
    cb();
    return;
  }
  const check = () => {
    if (map.isStyleLoaded()) cb();
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function SensorCoverage({ s, project }: { s: Sensor; project: ProjectFn }) {
  const { x: sx, y: sy } = project(s.x, s.y);
  if (s.cov === 'cone') {
    const a = ((s.covDir ?? 120) * Math.PI) / 180;
    const sp = 0.5;
    const len = 240;
    const x1 = sx + Math.cos(a - sp) * len;
    const y1 = sy + Math.sin(a - sp) * len;
    const x2 = sx + Math.cos(a + sp) * len;
    const y2 = sy + Math.sin(a + sp) * len;
    return <polygon className="sensor-coverage-cone" points={`${sx},${sy} ${x1},${y1} ${x2},${y2}`} fill="rgba(63,210,230,.045)" stroke="rgba(63,210,230,.18)" strokeWidth={1} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />;
  }
  if (s.cov === 'wide') {
    return <ellipse className="sensor-coverage-wide" cx={sx} cy={sy + 30} rx={230} ry={120} fill="rgba(63,210,230,.035)" stroke="rgba(63,210,230,.14)" strokeWidth={1} strokeDasharray="4 5" style={{ pointerEvents: 'none' }} />;
  }
  if (s.cov === 'area') {
    return <circle className="sensor-coverage-area" cx={sx} cy={sy} r={200} fill="rgba(91,157,255,.03)" stroke="rgba(91,157,255,.12)" strokeWidth={1} strokeDasharray="3 6" style={{ pointerEvents: 'none' }} />;
  }
  return null;
}

function TrackSymbol({ t, selected, project, onSelect, onOpen }: { t: Target; selected: boolean; project: ProjectFn; onSelect: () => void; onOpen: () => void }) {
  if (t.stage === 4 && t.id !== 'T2198') return null;
  const { x, y } = project(t.x, t.y);
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

function MapOverlaySvg({ project, width, height }: { project: ProjectFn; width: number; height: number }) {
  const nais = useStore((s) => s.nais);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);
  const targets = useStore((s) => s.targets);
  const selectedId = useStore((s) => s.selectedId);
  const selectTarget = useStore((s) => s.selectTarget);
  const openCard = useStore((s) => s.openCard);
  const openEntity = useStore((s) => s.openEntity);

  const drift = targets.find((t) => t.id === 'T2210');
  const ownship = project(12, 86);
  const bullseye = project(50, 46);

  return (
    <svg className="map-overlay-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[120, 230, 340, 460].map((r) => (
        <circle key={`ring${r}`} className="map-overlay-ownship-ring" cx={ownship.x} cy={ownship.y} r={r} fill="none" stroke="rgba(63,210,230,.10)" strokeWidth={1} strokeDasharray="2 7" style={{ pointerEvents: 'none' }} />
      ))}

      {[16, 38, 66].map((r) => (
        <circle key={`bulls${r}`} className="map-overlay-bullseye-ring" cx={bullseye.x} cy={bullseye.y} r={r} fill="none" stroke="rgba(255,171,56,.18)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      ))}
      <line className="map-overlay-bullseye-line-v" x1={bullseye.x} y1={bullseye.y - 72} x2={bullseye.x} y2={bullseye.y + 72} stroke="rgba(255,171,56,.16)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <line className="map-overlay-bullseye-line-h" x1={bullseye.x - 72} y1={bullseye.y} x2={bullseye.x + 72} y2={bullseye.y} stroke="rgba(255,171,56,.16)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <text className="map-overlay-bullseye-label" x={bullseye.x + 70} y={bullseye.y - 50} fill="#7a5e24" fontSize={9} fontFamily="IBM Plex Mono" letterSpacing={1} style={{ pointerEvents: 'none' }}>
        BULLSEYE
      </text>

      {nais.map((n) => {
        const p1 = project(n.x, n.y);
        const p2 = project(n.x + n.w, n.y + n.h);
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

      {sensors.map((s) => (
        <SensorCoverage key={`cov-${s.id}`} s={s} project={project} />
      ))}

      {sensors.map((s) => {
        const { x: sx, y: sy } = project(s.x, s.y);
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
        const { x: dx, y: dy } = project(drift.x, drift.y);
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
        const { x: fx, y: fy } = project(u.x, u.y);
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

function StylePicker() {
  const basemapId = useStore((s) => s.basemapId);
  const setBasemap = useStore((s) => s.setBasemap);
  return (
    <div className="style-picker" style={{ position: 'absolute', right: 14, top: 82, display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}>
      {BASEMAP_STYLES.map((b) => (
        <div
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
        </div>
      ))}
    </div>
  );
}

export default function TacticalMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const basemapId = useStore((s) => s.basemapId);
  const legendMode = useStore((s) => s.legendMode);
  // Tracks which basemap style is actually applied to the current map
  // instance, so this effect is a no-op when basemapId hasn't really
  // changed (covers React StrictMode's dev-mode double-invoke of mount
  // effects, which would otherwise fire a redundant, racing setStyle()).
  const appliedBasemapId = useRef(basemapId);
  const [, bumpRender] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const style = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    const map = new MaplibreMap({
      container: containerRef.current,
      style: style.styleUrl,
      center: AO_CENTER,
      zoom: 10,
      minZoom: 0,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    mapRef.current = map;

    const rerender = () => bumpRender((v) => v + 1);
    map.on('move', rerender);
    map.on('load', () => {
      map.fitBounds(
        [
          [AO_BOUNDS.west, AO_BOUNDS.south],
          [AO_BOUNDS.east, AO_BOUNDS.north],
        ],
        { padding: 24, duration: 0 },
      );
      rerender();
    });

    // Layer-scoped listeners are safe to register even before the layer
    // exists (e.g. the context layer is toggled off at mount) — MapLibre
    // simply finds no features to hit-test until it's added.
    for (const layer of CONTEXT_LAYERS.filter((l) => l.identifiable)) {
      const targetLayerId = identifyLayerId(layer);
      map.on('dblclick', targetLayerId, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        if (layer.id === 'airfields') useStore.getState().openAirfield(airfieldFeatureFromGeoJSON(feature));
        else if (layer.id === 'tenth-fleet') useStore.getState().openOob(feature.properties!.oobId as string);
        else useStore.getState().openPort(portFeatureFromGeoJSON(feature));
      });
      map.on('mouseenter', targetLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', targetLayerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: box.width, h: box.height });
      map.resize();
      rerender();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapId === appliedBasemapId.current) return;
    appliedBasemapId.current = basemapId;
    const style = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    map.setStyle(style.styleUrl);
    whenStyleReady(map, () => syncContextLayers(map, useStore.getState().contextLayerVisibility));
  }, [basemapId]);

  const contextLayerVisibility = useStore((s) => s.contextLayerVisibility);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenStyleReady(map, () => syncContextLayers(map, contextLayerVisibility));
  }, [contextLayerVisibility]);

  // RainViewer's mosaic advances roughly every 10 minutes — re-poll on that
  // cadence and swap the live tile URL in place (no source/layer teardown)
  // so the radar layer stays current while toggled on.
  const radarVisible = contextLayerVisibility['weather-radar'];
  useEffect(() => {
    if (!radarVisible) return;
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource('ctx-src-weather-radar');
      if (!src) return;
      fetchLatestRadarTileUrl()
        .then((url) => (src as RasterTileSource).setTiles([url]))
        .catch((err) => console.error('Failed to refresh weather-radar tiles', err));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [radarVisible]);

  const flyToRequest = useStore((s) => s.flyToRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToRequest) return;
    map.flyTo({ center: [flyToRequest.lng, flyToRequest.lat], zoom: flyToRequest.zoom, duration: 1200 });
  }, [flyToRequest]);

  const project: ProjectFn = (x, y) => {
    const map = mapRef.current;
    if (!map) return { x: -9999, y: -9999 };
    const [lng, lat] = toLngLat(x, y);
    const p = map.project([lng, lat]);
    return { x: p.x, y: p.y };
  };

  const projectLL: ProjectFn = (lng, lat) => {
    const map = mapRef.current;
    if (!map) return { x: -9999, y: -9999 };
    const p = map.project([lng, lat]);
    return { x: p.x, y: p.y };
  };

  return (
    <div className="tactical-map" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#05080a' }}>
      <div ref={containerRef} className="tactical-map-container" style={{ position: 'absolute', inset: 0 }} />

      {size.w > 0 && (
        <div className="tactical-map-overlay-wrap" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <OobMapLayer project={projectLL} width={size.w} height={size.h} />
          <MapOverlaySvg project={project} width={size.w} height={size.h} />
        </div>
      )}

      <div className="tactical-map-scanline" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, background: 'linear-gradient(180deg,rgba(63,210,230,0),rgba(63,210,230,.05))', pointerEvents: 'none', animation: 'twbscan 9s linear infinite' }} />

      <div className="tactical-map-corner-bracket-tl" style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-tr" style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-bl" style={{ position: 'absolute', bottom: 8, left: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-br" style={{ position: 'absolute', bottom: 8, right: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />

      <div className="tactical-map-legend" style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(8,13,14,.82)', border: '1px solid var(--hairline-mid)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
        {legendMode === 'AFFILIATION' ? (
          <>
            <div className="tactical-map-legend-title" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 1 }}>TRACK AFFILIATION</div>
            <div className="tactical-map-legend-row-hostile" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-hostile" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--red)', transform: 'rotate(45deg)' }} />
              <span className="tactical-map-legend-label-hostile" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>HOSTILE</span>
            </div>
            <div className="tactical-map-legend-row-unknown" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-unknown" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--yellow)' }} />
              <span className="tactical-map-legend-label-unknown" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>UNKNOWN</span>
            </div>
            <div className="tactical-map-legend-row-friendly" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-friendly" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--cyan)', borderRadius: '50%' }} />
              <span className="tactical-map-legend-label-friendly" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>FRIENDLY</span>
            </div>
            <div className="tactical-map-legend-row-neutral" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-neutral" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--green)' }} />
              <span className="tactical-map-legend-label-neutral" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>NEUTRAL / NSL</span>
            </div>
          </>
        ) : (
          <>
            <div className="tactical-map-legend-title" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 1 }}>OOB SYMBOLOGY</div>
            {OOB_LEGEND_ROWS.map((row) => {
              const meta = statusMeta(row.status);
              return (
                <div key={row.status} className="tactical-map-legend-row-oob" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    className="tactical-map-legend-swatch-oob"
                    style={{
                      width: 10,
                      height: 10,
                      background: '#0c1416',
                      border: `1.5px ${meta.dash ? 'dashed' : 'solid'} ${meta.color}`,
                      transform: 'rotate(45deg)',
                      opacity: meta.opacity,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {row.glyph ? (
                      <span className="tactical-map-legend-swatch-oob-glyph" style={{ transform: 'rotate(-45deg)', fontSize: 7, lineHeight: 1, color: meta.color, fontWeight: 700 }}>{row.glyph}</span>
                    ) : (
                      <span className="tactical-map-legend-swatch-oob-dot" style={{ width: 2, height: 2, borderRadius: '50%', background: meta.color }} />
                    )}
                  </span>
                  <span className="tactical-map-legend-label-oob" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>{meta.label}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      <StylePicker />
    </div>
  );
}

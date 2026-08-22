import { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import OlMap from 'ol/Map';
import View from 'ol/View';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormat from 'ol/format/GeoJSON';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import type { FeatureLike } from 'ol/Feature';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { defaults as defaultControls } from 'ol/control/defaults';
import Attribution from 'ol/control/Attribution';
import { useStore } from '../store';
import { affColor } from '../selectors';
import { statusMeta } from '../oobSelectors';
import type { ObjectStatus } from '../assets/oob';
import { hexToRgba } from '../assets/palette';
import { AO_BOUNDS, AO_CENTER, BASEMAP_STYLES, PROJECTION_OPTIONS, registerProjections } from '../mapProjection';
import type { Sensor, Target } from '../types';
import OobMapLayer from './OobMapLayer';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import type { ContextLayer } from '../assets/contextLayers';
import { loadContextLayerData } from '../contextLayerData';
import { portFeatureFromGeoJSON } from '../portFeature';
import { airfieldFeatureFromGeoJSON } from '../airfieldFeature';
import { fetchLatestRadarTileUrl } from '../rainviewer';
import type { Feature, FeatureCollection, Point } from 'geojson';

type ProjectFn = (lng: number, lat: number) => { x: number; y: number };

registerProjections();

const OOB_LEGEND_ROWS: { status: ObjectStatus; glyph?: string }[] = [
  { status: 'VISIBLE' },
  { status: 'UNIDENTIFIED', glyph: '?' },
  { status: 'MISIDENTIFIED', glyph: '?' },
  { status: 'OBSCURED' },
  { status: 'UNKNOWN' },
  { status: 'DESTROYED', glyph: '╳' },
];

// CARTO's retina-tile convention: `{r}` becomes `@2x` on a high-DPI screen,
// empty otherwise. OpenLayers' XYZ source has no equivalent placeholder, so
// it's resolved once here instead of left in the template.
function resolveTileUrls(templates: string[]): string[] {
  const r = window.devicePixelRatio >= 2 ? '@2x' : '';
  return templates.map((t) => t.replace('{r}', r));
}

function densifySegment(a: [number, number], b: [number, number], stepDeg: number): [number, number][] {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / stepDeg));
  const out: [number, number][] = [];
  for (let s = 0; s < steps; s++) {
    const t = s / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// Turns a line-geometry WFS layer's own vertices into a weighted point
// FeatureCollection for a heatmap layer — used when there's no real
// point-density/raster source for what the layer is trying to show (see
// shipping-traffic-intensity, contextLayers.ts). Segments are densified
// (extra points inserted every ~0.5°) so long, sparsely-vertexed open-ocean
// stretches don't read as gaps in the heat trail.
function buildHeatmapPoints(layer: ContextLayer, geojson: FeatureCollection): FeatureCollection {
  const STEP_DEG = 0.5;
  const weightProp = layer.heatmapWeightProperty;
  const weightMap = layer.heatmapWeightMap ?? {};
  const points: Feature<Point, { weight: number }>[] = [];
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const lines: [number, number][][] =
      geom.type === 'LineString'
        ? [geom.coordinates as [number, number][]]
        : geom.type === 'MultiLineString'
          ? (geom.coordinates as [number, number][][])
          : [];
    const weight = weightProp ? (weightMap[String((feature.properties ?? {})[weightProp])] ?? 1) : 1;
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        for (const pt of densifySegment(line[i], line[i + 1], STEP_DEG)) {
          points.push({ type: 'Feature', properties: { weight }, geometry: { type: 'Point', coordinates: pt } });
        }
      }
      const last = line[line.length - 1];
      if (last) points.push({ type: 'Feature', properties: { weight }, geometry: { type: 'Point', coordinates: last } });
    }
  }
  return { type: 'FeatureCollection', features: points };
}

// Every vector source is read with a fixed internal storage projection
// (EPSG:3857) regardless of the view's current projection — OpenLayers
// reprojects vector (and raster) layers on the fly at render time when a
// layer's data projection differs from the view's, so switching projection
// via the picker never requires re-fetching or re-parsing any layer.
const FEATURE_STORAGE_PROJECTION = 'EPSG:3857';
const geoJSONFormat = new GeoJSONFormat({ dataProjection: 'EPSG:4326', featureProjection: FEATURE_STORAGE_PROJECTION });

// Builds the OL style for a 'polygon' or 'mixed' geometry context layer.
// Airfields (the one 'mixed' layer) carries a `kind` property
// (boundary/runway/taxiway/centerpoint) — style each differently, matching
// the GeoServer-side SLD used for non-OpenLayers WMS consumers
// (geoserver-init/airfields_style.sld). Point (centerpoint) features get a
// circle style instead of fill/stroke. Other polygon layers (e.g. EEZ) have
// no `kind` property and use their own flat paint overrides instead (see
// ContextLayer.polygon* fields).
function polygonStyleFor(layer: ContextLayer) {
  return (feature: FeatureLike): Style => {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'Point') {
      return new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: layer.pointColor ?? '#3fd2e6' }), stroke: new Stroke({ color: '#06090a', width: 0.6 }) }) });
    }
    if (layer.id === 'airfields') {
      const kind = feature.get('kind') as string | undefined;
      const fillColor = kind === 'boundary' ? '#ffab38' : kind === 'runway' ? '#cdd9d7' : kind === 'taxiway' ? '#9fb2ae' : '#5fe39a';
      const fillOpacity = kind === 'boundary' ? 0.06 : kind === 'runway' ? 0.85 : kind === 'taxiway' ? 0.7 : 0.5;
      const lineColor = kind === 'boundary' ? '#ffab38' : '#06090a';
      const lineWidth = kind === 'boundary' ? 1.2 : 0.4;
      return new Style({ fill: new Fill({ color: hexToRgba(fillColor, fillOpacity) }), stroke: new Stroke({ color: lineColor, width: lineWidth }) });
    }
    return new Style({
      fill: new Fill({ color: hexToRgba(layer.polygonFillColor ?? '#5fe39a', layer.polygonFillOpacity ?? 0.5) }),
      stroke: new Stroke({ color: layer.polygonLineColor ?? '#06090a', width: layer.polygonLineWidth ?? 0.4, lineDash: layer.polygonLineDasharray }),
    });
  };
}

// Builds the OL style for a 'line' geometry context layer: per-feature
// color/width/opacity keyed on layer.lineColorProperty when the layer
// defines one (e.g. shipping lanes' major/middle/minor/chokepoint
// `lane_type`), falling back to the layer's flat line* fields for
// unmatched values or when no lineColorProperty is set.
function lineStyleFor(layer: ContextLayer) {
  const { lineColorProperty, lineColorMap, lineWidthMap, lineOpacityMap } = layer;
  return (feature: FeatureLike): Style => {
    let color = layer.lineColor ?? '#ffffff';
    let width = layer.lineWidth ?? 1;
    let opacity = layer.lineOpacity ?? 0.6;
    if (lineColorProperty && lineColorMap) {
      const key = String(feature.get(lineColorProperty));
      color = lineColorMap[key] ?? color;
      width = lineWidthMap?.[key] ?? width;
      opacity = lineOpacityMap?.[key] ?? opacity;
    }
    return new Style({ stroke: new Stroke({ color: hexToRgba(color, opacity), width }) });
  };
}

function syncContextLayers(map: OlMap, visibility: Record<string, boolean>, layerRefs: Map<string, BaseLayer>, radarUrlRef: { current: string | null }) {
  for (const layer of CONTEXT_LAYERS) {
    const shouldShow = !!visibility[layer.id];
    const hasLayer = layerRefs.has(layer.id);

    if (layer.geometryType === 'raster') {
      if (shouldShow && !hasLayer) {
        // weather-radar's tile URL changes every ~10min (see rainviewer.ts)
        // and must be re-resolved each time it's turned on; every other
        // raster layer's URL is a fixed template, already sitting on
        // layer.rasterTileUrl — resolve immediately, no fetch needed.
        const urlPromise = layer.id === 'weather-radar' ? fetchLatestRadarTileUrl() : Promise.resolve(layer.rasterTileUrl!);
        urlPromise
          .then((url) => {
            if (!useStore.getState().contextLayerVisibility[layer.id] || layerRefs.has(layer.id)) return;
            if (layer.id === 'weather-radar') radarUrlRef.current = url;
            const olLayer = new TileLayer({
              source: new XYZ({ url, maxZoom: layer.rasterMaxZoom, attributions: layer.attribution }),
              opacity: layer.rasterOpacity ?? 0.6,
            });
            layerRefs.set(layer.id, olLayer);
            map.addLayer(olLayer);
          })
          .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
      } else if (!shouldShow && hasLayer) {
        map.removeLayer(layerRefs.get(layer.id)!);
        layerRefs.delete(layer.id);
      }
      continue;
    }

    if (shouldShow && !hasLayer) {
      loadContextLayerData(layer)
        .then((geojson) => {
          if (!useStore.getState().contextLayerVisibility[layer.id] || layerRefs.has(layer.id)) return;

          if (layer.geometryType === 'heatmap') {
            const points = buildHeatmapPoints(layer, geojson);
            const source = new VectorSource({ features: geoJSONFormat.readFeatures(points) });
            const olLayer = new HeatmapLayer({
              source,
              weight: (f) => (f.get('weight') as number) ?? 1,
              radius: 10,
              blur: 16,
              gradient: ['rgba(0,0,0,0)', 'rgba(63,210,230,.6)', 'rgba(95,227,154,.75)', 'rgba(255,214,10,.85)', 'rgba(255,171,56,.9)', 'rgba(255,90,71,.95)'],
              opacity: 0.7,
            });
            layerRefs.set(layer.id, olLayer);
            map.addLayer(olLayer);
            return;
          }

          const source = new VectorSource({ features: geoJSONFormat.readFeatures(geojson) });
          let olLayer: BaseLayer;
          if (layer.geometryType === 'polygon' || layer.geometryType === 'mixed') {
            olLayer = new VectorLayer({ source, style: polygonStyleFor(layer) });
          } else if (layer.geometryType === 'line') {
            olLayer = new VectorLayer({ source, style: lineStyleFor(layer) });
          } else {
            olLayer = new VectorLayer({
              source,
              style: new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: layer.pointColor ?? '#3fd2e6' }), stroke: new Stroke({ color: '#06090a', width: 0.6 }) }) }),
            });
          }
          layerRefs.set(layer.id, olLayer);
          map.addLayer(olLayer);
        })
        .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
    } else if (!shouldShow && hasLayer) {
      map.removeLayer(layerRefs.get(layer.id)!);
      layerRefs.delete(layer.id);
    }
  }
}

function SensorCoverage({ s, project }: { s: Sensor; project: ProjectFn }) {
  const { x: sx, y: sy } = project(s.lng, s.lat);
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
  // Fixed reference points on the picture, not tied to any live entity —
  // real lng/lat equivalent to the old abstract grid's (12,86) and
  // (50,46), computed once via the AO's linear stretch (see seed.ts's
  // header comment for how every other fixed seed position was converted
  // the same way).
  const ownship = project(-5.942, 35.82);
  const bullseye = project(-5.6, 36.02);

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

      {sensors.map((s) => (
        <SensorCoverage key={`cov-${s.id}`} s={s} project={project} />
      ))}

      {sensors.map((s) => {
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

function StylePicker() {
  const basemapId = useStore((s) => s.basemapId);
  const setBasemap = useStore((s) => s.setBasemap);
  const mapProjectionCode = useStore((s) => s.mapProjectionCode);
  const setMapProjectionCode = useStore((s) => s.setMapProjectionCode);
  return (
    <div className="style-picker" style={{ position: 'absolute', right: 14, top: 82, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="style-picker-basemap-group" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}>
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
      <div className="style-picker-projection-group" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-mid)', background: 'rgba(8,13,14,.82)' }}>
        {PROJECTION_OPTIONS.map((p) => (
          <div
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
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TacticalMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const layerRefs = useRef(new Map<string, BaseLayer>());
  const radarUrlRef = useRef<string | null>(null);
  const basemapId = useStore((s) => s.basemapId);
  const mapProjectionCode = useStore((s) => s.mapProjectionCode);
  const legendMode = useStore((s) => s.legendMode);
  const [, bumpRender] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const basemap = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    const projection = mapProjectionCode;

    const baseLayer = new TileLayer({ source: new XYZ({ urls: resolveTileUrls(basemap.tileUrlTemplates), attributions: basemap.attribution }) });
    baseLayerRef.current = baseLayer;

    const view = new View({ projection, center: fromLonLat(AO_CENTER, projection), zoom: 10, minZoom: 0 });

    const map = new OlMap({
      target: containerRef.current,
      layers: [baseLayer],
      view,
      // doubleClickZoom is on by default — off here since double-click is
      // this app's "identify" gesture (open a port/airfield/OOB card), not
      // a zoom trigger.
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false, doubleClickZoom: false }),
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }).extend([new Attribution({ collapsible: false })]),
    });
    mapRef.current = map;

    const rerender = () => bumpRender((v) => v + 1);
    map.on('postrender', rerender);
    view.fit(transformExtent([AO_BOUNDS.west, AO_BOUNDS.south, AO_BOUNDS.east, AO_BOUNDS.north], 'EPSG:4326', projection), { padding: [24, 24, 24, 24], duration: 0 });

    // One map-level dblclick/pointermove pair covers every identifiable
    // context layer — OpenLayers doesn't have MapLibre's per-layer-id event
    // binding, so identify which ContextLayer (if any) owns the hit OL
    // layer via layerRefs. 'mixed' layers (airfields) only treat their
    // Point (centerpoint) features as identifiable, same as before —
    // boundary/runway/taxiway polygons stay non-interactive.
    const identifiableLayers = CONTEXT_LAYERS.filter((l) => l.identifiable);
    const layerFilter = (l: BaseLayer) => identifiableLayers.some((cl) => layerRefs.current.get(cl.id) === l);

    map.on('dblclick', (evt) => {
      const hit = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, olLayer) => {
          const layer = identifiableLayers.find((cl) => layerRefs.current.get(cl.id) === olLayer);
          if (!layer) return undefined;
          if (layer.geometryType === 'mixed' && feature.getGeometry()?.getType() !== 'Point') return undefined;
          return { feature, layer };
        },
        { layerFilter, hitTolerance: 6 },
      );
      if (!hit) return;
      // Features are always parsed into FEATURE_STORAGE_PROJECTION
      // (EPSG:3857), independent of whatever the view's current projection
      // is — reproject from that fixed storage projection, not the view's.
      if (hit.layer.id === 'airfields') useStore.getState().openAirfield(airfieldFeatureFromGeoJSON(hit.feature, FEATURE_STORAGE_PROJECTION));
      else if (hit.layer.id === 'tenth-fleet') useStore.getState().openOob(hit.feature.get('oobId') as string);
      else useStore.getState().openPort(portFeatureFromGeoJSON(hit.feature, FEATURE_STORAGE_PROJECTION));
    });
    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter, hitTolerance: 6 });
      const el = map.getTargetElement();
      if (el) el.style.cursor = hit ? 'pointer' : '';
    });

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: box.width, h: box.height });
      map.updateSize();
      rerender();
    });
    ro.observe(containerRef.current);

    const layers = layerRefs.current;
    return () => {
      ro.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      baseLayerRef.current = null;
      layers.clear();
    };
    // Basemap and projection changes are handled by their own effects below
    // (swap the base layer's source / rebuild the view in place) rather
    // than tearing down and remounting the whole map — only the initial
    // basemapId/mapProjectionCode values matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swapping the base layer's source (rather than MapLibre's old
  // map.setStyle(), which wiped every custom source/layer) means context
  // layers never need re-syncing after a basemap change — they live on the
  // map's layer collection independently of the base layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !baseLayerRef.current) return;
    const basemap = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    baseLayerRef.current.setSource(new XYZ({ urls: resolveTileUrls(basemap.tileUrlTemplates), attributions: basemap.attribution }));
  }, [basemapId]);

  // Switching projection means constructing a new View (OpenLayers has no
  // in-place projection change) — vector/raster layers need no touching at
  // all, since they were parsed into a fixed storage projection and
  // OpenLayers reprojects on the fly at render time whenever a layer's data
  // projection differs from the view's.
  const appliedProjectionCode = useRef(mapProjectionCode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapProjectionCode === appliedProjectionCode.current) return;
    const prevView = map.getView();
    const prevProjection = prevView.getProjection();
    const centerLngLat = toLonLat(prevView.getCenter() ?? fromLonLat(AO_CENTER, prevProjection), prevProjection);
    const nextView = new View({ projection: mapProjectionCode, center: fromLonLat(centerLngLat, mapProjectionCode), zoom: prevView.getZoom() ?? 10, minZoom: 0 });
    map.setView(nextView);
    appliedProjectionCode.current = mapProjectionCode;
  }, [mapProjectionCode]);

  const contextLayerVisibility = useStore((s) => s.contextLayerVisibility);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncContextLayers(map, contextLayerVisibility, layerRefs.current, radarUrlRef);
  }, [contextLayerVisibility]);

  // RainViewer's mosaic advances roughly every 10 minutes — re-poll on that
  // cadence and swap the live tile URL in place (no source/layer teardown)
  // so the radar layer stays current while toggled on.
  const radarVisible = contextLayerVisibility['weather-radar'];
  useEffect(() => {
    if (!radarVisible) return;
    const id = setInterval(() => {
      const olLayer = layerRefs.current.get('weather-radar') as TileLayer<XYZ> | undefined;
      if (!olLayer) return;
      fetchLatestRadarTileUrl()
        .then((url) => {
          radarUrlRef.current = url;
          olLayer.getSource()?.setUrl(url);
        })
        .catch((err) => console.error('Failed to refresh weather-radar tiles', err));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [radarVisible]);

  const flyToRequest = useStore((s) => s.flyToRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToRequest) return;
    const view = map.getView();
    const projection = view.getProjection();
    view.animate({ center: fromLonLat([flyToRequest.lng, flyToRequest.lat], projection), zoom: flyToRequest.zoom, duration: 1200 });
  }, [flyToRequest]);

  const project: ProjectFn = (lng, lat) => {
    const map = mapRef.current;
    if (!map) return { x: -9999, y: -9999 };
    const projection = map.getView().getProjection();
    const p = map.getPixelFromCoordinate(fromLonLat([lng, lat], projection));
    return p ? { x: p[0], y: p[1] } : { x: -9999, y: -9999 };
  };

  return (
    <div className="tactical-map" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#05080a' }}>
      <div ref={containerRef} className="tactical-map-container" style={{ position: 'absolute', inset: 0 }} />

      {size.w > 0 && (
        <div className="tactical-map-overlay-wrap" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <OobMapLayer project={project} width={size.w} height={size.h} />
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

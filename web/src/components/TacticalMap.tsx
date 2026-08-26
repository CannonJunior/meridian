import { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import 'olcs/css/olcs.css';
import OlMap from 'ol/Map';
import View from 'ol/View';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import ImageLayer from 'ol/layer/Image';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import GeoJSONFormat from 'ol/format/GeoJSON';
import { Style, Fill, Stroke, Circle as CircleStyle, RegularShape } from 'ol/style';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import type { FeatureLike } from 'ol/Feature';
import type Polygon from 'ol/geom/Polygon';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { defaults as defaultControls } from 'ol/control/defaults';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Attribution from 'ol/control/Attribution';
import { useStore } from '../store';
import type { DrawLayerId } from '../store';
import { computeStaticMapExtentWebMercator, fetchGoogleStaticMapDataUrl, GOOGLE_STATIC_MAP_SIZE } from '../googleStaticMap';
import { affColor, altBand, geodesicCircleLngLat, geodesicSectorLngLat, geodesicEllipseLngLat } from '../selectors';
import { statusMeta } from '../oobSelectors';
import type { ObjectStatus } from '../assets/oob';
import { hexToRgba } from '../assets/palette';
import { AO_BOUNDS, AO_CENTER, BASEMAP_STYLES, PROJECTION_OPTIONS, registerProjections } from '../mapProjection';
import type { Sensor, Target } from '../types';
import { buildAirborneEntities, exaggeratedMeters, logAltitudeMeters, ALTITUDE_EXAGGERATION, MODE_25D_LOOK_ANGLE_DEG } from '../cesium3d';
import type { MapMode } from '../cesium3d';
import type OLCesiumType from 'olcs';
import type * as CesiumNS from 'cesium';
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

// A two-graphic "marker" (outline shape + solid center dot) rather than a
// single small dot — reads as a deliberate icon at a glance, and doubles
// the hit-testable area over a single tiny circle. `shape: 'ring'` (a
// hollow circle) is used for point-only layers (ports, tenth-fleet);
// `shape: 'diamond'` for airfields' centerpoint, so the two read as
// visually distinct icon families rather than identical dots — a rotated
// square outline, echoing the same hollow-diamond language TrackSymbol and
// the OOB markers already use elsewhere in the app for "this is a
// platform/contact," just in this layer's own color instead of an
// affiliation color.
function pointMarkerStyle(color: string, shape: 'ring' | 'diamond'): Style[] {
  const outline =
    shape === 'diamond'
      ? new RegularShape({ points: 4, radius: 9, angle: Math.PI / 4, fill: new Fill({ color: '#0c1416' }), stroke: new Stroke({ color, width: 2 }) })
      : new CircleStyle({ radius: 7, fill: new Fill({ color: '#0c1416' }), stroke: new Stroke({ color, width: 2 }) });
  return [new Style({ image: outline }), new Style({ image: new CircleStyle({ radius: 2.5, fill: new Fill({ color }) }) })];
}

// Builds the OL style for a 'polygon' or 'mixed' geometry context layer.
// Airfields (the one 'mixed' layer) carries a `kind` property
// (boundary/runway/taxiway/centerpoint) — style each differently, matching
// the GeoServer-side SLD used for non-OpenLayers WMS consumers
// (geoserver-init/airfields_style.sld). Point (centerpoint) features get
// the diamond marker instead of fill/stroke. Other polygon layers (e.g.
// EEZ) have no `kind` property and use their own flat paint overrides
// instead (see ContextLayer.polygon* fields).
function polygonStyleFor(layer: ContextLayer) {
  return (feature: FeatureLike): Style | Style[] => {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'Point') {
      return pointMarkerStyle(layer.pointColor ?? '#3fd2e6', 'diamond');
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

function syncContextLayers(
  map: OlMap,
  visibility: Record<string, boolean>,
  filters: Record<string, string>,
  layerRefs: Map<string, BaseLayer>,
  appliedFilters: Map<string, string>,
  radarUrlRef: { current: string | null },
) {
  for (const layer of CONTEXT_LAYERS) {
    const shouldShow = !!visibility[layer.id];
    const hasLayer = layerRefs.has(layer.id);
    // Only layers with a filterProperty (assets/contextLayers.ts) have a
    // meaningful filter at all — everything else always resolves to '',
    // which never diverges from its own applied value, so this is a no-op
    // for every other layer.
    const desiredFilter = layer.filterProperty ? (filters[layer.id] ?? '') : '';
    const filterChanged = hasLayer && desiredFilter !== (appliedFilters.get(layer.id) ?? '');

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

    if (shouldShow && (!hasLayer || filterChanged)) {
      if (filterChanged) {
        // The layer's already showing, but under a different filter (or no
        // filter) than what's now wanted — drop it and rebuild from a fresh
        // fetch rather than trying to patch the existing VectorSource, same
        // as any other "layer's on but its data changed" case in this app.
        map.removeLayer(layerRefs.get(layer.id)!);
        layerRefs.delete(layer.id);
      }
      loadContextLayerData(layer, desiredFilter)
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
            appliedFilters.set(layer.id, desiredFilter);
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
            const markerStyle = pointMarkerStyle(layer.pointColor ?? '#3fd2e6', 'ring');
            olLayer = new VectorLayer({ source, style: markerStyle });
          }
          layerRefs.set(layer.id, olLayer);
          appliedFilters.set(layer.id, desiredFilter);
          map.addLayer(olLayer);
        })
        .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
    } else if (!shouldShow && hasLayer) {
      map.removeLayer(layerRefs.get(layer.id)!);
      layerRefs.delete(layer.id);
      appliedFilters.delete(layer.id);
    }
  }
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

function SensorCoverage({ s, project }: { s: Sensor; project: ProjectFn }) {
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
}

function TrackSymbol({ t, selected, project, onSelect, onOpen }: { t: Target; selected: boolean; project: ProjectFn; onSelect: () => void; onOpen: () => void }) {
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
function GeodesicShape({
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

function MapOverlaySvg({ project, width, height }: { project: ProjectFn; width: number; height: number }) {
  const cesiumActive = useStore((s) => s.mapMode !== '2D');
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
  const ownshipLngLat: [number, number] = [-5.942, 35.82];
  const bullseyeLngLat: [number, number] = [-5.6, 36.02];
  const bullseye = project(...bullseyeLngLat);

  return (
    <svg className="map-overlay-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Doctrinal-spacing NM values (no prior real-world radius existed —
          these were flat 120/230/340/460px circles) rather than a reverse-
          engineered match to that arbitrary pixel sizing. */}
      {[10, 20, 30, 40].map((nm) => (
        <GeodesicShape
          key={`ring${nm}`}
          className="map-overlay-ownship-ring"
          points={geodesicCircleLngLat(ownshipLngLat[0], ownshipLngLat[1], nm)}
          project={project}
          stroke="rgba(63,210,230,.10)"
          strokeDasharray="2 7"
        />
      ))}

      {[5, 10, 15].map((nm) => (
        <GeodesicShape
          key={`bulls${nm}`}
          className="map-overlay-bullseye-ring"
          points={geodesicCircleLngLat(bullseyeLngLat[0], bullseyeLngLat[1], nm)}
          project={project}
          stroke="rgba(255,171,56,.18)"
        />
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

function StylePicker() {
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
          <div
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
          </div>
        ))}
      </div>
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
  // The filter text each currently-rendered context layer was actually
  // fetched with — compared against the store's live contextLayerFilters in
  // syncContextLayers to detect "still visible, but the search box changed"
  // and trigger a refetch, which plain visibility-toggle tracking wouldn't.
  const appliedContextLayerFiltersRef = useRef(new Map<string, string>());
  const radarUrlRef = useRef<string | null>(null);
  // ol-cesium 3D/2.5D mode (Plan C / Phase 3) — populated by the mapMode
  // effect below, on first activation only (dynamic import, see cesium3d.ts).
  const ol3dRef = useRef<OLCesiumType | null>(null);
  const cesiumRef = useRef<typeof CesiumNS | null>(null);
  const dataSourceRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const pickHandlerRef = useRef<CesiumNS.ScreenSpaceEventHandler | null>(null);
  const basemapId = useStore((s) => s.basemapId);
  const mapProjectionCode = useStore((s) => s.mapProjectionCode);
  const legendMode = useStore((s) => s.legendMode);
  const mapMode = useStore((s) => s.mapMode);
  const cesiumActive = mapMode !== '2D';
  const is25D = mapMode === '2.5D';
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const drawTool = useStore((s) => s.drawTool);
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const drawnShapes = useStore((s) => s.drawnShapes);
  const shapeEditing = useStore((s) => s.shapeEditing);
  const drawImageLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const capturePreviewLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawPolygonPreviewLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawnShapesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const persistedShapeImageLayersRef = useRef<ImageLayer<ImageStatic>[]>([]);
  const shapeEditLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const shapeEditInteractionRef = useRef<Modify | null>(null);
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

    // One map-level singleclick/pointermove pair covers every identifiable
    // context layer — OpenLayers doesn't have MapLibre's per-layer-id event
    // binding, so identify which ContextLayer (if any) owns the hit OL
    // layer via layerRefs. 'mixed' layers (airfields) only treat their
    // Point (centerpoint) features as identifiable, same as before —
    // boundary/runway/taxiway polygons stay non-interactive. Deliberately
    // 'singleclick' (OL's debounced single-click event, which only fires
    // once it's sure a second click isn't coming) rather than raw 'click':
    // a port/airfield/OOB icon opens its card on one click, not two — this
    // is a different interaction model from live tactical entities
    // (TrackSymbol etc.), which use click-to-select / dblclick-to-open on
    // their own SVG overlay, a separate system from this one.
    const identifiableLayers = CONTEXT_LAYERS.filter((l) => l.identifiable);
    const layerFilter = (l: BaseLayer) => identifiableLayers.some((cl) => layerRefs.current.get(cl.id) === l);

    map.on('singleclick', (evt) => {
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
      pickHandlerRef.current?.destroy();
      pickHandlerRef.current = null;
      ol3dRef.current?.destroy();
      ol3dRef.current = null;
      cesiumRef.current = null;
      dataSourceRef.current = null;
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

  // ol-cesium is large and most sessions never touch 3D mode, so it's
  // dynamically imported here on first activation rather than at module
  // load (see cesium3d.ts's header comment). Toggling back off just hides
  // the already-built Cesium scene via setEnabled(false) — no teardown
  // until the whole map unmounts (see the mount effect's cleanup above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapMode === '2D') {
      ol3dRef.current?.setEnabled(false);
      bumpRender((v) => v + 1);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!ol3dRef.current) {
        const [{ default: OLCesium }, Cesium] = await Promise.all([import('olcs'), import('cesium')]);
        if (cancelled || !mapRef.current) return;
        // olcs's own compiled source references a bare global `Cesium`
        // identifier throughout (no import of its own — see OLCesium.js)
        // rather than importing the package itself. That's fine in a
        // production build, where vite-plugin-cesium injects a classic
        // global Cesium.js <script> tag and rewrites `import 'cesium'` to
        // reference it via rollup-plugin-external-globals — but neither
        // rewrite runs under Vite's dev-server transform, so without this,
        // olcs throws "Cesium is not defined" in dev. Polyfilling the
        // global from the real ESM import we already have works in both.
        (window as unknown as { Cesium?: typeof Cesium }).Cesium = Cesium;
        const ol3d = new OLCesium({ map: mapRef.current });
        const scene = ol3d.getCesiumScene();
        const dataSource = new Cesium.CustomDataSource('meridian-airborne');
        await ol3d.getDataSources().add(dataSource);
        ol3dRef.current = ol3d;
        cesiumRef.current = Cesium;
        dataSourceRef.current = dataSource;
        // Cesium's default render loop runs continuously (every animation
        // frame, ~60/s) even when the camera is idle, and postRender fires
        // once per rendered frame. Forcing a full React re-render on every
        // single one of those pegged the tab's CPU and ballooned memory —
        // throttle to a rate that still tracks the camera smoothly for the
        // SVG overlay's project() calls without re-rendering 60x/s.
        let lastBump = 0;
        scene.postRender.addEventListener(() => {
          const now = performance.now();
          if (now - lastBump < 50) return;
          lastBump = now;
          bumpRender((v) => v + 1);
        });

        // 2.5D's "standardized view" guarantee (fixed look angle, locked
        // heading) can't be enforced solely via the screenSpaceCameraController
        // flags below: Cesium's update3D gates BOTH free orbit-rotate AND
        // ground-plane panning behind the single enableRotate flag (pan3D,
        // the drag-to-pan handler, is only reached through the
        // enableRotate-gated spin3D dispatcher) — there's no separate
        // "translate only" flag in 3D scene mode. Disabling enableRotate to
        // stop heading drift silently disabled panning too. So enableRotate
        // stays on in both modes, and this listener re-locks heading/pitch
        // every frame instead — a no-op during ordinary panning (which only
        // ever changes position, not orientation) and only a visible
        // correction in the rare edge case (dragging past the horizon) that
        // would otherwise let Cesium's look3D/rotate3D fallback drift it.
        scene.postRender.addEventListener(() => {
          if (useStore.getState().mapMode !== '2.5D') return;
          scene.camera.setView({
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(MODE_25D_LOOK_ANGLE_DEG - 90), roll: 0 },
          });
        });

        // Picking parity with the 2D SVG overlay (TrackSymbol/sensor-marker
        // onClick) — a real answer to Risk 03/the "picking moves to a
        // different system" problem Plan C's Section 06 named, scoped here
        // to the airborne entities that only exist in the Cesium scene.
        const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        handler.setInputAction((evt: { position: CesiumNS.Cartesian2 }) => {
          const picked = scene.pick(evt.position);
          const kind = picked?.id?.properties?.meridianKind?.getValue?.();
          const id = picked?.id?.properties?.meridianId?.getValue?.();
          if (!kind || !id) return;
          if (kind === 'target') useStore.getState().selectTarget(id);
          else useStore.getState().openEntity('sensor', id);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        pickHandlerRef.current = handler;
      }
      if (cancelled) return;
      ol3dRef.current!.setEnabled(true);
      // 2.5D is the standardized view: fixed look angle, locked heading,
      // pan/zoom only — no tilt/rotate drag to wander into an unrecognizable
      // picture. Plain 3D restores the free camera. setTilt/setHeading go
      // through olcs's own Camera (not raw Cesium calls) so the OL view's
      // rotation/resolution stay in sync the same way resetNorth's does.
      const scene = ol3dRef.current.getCesiumScene();
      const camera = ol3dRef.current.getCamera();
      const sscc = scene.screenSpaceCameraController;
      if (mapMode === '2.5D') {
        // enableRotate is deliberately left on — see the postRender listener
        // above for why disabling it isn't the right way to lock heading.
        sscc.enableTilt = false;
        camera.setHeading(0);
        camera.setTilt(cesiumRef.current!.Math.toRadians(MODE_25D_LOOK_ANGLE_DEG));
      } else {
        sscc.enableTilt = true;
      }
      bumpRender((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [mapMode]);

  // Keeps the Cesium scene's airborne markers in sync with the same store
  // data TrackSymbol/sensor markers read — pure add-on, no fetch/WS of its
  // own. No-ops until the async init effect above has actually created the
  // data source (harmless: mapMode leaving '2D' and Cesium finishing loading
  // are rarely the same tick, and this effect re-runs on the next store
  // update regardless).
  //
  // The server pushes a fresh `targets` array roughly once a second (see
  // server/src/index.ts's 1000ms sim tick), so this effect re-fires that
  // often even when nothing airborne actually moved. It used to
  // removeAll() the data source and rebuild every stem/point/label from
  // scratch on every one of those ticks — a full destroy-and-recreate of
  // every marker once a second, which is what read as "blinking" (this is
  // separate from, and in addition to, the depthFailMaterial fix below for
  // the ground-endpoint z-fighting flicker). Updating existing entities'
  // properties in place — and only adding/removing entities whose presence
  // actually changed — keeps the same primitives alive across ticks instead
  // of tearing them down every time.
  useEffect(() => {
    if (mapMode === '2D') return;
    const Cesium = cesiumRef.current;
    const dataSource = dataSourceRef.current;
    if (!Cesium || !dataSource) return;
    const heightForAlt = is25D ? logAltitudeMeters : exaggeratedMeters;
    const entities = dataSource.entities;
    const wanted = new Set<string>();
    for (const a of buildAirborneEntities(targets, sensors, mapMode)) {
      const groundPos = Cesium.Cartesian3.fromDegrees(a.lng, a.lat, 0);
      const airPos = Cesium.Cartesian3.fromDegrees(a.lng, a.lat, heightForAlt(a.altFt));
      // depthFailMaterial mirrors material so the stem still draws (rather
      // than flickering in/out) on frames where it grazes the globe/terrain
      // depth buffer near its ground-level endpoint — PolylineGraphics has
      // no disableDepthTestDistance escape hatch like the point/label below.
      const stemColor = Cesium.Color.fromCssColorString(a.color).withAlpha(0.5);
      const stemId = `${a.kind}:${a.id}:stem`;
      wanted.add(stemId);
      const stem = entities.getById(stemId);
      if (!stem) {
        entities.add({ id: stemId, polyline: { positions: [groundPos, airPos], width: 1, material: stemColor, depthFailMaterial: stemColor } });
      } else if (stem.polyline) {
        stem.polyline.positions = new Cesium.ConstantProperty([groundPos, airPos]);
        stem.polyline.material = new Cesium.ColorMaterialProperty(stemColor);
        stem.polyline.depthFailMaterial = new Cesium.ColorMaterialProperty(stemColor);
      }

      const markColor = Cesium.Color.fromCssColorString(a.color);
      const labelText = `${a.label}\n${Math.round(a.altFt).toLocaleString()} FT`;
      const markId = `${a.kind}:${a.id}`;
      wanted.add(markId);
      const mark = entities.getById(markId);
      if (!mark) {
        entities.add({
          id: markId,
          position: airPos,
          point: { pixelSize: 9, color: markColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text: labelText,
            font: '10px "IBM Plex Mono"',
            fillColor: markColor,
            pixelOffset: new Cesium.Cartesian2(0, -24),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#070b0c').withAlpha(0.78),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { meridianKind: a.kind, meridianId: a.id },
        });
      } else {
        mark.position = new Cesium.ConstantPositionProperty(airPos);
        if (mark.point) mark.point.color = new Cesium.ConstantProperty(markColor);
        if (mark.label) {
          mark.label.text = new Cesium.ConstantProperty(labelText);
          mark.label.fillColor = new Cesium.ConstantProperty(markColor);
        }
      }
    }
    for (const e of entities.values.slice()) {
      if (!wanted.has(e.id)) entities.removeById(e.id);
    }
  }, [mapMode, is25D, targets, sensors]);

  const contextLayerVisibility = useStore((s) => s.contextLayerVisibility);
  const contextLayerFilters = useStore((s) => s.contextLayerFilters);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncContextLayers(map, contextLayerVisibility, contextLayerFilters, layerRefs.current, appliedContextLayerFiltersRef.current, radarUrlRef);
  }, [contextLayerVisibility, contextLayerFilters]);

  // Drawing tool, step 1a: while choosing where to capture, keep the
  // preview rectangle continuously locked to the map's live view — recomputed
  // (same math, computeStaticMapExtentWebMercator, the actual capture uses)
  // on every 'moveend', i.e. whenever the user pans OR zooms, with no
  // separate "confirm the area" click. The map's own zoom (rounded — Google
  // Static Maps' zoom parameter is integer-only) becomes drawTool.captureZoom
  // directly; there's no independent zoom control to keep in sync with it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drawTool.phase !== 'capture') return;
    const view = map.getView();
    const updatePreview = () => {
      const center = view.getCenter();
      if (!center) return;
      const [lng, lat] = toLonLat(center, view.getProjection());
      const zoom = Math.round(view.getZoom() ?? useStore.getState().drawTool.captureZoom);
      const extent = computeStaticMapExtentWebMercator(lng, lat, zoom, GOOGLE_STATIC_MAP_SIZE);
      useStore.getState().setCaptureZoom(zoom);
      useStore.getState().setCapturePreview([lng, lat], extent);
    };
    updatePreview();
    map.on('moveend', updatePreview);
    return () => {
      map.un('moveend', updatePreview);
    };
  }, [drawTool.phase]);

  // Drawing tool, step 1b: draws the dashed preview rectangle itself —
  // "the outline of the area on the map where a Google image will be
  // added." Only shown while still choosing where to capture; cleared once
  // the phase moves on or the preview is stale (extent cleared by a reset).
  const captureExtent = drawTool.captureExtent;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (capturePreviewLayerRef.current) {
      map.removeLayer(capturePreviewLayerRef.current);
      capturePreviewLayerRef.current = null;
    }
    if (drawTool.phase !== 'capture' || !captureExtent) return;
    const [minX, minY, maxX, maxY] = captureExtent;
    // captureExtent is EPSG:3857 meters (same as the actual capture's
    // image extent) — converted to lng/lat corners here so it can go
    // through geoJSONFormat like every other feature in this file, rather
    // than importing raw ol Feature/Polygon constructors just for this.
    const corners: [number, number][] = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    const ring = [...corners.map((c) => toLonLat(c)), toLonLat(corners[0])];
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({
      source,
      style: new Style({ stroke: new Stroke({ color: '#3fd2e6', width: 2, lineDash: [6, 6] }) }),
    });
    capturePreviewLayerRef.current = layer;
    map.addLayer(layer);
  }, [captureExtent, drawTool.phase]);

  // Drawing tool, step 2: fetch a Google Static Maps image for the last-
  // previewed center (see googleStaticMap.ts) whenever DrawingToolManager
  // bumps captureRequestId. Deliberately uses drawTool.captureCenter (set
  // by the preview step above), not the map's live view center, so what's
  // actually captured always matches the rectangle the user just confirmed
  // — even if they've since nudged the map without re-previewing.
  const captureRequestId = drawTool.captureRequestId;
  useEffect(() => {
    const { captureCenter, captureZoom, captureScale } = useStore.getState().drawTool;
    if (captureRequestId === 0 || !captureCenter) return;
    const [lng, lat] = captureCenter;
    let cancelled = false;
    fetchGoogleStaticMapDataUrl(lng, lat, captureZoom, captureScale)
      .then((dataUrl) => {
        if (cancelled) return;
        const extent = computeStaticMapExtentWebMercator(lng, lat, captureZoom, GOOGLE_STATIC_MAP_SIZE);
        useStore.getState().setCapturedGoogleImage(dataUrl, extent);
      })
      .catch((err) => {
        if (!cancelled) useStore.getState().setCaptureError(err instanceof Error ? err.message : 'Failed to capture Google imagery.');
      });
    return () => {
      cancelled = true;
    };
  }, [captureRequestId]);

  // Places the captured Google image on the map at its exact, already-
  // computed EPSG:3857 extent — no warping step (unlike the earlier
  // uploaded-screenshot version, removed): a Static Maps image's bounds are
  // fully determined by the parameters it was requested with, so this is
  // just a plain axis-aligned ol/source/ImageStatic. OL reprojects it on
  // the fly if the view's current projection isn't EPSG:3857 (see
  // FEATURE_STORAGE_PROJECTION's header comment — same mechanism).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawImageLayerRef.current) {
      map.removeLayer(drawImageLayerRef.current);
      drawImageLayerRef.current = null;
    }
    if (!drawTool.imageDataUrl || !drawTool.imageExtent) return;
    const imageSource = new ImageStatic({ url: drawTool.imageDataUrl, imageExtent: drawTool.imageExtent, projection: 'EPSG:3857' });
    // olcs's ImageStatic -> Cesium.SingleTileImageryProvider conversion
    // (core.js's sourceToImageryProvider) doesn't pass tileWidth/tileHeight,
    // which current Cesium's synchronous SingleTileImageryProvider
    // constructor requires — throws a DeveloperError the moment this layer
    // is added while in 2.5D/3D mode. olcs_skip opts the source out of that
    // conversion; the image still renders fine in plain 2D.
    imageSource.set('olcs_skip', true);
    const layer = new ImageLayer({ source: imageSource, opacity: 0.9 });
    drawImageLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawTool.imageDataUrl, drawTool.imageExtent]);

  // Drawing tool, step 3: while tracing, attach a plain OL polygon-draw
  // interaction over a scratch source (live in-progress feedback only) —
  // torn down as soon as the phase moves on (drawend calls setDrawnPolygon,
  // which advances the store's phase to 'associate', see store.ts). The
  // finished polygon itself is rendered by a separate effect below, driven
  // by drawTool.polygonLngLat rather than this scratch layer, so it keeps
  // showing through the associate/save step too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drawTool.phase !== 'polygon') return;
    const source = new VectorSource();
    const scratchLayer = new VectorLayer({
      source,
      style: new Style({ fill: new Fill({ color: 'rgba(63,210,230,.12)' }), stroke: new Stroke({ color: '#3fd2e6', width: 2 }) }),
    });
    map.addLayer(scratchLayer);
    const draw = new Draw({ source, type: 'Polygon' });
    draw.on('drawend', (evt) => {
      const geom = evt.feature.getGeometry() as Polygon;
      const projection = map.getView().getProjection();
      const ring = geom
        .getCoordinates()[0]
        .slice(0, -1)
        .map((c) => toLonLat(c, projection) as [number, number]);
      useStore.getState().setDrawnPolygon(ring);
    });
    map.addInteraction(draw);
    return () => {
      map.removeInteraction(draw);
      map.removeLayer(scratchLayer);
    };
  }, [drawTool.phase]);

  // Drawing tool, step 4: the finished, saved-or-about-to-be-saved polygon,
  // rendered from drawTool.polygonLngLat itself (not the scratch Draw
  // source above) so it stays visible through the associate/save step and
  // clears only when resetDrawTool() runs (polygonLngLat back to null).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawPolygonPreviewLayerRef.current) {
      map.removeLayer(drawPolygonPreviewLayerRef.current);
      drawPolygonPreviewLayerRef.current = null;
    }
    if (!drawTool.polygonLngLat || drawTool.polygonLngLat.length < 3) return;
    // Built straight from lng/lat (EPSG:4326) through the same fixed-
    // storage-projection GeoJSON format every other layer in this file
    // uses (see FEATURE_STORAGE_PROJECTION's header comment) — OpenLayers
    // reprojects it on the fly to whatever the view's current projection
    // is, no manual fromLonLat/toLonLat needed here.
    const ring = [...drawTool.polygonLngLat, drawTool.polygonLngLat[0]];
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({ source, style: new Style({ fill: new Fill({ color: 'rgba(95,227,154,.12)' }), stroke: new Stroke({ color: '#5fe39a', width: 2 }) }) });
    drawPolygonPreviewLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawTool.polygonLngLat]);

  // Renders any already-persisted drawn shapes (see store.ts's
  // loadDrawnShapes/drawnShapes and server/src/drawnShapes.ts) belonging to
  // whichever port/airfield/OOB object card is currently open — this is
  // what makes a shape saved in an earlier session show up again, without
  // needing a permanently-on context layer the way the old port-extents/
  // reporting-points layers worked.
  const drawnShapesKey =
    cardId != null && (cardKind === 'port' || cardKind === 'airfield' || cardKind === 'oobObject')
      ? (`${cardKind === 'port' ? 'maritime-ports' : cardKind === 'airfield' ? 'airfields' : 'oob'}:${cardId}` as const)
      : null;
  useEffect(() => {
    if (!drawnShapesKey) return;
    const [layerId, objectId] = drawnShapesKey.split(':') as [DrawLayerId, string];
    useStore.getState().loadDrawnShapes(layerId, objectId);
  }, [drawnShapesKey]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of persistedShapeImageLayersRef.current) map.removeLayer(layer);
    persistedShapeImageLayersRef.current = [];
    if (drawnShapesLayerRef.current) {
      map.removeLayer(drawnShapesLayerRef.current);
      drawnShapesLayerRef.current = null;
    }
    const fc = drawnShapesKey ? drawnShapes[drawnShapesKey] : undefined;
    if (!fc || fc.features.length === 0) return;

    // Each shape's own captured reference image (if it has one — older
    // shapes predate this and won't), added first so the polygon outline
    // below draws on top of it rather than under it.
    for (const f of fc.features) {
      const props = f.properties as { referenceImageUrl?: string | null; referenceImageExtent?: [number, number, number, number] | null } | null;
      if (!props?.referenceImageUrl || !props.referenceImageExtent) continue;
      const imageSource = new ImageStatic({ url: props.referenceImageUrl, imageExtent: props.referenceImageExtent, projection: 'EPSG:3857' });
      // See the drawing-tool capture effect above for why olcs_skip is set here.
      imageSource.set('olcs_skip', true);
      const imageLayer = new ImageLayer({ source: imageSource, opacity: 0.9 });
      persistedShapeImageLayersRef.current.push(imageLayer);
      map.addLayer(imageLayer);
    }

    // The shape currently open in the Edit flow (if any) gets its own
    // editable layer + Modify interaction below — omitted here so it isn't
    // rendered twice.
    const editableFc: FeatureCollection = { ...fc, features: fc.features.filter((f) => f.id !== shapeEditing?.shapeId) };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(editableFc) });
    const layer = new VectorLayer({
      source,
      style: (feature) => {
        const kind = (feature.get('kind') as string | undefined) ?? 'outline';
        const color = kind === 'reporting-point' ? '#ffab38' : '#3fd2e6';
        return new Style({ fill: new Fill({ color: hexToRgba(color, 0.08) }), stroke: new Stroke({ color, width: 1.2 }) });
      },
    });
    drawnShapesLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawnShapesKey, drawnShapes, shapeEditing?.shapeId]);

  // Drawing tool, Edit flow: while a saved shape is being edited (see
  // DrawingToolManager.tsx's Saved Shapes list / store.ts's shapeEditing),
  // render it as a single editable feature with an OL Modify interaction
  // attached — dragging an existing vertex moves it, dragging the ghost
  // vertex at an edge's midpoint inserts a new one, both built into Modify
  // with no custom hit-testing needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shapeEditing) return;
    const ring = shapeEditing.ring;
    if (!ring) return;
    const closedRing = [...ring, ring[0]];
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: shapeEditing.shapeId, properties: {}, geometry: { type: 'Polygon', coordinates: [closedRing] } }],
    };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({
      source,
      style: new Style({ fill: new Fill({ color: hexToRgba('#5fe39a', 0.1) }), stroke: new Stroke({ color: '#5fe39a', width: 2 }) }),
    });
    map.addLayer(layer);
    shapeEditLayerRef.current = layer;
    const modify = new Modify({ source });
    modify.on('modifyend', (evt) => {
      const feature = evt.features.getArray()[0];
      const geom = feature.getGeometry() as Polygon;
      const projection = map.getView().getProjection();
      const editedRing = geom
        .getCoordinates()[0]
        .slice(0, -1)
        .map((c) => toLonLat(c, projection) as [number, number]);
      useStore.getState().setEditingShapeRing(editedRing);
    });
    map.addInteraction(modify);
    shapeEditInteractionRef.current = modify;
    return () => {
      map.removeInteraction(modify);
      map.removeLayer(layer);
      shapeEditLayerRef.current = null;
      shapeEditInteractionRef.current = null;
    };
    // Only re-run when switching which shape is being edited, not on every
    // in-flight ring update — this effect owns the interaction's lifecycle,
    // modifyend already keeps the store in sync without a rebuild each drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeEditing?.shapeId]);

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

  const resetNorthRequest = useStore((s) => s.resetNorthRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !resetNorthRequest) return;
    // ol-cesium's Camera keeps the OL View's rotation synced to the Cesium
    // camera heading while 3D is enabled, so going through it (rather than
    // just view.setRotation) is what makes this stick once the user is back
    // in 2D after having rotated the 3D globe.
    const camera = ol3dRef.current?.getCamera();
    if (camera) camera.setHeading(0);
    else map.getView().setRotation(0);
  }, [resetNorthRequest]);

  // The continuity insight from the altitude plan's Section 06: this is the
  // same coordinate-to-pixel swap the MapLibre->OpenLayers migration already
  // proved out once (map.project() -> map.getPixelFromCoordinate()) — now
  // extended a second time so the existing SVG overlay (ground/surface
  // targets, sensor coverage, NAIs, ownship/bullseye) keeps tracking
  // correctly under the Cesium camera while 3D mode is active, with zero
  // changes to the symbology itself.
  const project: ProjectFn = (lng, lat) => {
    if (cesiumActive && ol3dRef.current?.getEnabled() && cesiumRef.current) {
      const scene = ol3dRef.current.getCesiumScene();
      const c = scene.cartesianToCanvasCoordinates(cesiumRef.current.Cartesian3.fromDegrees(lng, lat, 0));
      return c ? { x: c.x, y: c.y } : { x: -9999, y: -9999 };
    }
    const map = mapRef.current;
    if (!map) return { x: -9999, y: -9999 };
    const projection = map.getView().getProjection();
    const p = map.getPixelFromCoordinate(fromLonLat([lng, lat], projection));
    return p ? { x: p[0], y: p[1] } : { x: -9999, y: -9999 };
  };

  // Sensor-imaging convention (this app's EO/IR/SAR context): look angle
  // measured from nadir, 0° = camera pointed straight down, 90° = level
  // with the horizon — the same convention olcs's own Camera uses for tilt
  // (see getTilt()'s doc comment), so read it straight from there rather
  // than re-deriving it from raw Cesium pitch.
  const lookAngleDeg =
    cesiumActive && ol3dRef.current?.getEnabled() && cesiumRef.current
      ? (ol3dRef.current.getCamera().getTilt() * 180) / Math.PI
      : null;

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

      <div className="tactical-map-right-hud" style={{ position: 'absolute', right: 14, top: 53, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          className="tactical-map-zoom-indicator"
          style={{
            textAlign: 'center',
            padding: '4px 10px',
            fontFamily: 'var(--font-display)',
            fontSize: 9.5,
            letterSpacing: '.1em',
            fontWeight: 600,
            color: 'var(--ink-mute)',
            border: '1px solid var(--hairline-mid)',
            background: 'rgba(8,13,14,.82)',
          }}
        >
          ZOOM {mapRef.current?.getView().getZoom()?.toFixed(1) ?? '—'}
        </div>

        {lookAngleDeg != null && (
          <div
            className="tactical-map-look-angle-indicator"
            title="Look angle from nadir — 0° is straight down, 90° is level with the horizon"
            style={{
              textAlign: 'center',
              padding: '4px 10px',
              fontFamily: 'var(--font-display)',
              fontSize: 9.5,
              letterSpacing: '.1em',
              fontWeight: 600,
              color: 'var(--ink-mute)',
              border: '1px solid var(--hairline-mid)',
              background: 'rgba(8,13,14,.82)',
            }}
          >
            LOOK {Math.round(lookAngleDeg)}°
          </div>
        )}

        <StylePicker />
      </div>
    </div>
  );
}

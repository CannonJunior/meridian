// Pure geometry/data helpers used by TacticalMap.tsx and its sibling
// modules in this directory — no React, no OpenLayers object construction
// (see contextLayerStyles.ts for that). Split out of TacticalMap.tsx
// itself (see this repo's maintainability audit) because none of this
// depends on the map's lifecycle or any live entity state.
import type { ContextLayer } from '../../assets/contextLayers';
import type { Feature, FeatureCollection, Point } from 'geojson';

// Every geographic overlay element (track symbols, sensor markers, range
// rings, ...) is placed via this one projection function — 2D/2.5D/3D each
// implement it differently (see TacticalMap.tsx's own `project`
// useCallback), but every overlay component only ever needs this shape.
export type ProjectFn = (lng: number, lat: number) => { x: number; y: number };

// CARTO's retina-tile convention: `{r}` becomes `@2x` on a high-DPI screen,
// empty otherwise. OpenLayers' XYZ source has no equivalent placeholder, so
// it's resolved once here instead of left in the template.
export function resolveTileUrls(templates: string[]): string[] {
  const r = window.devicePixelRatio >= 2 ? '@2x' : '';
  return templates.map((t) => t.replace('{r}', r));
}

export function densifySegment(a: [number, number], b: [number, number], stepDeg: number): [number, number][] {
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
export function buildHeatmapPoints(layer: ContextLayer, geojson: FeatureCollection): FeatureCollection {
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

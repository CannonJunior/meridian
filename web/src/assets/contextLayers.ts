// Context layers: reference/background geodata that is mostly fixed and
// externally served (as opposed to the live simulation entities in
// store.ts, or the OOB order-of-battle in assets/oob.ts). Hosted in a
// GeoServer instance (workspace "meridian", PostGIS-backed) and consumed
// here as WFS GeoJSON — fetched once client-side and rendered as a native
// MapLibre vector layer, which gives real feature hit-testing (click,
// hover) instead of raster-tile pixels.
//
// Local dev stack: `npm run geo:up` (see geoserver/docker-compose.yml) —
// brings up PostGIS + GeoServer and provisions the workspace/datastore/
// layer/style via the GeoServer REST API. CORS must be enabled on GeoServer
// (kartoza image: CORS_ENABLED=true) or the browser will block the
// cross-origin GetFeature fetch.

export type ContextLayerSourceType = 'wfs';
// 'mixed' = polygons plus a separate representative point per feature group
// (e.g. airfields: boundary/runway/taxiway polygons + one center point per
// airfield) — the point sub-layer is the identifiable one.
export type ContextLayerGeometryType = 'point' | 'polygon' | 'mixed';

export interface ContextLayer {
  id: string;
  name: string;
  description: string;
  sourceType: ContextLayerSourceType;
  geometryType: ContextLayerGeometryType;
  wfsBaseUrl: string; // GeoServer WFS endpoint
  layerName: string; // workspace:layer (used as WFS typeNames)
  attribution: string;
  defaultVisible: boolean;
  // Whether double-clicking a rendered feature should open an object card.
  identifiable: boolean;
}

export const GEOSERVER_URL = 'http://localhost:8600/geoserver';

export const CONTEXT_LAYERS: ContextLayer[] = [
  {
    id: 'maritime-ports',
    name: 'Maritime Ports',
    description: 'Worldwide maritime ports — NGA Publication 150, World Port Index (2019 ed.), 5,410 locations.',
    sourceType: 'wfs',
    geometryType: 'point',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:ports',
    attribution: 'NGA World Port Index',
    defaultVisible: false,
    identifiable: true,
  },
  {
    id: 'airfields',
    name: 'Airfields',
    description: 'Airport boundaries, runways & taxiways — Strait of Gibraltar region, 29 airfields. Runway/taxiway centerlines buffered to footprint polygons by tagged width; click the airfield marker for details.',
    sourceType: 'wfs',
    geometryType: 'mixed',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:airfields',
    attribution: 'OpenStreetMap contributors',
    defaultVisible: false,
    identifiable: true,
  },
];

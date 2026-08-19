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

import type { FeatureCollection } from 'geojson';
import { TENTH_FLEET_LOCATIONS } from './tenthFleetLocations';

// 'wfs' = fetched from GeoServer at render time (see contextLayerData.ts).
// 'static' = bundled directly in this file's `staticData` field — for
// small, fixed datasets (a handful of points) that don't warrant a whole
// GeoServer/PostGIS round-trip.
// 'live-raster' = an externally-hosted raster tile feed that changes over
// time (e.g. weather radar) — not GeoServer/PostGIS-backed at all, and
// re-fetched periodically rather than once (see rainviewer.ts).
export type ContextLayerSourceType = 'wfs' | 'static' | 'live-raster';
// 'mixed' = polygons plus a separate representative point per feature group
// (e.g. airfields: boundary/runway/taxiway polygons + one center point per
// airfield) — the point sub-layer is the identifiable one.
// 'raster' = tiled imagery (live-raster sourceType only), not a vector
// feature layer — no per-feature hit-testing.
export type ContextLayerGeometryType = 'point' | 'polygon' | 'mixed' | 'line' | 'raster';

export interface ContextLayer {
  id: string;
  name: string;
  description: string;
  sourceType: ContextLayerSourceType;
  geometryType: ContextLayerGeometryType;
  wfsBaseUrl?: string; // GeoServer WFS endpoint — 'wfs' sourceType only
  layerName?: string; // workspace:layer (used as WFS typeNames) — 'wfs' sourceType only
  staticData?: FeatureCollection; // 'static' sourceType only
  attribution: string;
  defaultVisible: boolean;
  // Whether double-clicking a rendered feature should open an object card.
  identifiable: boolean;
  // Point/mixed-layer circle color override; falls back to the shared
  // default (cyan, matching the ports layer) when unset.
  pointColor?: string;
  // Flat paint overrides for polygon/mixed layers without a per-feature
  // `kind` property to key off of (airfields is the one layer that does,
  // and keeps its dedicated match-expression styling in TacticalMap.tsx).
  // Undefined falls back to the shared default fill/line paint.
  polygonFillColor?: string;
  polygonFillOpacity?: number;
  polygonLineColor?: string;
  polygonLineWidth?: number;
  polygonLineDasharray?: number[];
  // Paint for 'line' geometry layers. If lineColorProperty is set, color/
  // width/opacity are chosen per feature via a MapLibre `match` expression
  // keyed on that property (e.g. shipping lanes' Major/Middle/Minor
  // `lane_type`), using the *Map lookups with the flat line* fields as the
  // fallback for unmatched values. Without lineColorProperty, the flat
  // fields apply to every feature.
  lineColorProperty?: string;
  lineColorMap?: Record<string, string>;
  lineWidthMap?: Record<string, number>;
  lineOpacityMap?: Record<string, number>;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  // 'raster' geometryType only — layer paint opacity for the tile layer.
  rasterOpacity?: number;
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
  {
    id: 'eez',
    name: 'Exclusive Economic Zones',
    description: 'Worldwide Exclusive Economic Zone boundaries — 283 national/territorial zones, geometry-simplified for the browser.',
    sourceType: 'wfs',
    geometryType: 'polygon',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:eez',
    attribution: 'Flanders Marine Institute (VLIZ), Marine Regions World EEZ v12',
    defaultVisible: false,
    identifiable: false,
    polygonFillColor: '#5fc9ff',
    polygonFillOpacity: 0.05,
    polygonLineColor: '#5fc9ff',
    polygonLineWidth: 1.1,
    polygonLineDasharray: [6, 4],
  },
  {
    id: 'shipping-lanes',
    name: 'Shipping Lanes',
    description: 'Worldwide vessel shipping lanes — Major/Middle/Minor routes by traffic importance (hand-traced from nautical charts, real curved paths), plus 12 named strait/canal chokepoints (Gibraltar, Suez, Panama, Malacca...) highlighted separately.',
    sourceType: 'wfs',
    geometryType: 'line',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:shipping_lanes',
    attribution: 'Paul Benden, Global Shipping Lanes (CC BY-SA 4.0); chokepoints from Eurostat SeaRoute marnet network (EUPL-1.2)',
    defaultVisible: false,
    identifiable: false,
    lineColorProperty: 'lane_type',
    lineColorMap: { major: '#c77dff', middle: '#9d4edd', minor: '#7b2cbf', chokepoint: '#ffd60a' },
    lineWidthMap: { major: 1.4, middle: 0.9, minor: 0.5, chokepoint: 2.2 },
    lineOpacityMap: { major: 0.75, middle: 0.6, minor: 0.4, chokepoint: 0.9 },
  },
  {
    id: 'tenth-fleet',
    name: 'Tenth Fleet (Cyber) Locations',
    description: "Fleet Cyber Command HQ and its Navy Information Operations Command detachments — Tenth Fleet has no ships; double-click a marker to open that command's object card.",
    sourceType: 'static',
    geometryType: 'point',
    staticData: TENTH_FLEET_LOCATIONS,
    attribution: 'Wikipedia — United States Tenth Fleet',
    defaultVisible: false,
    identifiable: true,
    pointColor: '#5b9dff',
  },
  {
    id: 'weather-radar',
    name: 'Weather Radar (Live)',
    description: 'Live precipitation radar mosaic — RainViewer, aggregating 1000+ national radar networks worldwide (incl. Spain’s AEMET, covering this AO). Refreshes roughly every 10 minutes; NOAA sources were considered but have no coverage over Gibraltar/the Mediterranean.',
    sourceType: 'live-raster',
    geometryType: 'raster',
    attribution: 'RainViewer.com',
    defaultVisible: false,
    identifiable: false,
    rasterOpacity: 0.55,
  },
];

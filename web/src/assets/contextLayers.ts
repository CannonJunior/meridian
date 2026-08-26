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
//
// Some layers below (airfields, bathymetry-contours) are still bbox-scoped
// to the Strait of Gibraltar, this project's current AO (see
// mapProjection.ts) — that's the state of the data today, not a ceiling on
// scope. Meridian's intended scope is worldwide; expect these to keep
// getting replaced by genuinely worldwide sources over time, the way
// weather-radar and submarine-cables already have been.

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
// 'heatmap' = a WFS line/point layer's own vertices, densified and weighted
// client-side, rendered as a MapLibre heatmap layer — a way to get a
// density-style visualization out of real vector data without needing an
// actual point-cloud/raster density source (see shipping-traffic-intensity,
// built this way after no free/no-login/worldwide AIS density feed could
// be found).
export type ContextLayerGeometryType = 'point' | 'polygon' | 'mixed' | 'line' | 'raster' | 'heatmap';

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
  // 'raster' geometryType, static tile URL only (e.g. a WMS GetMap template
  // using MapLibre's {bbox-epsg-3857} substitution) — set for a layer whose
  // tile URL never changes, as opposed to weather-radar's, which is
  // resolved dynamically each time the layer is turned on (see
  // rainviewer.ts) because RainViewer's frame path changes every ~10min.
  rasterTileUrl?: string;
  // 'raster' geometryType only — caps the zoom MapLibre will request tiles
  // at, upsampling beyond that instead (weather-radar needs this because
  // RainViewer's tile server 404s past z7; unset means no cap).
  rasterMaxZoom?: number;
  // 'heatmap' geometryType only — the property (e.g. shipping_lanes'
  // lane_type) whose value looks up a per-feature weight in
  // heatmapWeightMap; features/vertices with no match get weight 1.
  heatmapWeightProperty?: string;
  heatmapWeightMap?: Record<string, number>;
  // 'wfs' sourceType only — the feature property a user-typed search string
  // (ContextLayerManager.tsx) is matched against, sent to GeoServer as a
  // CQL_FILTER (`<filterProperty> ILIKE '%text%'`, see contextLayerData.ts)
  // rather than filtered client-side after a full fetch. Undefined means no
  // filter box for that layer — only set on layers with one obvious,
  // meaningful free-text field (a name); layers keyed by an enumerated
  // category (lane_type, depth_band, status) don't get one, a free-text
  // search over those isn't a real feature.
  filterProperty?: string;
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
    filterProperty: 'name',
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
    filterProperty: 'name',
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
    filterProperty: 'geoname',
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
    id: 'submarine-cables',
    name: 'Submarine Cables',
    description:
      'Worldwide submarine telecommunication cable routes — 1,404 cables from OpenStreetMap nautical-chart data, incl. well-known systems like FLAG Europe-Asia and CANTAT-3. Solid = operational, dashed = abandoned.',
    sourceType: 'wfs',
    geometryType: 'line',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:submarine_cables',
    attribution: 'OpenStreetMap contributors',
    defaultVisible: false,
    identifiable: false,
    lineColorProperty: 'status',
    lineColorMap: { operational: '#5b9dff', abandoned: '#5b9dff' },
    lineWidthMap: { operational: 1.1, abandoned: 0.7 },
    lineOpacityMap: { operational: 0.8, abandoned: 0.35 },
  },
  {
    id: 'bathymetry-contours',
    name: 'Bathymetry Contours',
    description:
      'Generalised depth contours (50/100/200/500/1000/2000m), Strait of Gibraltar region — derived from the GEBCO grid, 240 lines simplified for the browser.',
    sourceType: 'wfs',
    geometryType: 'line',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:bathymetry_contours',
    attribution: 'EMODnet Bathymetry Consortium — EMODnet Digital Bathymetry (DTM)',
    defaultVisible: false,
    identifiable: false,
    lineColorProperty: 'depth_band',
    lineColorMap: { shallow: '#2e6fa8', mid: '#2467a0', deep: '#173f66' },
    lineWidthMap: { shallow: 0.5, mid: 0.7, deep: 0.9 },
    lineOpacityMap: { shallow: 0.5, mid: 0.65, deep: 0.8 },
  },
  {
    id: 'shipping-traffic-intensity',
    name: 'Shipping Traffic Intensity',
    description:
      "Worldwide shipping-traffic intensity — a heatmap derived from the Shipping Lanes vector data itself (weighted by major/middle/minor/chokepoint), not real AIS point density. No genuinely free, worldwide, no-login AIS density feed exists today (EMODnet's is EU-only; Global Fishing Watch's tile API needs a registered token; NOAA's global product now requires OAuth login) — this is an honest proxy from data already in this stack, not a relabeled version of one of those.",
    sourceType: 'wfs',
    geometryType: 'heatmap',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:shipping_lanes',
    attribution: 'Derived from Global Shipping Lanes (Paul Benden, CC BY-SA 4.0) and Eurostat SeaRoute chokepoints',
    defaultVisible: false,
    identifiable: false,
    heatmapWeightProperty: 'lane_type',
    heatmapWeightMap: { major: 1, middle: 0.6, minor: 0.3, chokepoint: 1 },
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
    id: 'drawn-shapes',
    name: 'Drawn Shapes',
    description:
      "User-traced polygons from the drawing tool, worldwide — each associated with a specific Maritime Ports/Airfields/Order-of-Battle object. A given object's shapes also render automatically on its own object card without needing this layer on; toggle it on to browse/search all of them at once, e.g. by port name.",
    sourceType: 'wfs',
    geometryType: 'polygon',
    wfsBaseUrl: `${GEOSERVER_URL}/meridian/wfs`,
    layerName: 'meridian:drawn_shapes',
    attribution: 'Traced in-app via the drawing tool, against captured Google satellite imagery',
    defaultVisible: false,
    identifiable: false,
    polygonFillColor: '#3fd2e6',
    polygonFillOpacity: 0.08,
    polygonLineColor: '#3fd2e6',
    polygonLineWidth: 1.2,
    filterProperty: 'object_label',
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
    rasterMaxZoom: 7,
  },
];

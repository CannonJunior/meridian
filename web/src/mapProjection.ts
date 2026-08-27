import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';

// The AO's real-world bounding box. The AO ("AZ STRAIT") is fictional; the
// Strait of Gibraltar was picked only because its coastline shape reads
// well as a strait — no claim about the identity of any real force is
// implied. Every live entity (targets/sensors/effectors/units/nais) now
// carries real WGS84 lng/lat directly from the server — this bbox is used
// only for the map's initial view (fitBounds), not for any coordinate
// conversion; that's what AO_BOUNDS used to be for (a linear x/y -> lng/lat
// stretch, applied once, before the simulation itself moved to real
// coordinates — see server/src/aoBounds.ts, which mirrors this file since
// server/ and web/ don't share a code package).
//
// Gibraltar is this project's first AO, not its only one — Meridian's
// long-term scope is worldwide, with more real-world AOs (each its own
// AO_BOUNDS-equivalent, own context layers, own OOB) added over time. Code
// and comments elsewhere that describe "the Strait of Gibraltar region" are
// describing this current pilot AO's actual data coverage, not a
// permanent ceiling on the project.
export const AO_BOUNDS = {
  west: -6.05,
  east: -5.15,
  south: 35.75,
  north: 36.25,
};

export const AO_CENTER: [number, number] = [(AO_BOUNDS.west + AO_BOUNDS.east) / 2, (AO_BOUNDS.south + AO_BOUNDS.north) / 2];

// Plain XYZ tile URL templates — used to build an ol/source/XYZ per style
// (see TacticalMap.tsx). `{r}` is CARTO's retina-tile convention (becomes
// `@2x` on a high-DPI screen, empty otherwise); resolved at source-creation
// time, not baked in here, since it depends on the runtime devicePixelRatio.
export interface BasemapStyle {
  id: string;
  label: string;
  tileUrlTemplates: string[];
  attribution: string;
}

// Previously CARTO's free basemap CDN (basemaps.cartocdn.com) — CARTO
// started gating that endpoint behind an API key/account, so hotlinked
// tiles started rendering as "API KEY REQUIRED" placeholder images with no
// warning here. Replaced with Esri's ArcGIS Online world basemap services —
// the same no-key-required, same-domain pattern the 'satellite' entry below
// already used successfully, just different service names. Esri tiles have
// no retina-tile convention (unlike CARTO's `{r}`), so these templates omit
// it — resolveTileUrls' `{r}` replace is a no-op when the placeholder isn't
// present, same as it already was for 'satellite'.
export const BASEMAP_STYLES: BasemapStyle[] = [
  {
    id: 'tactical',
    label: 'TAC',
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS',
    tileUrlTemplates: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
  },
  {
    id: 'light',
    label: 'LIGHT',
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS',
    tileUrlTemplates: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
  },
  {
    id: 'satellite',
    label: 'SAT',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    tileUrlTemplates: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  },
  {
    id: 'streets',
    label: 'STR',
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    tileUrlTemplates: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
  },
];

// Projections offered in TacticalMap's projection picker. EPSG:3857 (Web
// Mercator) and EPSG:4326 (Plate Carrée) are built into OpenLayers;
// EPSG:32630 (UTM zone 30N — the real UTM zone for this AO) is not, and
// needs a proj4 definition registered before use (see TacticalMap.tsx's
// registerProjections()). MapLibre, which this app used before, only ever
// rendered in Web Mercator — this is the actual "different map
// projections" capability, not just a relabeled basemap picker.
export interface ProjectionOption {
  code: string;
  label: string;
  proj4def?: string;
  // OpenLayers needs an explicit extent for a UTM zone (used for the
  // default view's fit and validity clipping) — degrees, WGS84.
  worldExtentDeg?: [number, number, number, number];
}

export const PROJECTION_OPTIONS: ProjectionOption[] = [
  { code: 'EPSG:3857', label: 'MERCATOR' },
  { code: 'EPSG:4326', label: 'PLATE CARRÉE' },
  {
    code: 'EPSG:32630',
    label: 'UTM 30N',
    proj4def: '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs',
    worldExtentDeg: [-6, 0, 0, 84],
  },
];

let projectionsRegistered = false;

// Registers every PROJECTION_OPTIONS entry that needs a proj4 definition
// (anything OpenLayers doesn't already know natively) with proj4, then
// hands the whole proj4 registry to OpenLayers via ol/proj/proj4's
// register() — the documented pattern for adding a custom CRS. Synchronous
// and idempotent, so it's safe to call at a component module's top level
// and be certain every PROJECTION_OPTIONS code is usable by the time the
// first View is constructed (an async version of this raced View creation
// against the projection actually being registered).
export function registerProjections(): void {
  if (projectionsRegistered) return;
  projectionsRegistered = true;
  for (const p of PROJECTION_OPTIONS) {
    if (p.proj4def) proj4.defs(p.code, p.proj4def);
  }
  register(proj4);
}

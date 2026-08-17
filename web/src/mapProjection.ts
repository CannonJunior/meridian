import type { StyleSpecification } from 'maplibre-gl';

// Maps the simulation's abstract 0-100 x/y percent space onto a real bounding
// box so the tactical picture can render over a real basemap. The AO ("AZ
// STRAIT") is fictional; the Strait of Gibraltar was picked only because its
// coastline shape reads well as a strait — no claim about the identity of
// any real force is implied. x runs west->east, y runs north->south (top of
// the old abstract map = north), matching the existing simulation's screen-
// down y convention.
export const AO_BOUNDS = {
  west: -6.05,
  east: -5.15,
  south: 35.75,
  north: 36.25,
};

export function toLngLat(x: number, y: number): [number, number] {
  const lng = AO_BOUNDS.west + (x / 100) * (AO_BOUNDS.east - AO_BOUNDS.west);
  const lat = AO_BOUNDS.north - (y / 100) * (AO_BOUNDS.north - AO_BOUNDS.south);
  return [lng, lat];
}

export const AO_CENTER: [number, number] = toLngLat(50, 50);

export interface BasemapStyle {
  id: string;
  label: string;
  styleUrl: StyleSpecification;
  attribution: string;
}

export const BASEMAP_STYLES: BasemapStyle[] = [
  {
    id: 'tactical',
    label: 'TAC',
    attribution: '© CARTO © OpenStreetMap contributors',
    styleUrl: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', 'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '© CARTO © OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    },
  },
  {
    id: 'light',
    label: 'LIGHT',
    attribution: '© CARTO © OpenStreetMap contributors',
    styleUrl: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', 'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '© CARTO © OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    },
  },
  {
    id: 'satellite',
    label: 'SAT',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    styleUrl: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    },
  },
  {
    id: 'streets',
    label: 'STR',
    attribution: '© CARTO © OpenStreetMap contributors',
    styleUrl: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', 'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '© CARTO © OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    },
  },
];

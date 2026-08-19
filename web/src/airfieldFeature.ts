// Maps a rendered GeoJSON airfield center-point feature (hit via MapLibre's
// native feature click) into the AirfieldFeature shape the store/object
// card expect. The boundary/runway/taxiway polygons in the same layer are
// not identifiable — only the one representative point per airfield is.
import type { MapGeoJSONFeature } from 'maplibre-gl';

export interface AirfieldFeature {
  id: string;
  name: string;
  icao: string | null;
  lng: number;
  lat: number;
}

export function airfieldFeatureFromGeoJSON(feature: MapGeoJSONFeature): AirfieldFeature {
  const p = feature.properties ?? {};
  const geom = feature.geometry;
  const [lng, lat] = geom.type === 'Point' ? (geom.coordinates as [number, number]) : [0, 0];
  return {
    id: `airfield-${feature.id ?? p.osm_id ?? `${lng},${lat}`}`,
    name: p.name ?? 'UNNAMED AIRFIELD',
    icao: p.icao ?? null,
    lng,
    lat,
  };
}

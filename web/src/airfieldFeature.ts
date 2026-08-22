// Maps a rendered GeoJSON airfield center-point feature (hit via
// OpenLayers' native feature click) into the AirfieldFeature shape the
// store/object card expect. The boundary/runway/taxiway polygons in the
// same layer are not identifiable — only the one representative point per
// airfield is.
import type { FeatureLike } from 'ol/Feature';
import { toLonLat } from 'ol/proj';
import type { ProjectionLike } from 'ol/proj';
import type { Point } from 'ol/geom';

export interface AirfieldFeature {
  id: string;
  name: string;
  icao: string | null;
  lng: number;
  lat: number;
}

export function airfieldFeatureFromGeoJSON(feature: FeatureLike, viewProjection: ProjectionLike): AirfieldFeature {
  const p = feature.getProperties();
  const geom = feature.getGeometry();
  const coord = geom?.getType() === 'Point' ? (geom as Point).getCoordinates() : [0, 0];
  const [lng, lat] = toLonLat(coord, viewProjection);
  return {
    id: `airfield-${feature.getId() ?? p.osm_id ?? `${lng},${lat}`}`,
    name: p.name ?? 'UNNAMED AIRFIELD',
    icao: p.icao ?? null,
    lng,
    lat,
  };
}

// Maps a rendered GeoJSON port feature (from the WFS-loaded context layer,
// hit via OpenLayers' native feature click) into the PortFeature shape the
// store/object card expect.
import type { FeatureLike } from 'ol/Feature';
import { toLonLat } from 'ol/proj';
import type { ProjectionLike } from 'ol/proj';
import type { Point } from 'ol/geom';

export interface PortFeature {
  id: string;
  wpiPortId: number | null;
  name: string;
  country: string | null;
  state: string | null;
  portSize: string | null;
  maxVesselSize: string | null;
  cargoPierDepthMaxM: number | null;
  lng: number;
  lat: number;
}

export function portFeatureFromGeoJSON(feature: FeatureLike, viewProjection: ProjectionLike): PortFeature {
  const p = feature.getProperties();
  const geom = feature.getGeometry();
  const coord = geom?.getType() === 'Point' ? (geom as Point).getCoordinates() : [0, 0];
  const [lng, lat] = toLonLat(coord, viewProjection);
  return {
    id: `port-${feature.getId() ?? p.wpi_port_id ?? `${lng},${lat}`}`,
    wpiPortId: p.wpi_port_id ?? null,
    name: p.name ?? 'UNNAMED PORT',
    country: p.country ?? null,
    state: p.state ?? null,
    portSize: p.port_size ?? null,
    maxVesselSize: p.max_vessel_size ?? null,
    cargoPierDepthMaxM: p.cargo_pier_depth_max_m ?? null,
    lng,
    lat,
  };
}

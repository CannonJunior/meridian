// Maps a rendered GeoJSON port feature (from the WFS-loaded context layer,
// hit via MapLibre's native feature click) into the PortFeature shape the
// store/object card expect.
import type { MapGeoJSONFeature } from 'maplibre-gl';

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

export function portFeatureFromGeoJSON(feature: MapGeoJSONFeature): PortFeature {
  const p = feature.properties ?? {};
  const geom = feature.geometry;
  const [lng, lat] = geom.type === 'Point' ? (geom.coordinates as [number, number]) : [0, 0];
  return {
    id: `port-${feature.id ?? p.wpi_port_id ?? `${lng},${lat}`}`,
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

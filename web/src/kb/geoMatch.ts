// Derives knowledge-graph nodes from the two WFS-backed context layers
// whose features carry a genuine, verifiable correspondence to OOB
// entities — 'eez' via its `sovereign` property (an exact string match
// against the OOB country roots this app models), and 'maritime-ports' via
// real-world proximity to OOB entities' own coordinates (confirmed by
// spot-checking real WPI-listed ports against Yokosuka/Sasebo/Guam before
// writing this). The other 6 WFS-backed layers (airfields, submarine
// cables, bathymetry, shipping lanes/traffic, weather radar) were checked
// against the current dataset and have no such verifiable identifier —
// deliberately left unjoined here rather than guessed at.

import type { FeatureCollection } from 'geojson';
import type { OobNode } from '../assets/oob';
import { OOB_TREE } from '../assets/oob';
import { contextLayerUri, geoFeatureUri, oobUri } from './ontology';
import type { KgNode } from './ontology';

// OOB country roots this app currently models (assets/oob.ts's RAW_TREE) —
// eez's `sovereign` property is matched against these names verbatim, no
// fuzzy/partial matching.
const OOB_COUNTRY_BY_SOVEREIGN_NAME: Record<string, string> = {
  'United States': 'us',
  China: 'cn',
  Russia: 'ru',
};

export function deriveEezZones(eezLayerId: string, fc: FeatureCollection): KgNode[] {
  const layerUri = contextLayerUri(eezLayerId);
  return fc.features.map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const uri = geoFeatureUri(eezLayerId, String(p.mrgid_eez ?? f.id ?? p.geoname));
    const countryId = typeof p.sovereign === 'string' ? OOB_COUNTRY_BY_SOVEREIGN_NAME[p.sovereign] : undefined;
    return {
      '@id': uri,
      '@type': 'GeoFeature',
      name: typeof p.geoname === 'string' ? p.geoname : 'Unnamed EEZ zone',
      properties: {
        territory: typeof p.territory === 'string' ? p.territory : undefined,
        sovereign: typeof p.sovereign === 'string' ? p.sovereign : undefined,
        isoTer: typeof p.iso_ter === 'string' ? p.iso_ter : undefined,
        areaKm2: typeof p.area_km2 === 'number' ? p.area_km2 : undefined,
      },
      partOf: [layerUri],
      relatedTo: countryId ? [oobUri(countryId)] : undefined,
    } satisfies KgNode;
  });
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

// Every OOB node with its own lat/lng — every ship, plus the three 'base'
// nodes (Yokosuka/Sasebo/Guam), which now carry the same station
// coordinate their ships are placed near (see assets/oob.ts). Widened
// deliberately to ships, not just base nodes, so homeports without a
// dedicated 'base' entity (Rota, Bahrain, Point Loma) still match.
interface Anchor {
  uri: string;
  lat: number;
  lng: number;
}

function oobAnchors(): Anchor[] {
  const anchors: Anchor[] = [];
  function collect(nodes: OobNode[]) {
    for (const n of nodes) {
      if (n.lat != null && n.lng != null) anchors.push({ uri: oobUri(n.id), lat: n.lat, lng: n.lng });
      if (n.children) collect(n.children);
    }
  }
  collect(OOB_TREE);
  return anchors;
}

// 20km comfortably covers both a ship's own ring-spacing offset from its
// home port (~5-8km, see assets/oob.ts's nearPort()) and the small
// real-world gap between a station's nominal coordinate and its nearest
// WPI-listed port record (~1-4km, confirmed by spot-checking Yokosuka/
// Sasebo/Guam against the live WFS data before writing this) — wide enough
// to also catch Rota/Bahrain/Point Loma, without being so wide it starts
// pulling in unrelated ports. A port matching nothing is left out of the
// graph entirely rather than becoming an unlinked node — see
// derivePortMatches below.
const MATCH_RADIUS_KM = 20;

export function derivePortMatches(portsLayerId: string, fc: FeatureCollection): KgNode[] {
  const layerUri = contextLayerUri(portsLayerId);
  const anchors = oobAnchors();
  const nodes: KgNode[] = [];
  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const related = anchors.filter((a) => haversineKm(a, { lat, lng }) <= MATCH_RADIUS_KM).map((a) => a.uri);
    if (related.length === 0) continue; // only matched ports become nodes — see file header
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const uri = geoFeatureUri(portsLayerId, p.wpi_port_id != null ? String(p.wpi_port_id) : String(f.id));
    nodes.push({
      '@id': uri,
      '@type': 'GeoFeature',
      name: typeof p.name === 'string' ? p.name : 'Unnamed port',
      properties: {
        country: typeof p.country === 'string' ? p.country : undefined,
        portSize: typeof p.port_size === 'string' ? p.port_size : undefined,
        maxVesselSize: typeof p.max_vessel_size === 'string' ? p.max_vessel_size : undefined,
      },
      partOf: [layerUri],
      relatedTo: related,
    });
  }
  return nodes;
}

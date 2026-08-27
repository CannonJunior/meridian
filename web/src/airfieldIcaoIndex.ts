// Resolves a Sortie's originAirfield/recoveryAirfield (an ICAO code — see
// server/src/seed.ts) to real coordinates. Phase A's comment on Sortie
// flagged this exact gap ("Fixture-era display names, not GeoServer
// feature ids yet"); this is Phase C's "airfield endpoint reuse" closing
// it.
//
// A deliberately separate, narrower WFS fetch from loadContextLayerData
// (contextLayerData.ts) rather than reusing it: that helper's CQL_FILTER
// is built around ContextLayerManager's name-substring search
// (layer.filterProperty/'name'), and the airfields layer's `kind` column
// (boundary/runway/taxiway/centerpoint — confirmed live: 29 centerpoint
// points vs. 536 boundary/runway/taxiway polygons) isn't something that
// generic helper's contract has any business knowing about. Filtering by
// kind='centerpoint' server-side, instead of fetching the whole layer
// (every runway/taxiway/boundary polygon included) just to throw away
// everything but a handful of points client-side, cuts this fetch to
// roughly 5% of the full layer's payload.
import type { FeatureCollection } from 'geojson';
import { CONTEXT_LAYERS } from './assets/contextLayers';

const AIRFIELDS_LAYER = CONTEXT_LAYERS.find((l) => l.id === 'airfields')!;

export interface AirfieldLocation {
  lng: number;
  lat: number;
  name: string;
}

let cached: Promise<Record<string, AirfieldLocation>> | null = null;

// Keyed by ICAO, uppercased — the only stable identifier available (see
// airfieldFeature.ts: `icao` is a real but optional OSM property, present
// for only some of the layer's 29 airfields). An airfield with no ICAO
// code, or a Sortie endpoint whose code isn't in this layer at all, simply
// doesn't resolve — callers treat a missing entry as "can't draw this
// leg yet," not as an error.
export function loadAirfieldIcaoIndex(): Promise<Record<string, AirfieldLocation>> {
  if (!cached) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: AIRFIELDS_LAYER.layerName!,
      outputFormat: 'application/json',
      CQL_FILTER: "kind='centerpoint'",
    });
    cached = fetch(`${AIRFIELDS_LAYER.wfsBaseUrl}?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`WFS GetFeature failed for airfields centerpoints: ${res.status}`);
        return res.json();
      })
      .then((fc: FeatureCollection) => {
        const index: Record<string, AirfieldLocation> = {};
        for (const f of fc.features) {
          if (f.geometry?.type !== 'Point') continue;
          const props = (f.properties ?? {}) as { icao?: string; name?: string };
          if (!props.icao) continue;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          index[props.icao.toUpperCase()] = { lng, lat, name: props.name ?? props.icao };
        }
        return index;
      });
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

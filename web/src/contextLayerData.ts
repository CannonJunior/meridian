// Fetches a context layer's full feature set from GeoServer via WFS
// (GeoJSON), once, caching the in-flight/completed request per layer so
// repeated visibility toggles don't re-fetch.
import type { FeatureCollection } from 'geojson';
import type { ContextLayer } from './assets/contextLayers';

const cache = new Map<string, Promise<FeatureCollection>>();

export function loadContextLayerData(layer: ContextLayer): Promise<FeatureCollection> {
  let pending = cache.get(layer.id);
  if (!pending) {
    if (layer.sourceType === 'static') {
      pending = Promise.resolve(layer.staticData!);
    } else {
      const url = `${layer.wfsBaseUrl}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(layer.layerName!)}&outputFormat=application/json`;
      pending = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`WFS GetFeature failed for ${layer.id}: ${res.status}`);
        return res.json();
      });
    }
    pending.catch(() => cache.delete(layer.id)); // let a failed fetch be retried on the next toggle
    cache.set(layer.id, pending);
  }
  return pending;
}

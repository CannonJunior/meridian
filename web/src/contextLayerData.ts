// Fetches a context layer's full feature set from GeoServer via WFS
// (GeoJSON), once per (layer, filter text) pair, caching the in-flight/
// completed request so repeated visibility toggles don't re-fetch.
//
// filterText (ContextLayerManager.tsx's per-layer search box, keyed by
// layer.filterProperty — see assets/contextLayers.ts) is sent to GeoServer
// as a CQL_FILTER (`<filterProperty> ILIKE '%text%'`) rather than filtered
// client-side after a full fetch — the same "let GeoServer do the query"
// principle this app already applies everywhere else (server/src/
// historyQuery.ts's buildCqlFilter does the equivalent thing for the
// entity-track-history layer). Confirmed live against this app's own
// GeoServer that ILIKE is supported and case-insensitive, and that an
// embedded quote is escaped correctly rather than breaking the query.
import type { FeatureCollection } from 'geojson';
import type { ContextLayer } from './assets/contextLayers';

const cache = new Map<string, Promise<FeatureCollection>>();

// Doubles an embedded single quote, same rule as SQL/CQL string literals —
// mirrors server/src/historyQuery.ts's cqlString escaping.
function cqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function loadContextLayerData(layer: ContextLayer, filterText = ''): Promise<FeatureCollection> {
  const trimmedFilter = layer.filterProperty ? filterText.trim() : '';
  const cacheKey = `${layer.id}::${trimmedFilter.toLowerCase()}`;
  let pending = cache.get(cacheKey);
  if (!pending) {
    if (layer.sourceType === 'static') {
      pending = Promise.resolve(layer.staticData!);
    } else {
      const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: layer.layerName!,
        outputFormat: 'application/json',
      });
      if (trimmedFilter && layer.filterProperty) {
        params.set('CQL_FILTER', `${layer.filterProperty} ILIKE ${cqlString(`%${trimmedFilter}%`)}`);
      }
      const url = `${layer.wfsBaseUrl}?${params.toString()}`;
      pending = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`WFS GetFeature failed for ${layer.id}: ${res.status}`);
        return res.json();
      });
    }
    pending.catch(() => cache.delete(cacheKey)); // let a failed fetch be retried on the next toggle
    cache.set(cacheKey, pending);
  }
  return pending;
}

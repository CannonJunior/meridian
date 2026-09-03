// Context-layer OpenLayers styling and the visibility/filter sync loop —
// split out of TacticalMap.tsx itself (see this repo's maintainability
// audit) because this is a self-contained concern: given the current
// contextLayerVisibility/contextLayerFilters state, make the map's actual
// OL layers match it. Nothing here touches live entity state (targets,
// sensors, ...) — see overlays.tsx for that.
import OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormat from 'ol/format/GeoJSON';
import { Style, Fill, Stroke, Circle as CircleStyle, RegularShape } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import { useStore } from '../../store';
import { hexToRgba } from '../../assets/palette';
import LAYER_COLORS from '../../assets/layerColors.json';
import { CONTEXT_LAYERS } from '../../assets/contextLayers';
import type { ContextLayer } from '../../assets/contextLayers';
import { loadContextLayerData, cqlString } from '../../contextLayerData';
import { fetchLatestRadarTileUrl } from '../../rainviewer';
import { buildHeatmapPoints } from './geometryHelpers';

// Every vector source is read with a fixed internal storage projection
// (EPSG:3857) regardless of the view's current projection — OpenLayers
// reprojects vector (and raster) layers on the fly at render time when a
// layer's data projection differs from the view's, so switching projection
// via the picker never requires re-fetching or re-parsing any layer.
export const FEATURE_STORAGE_PROJECTION = 'EPSG:3857';
export const geoJSONFormat = new GeoJSONFormat({ dataProjection: 'EPSG:4326', featureProjection: FEATURE_STORAGE_PROJECTION });

// A two-graphic "marker" (outline shape + solid center dot) rather than a
// single small dot — reads as a deliberate icon at a glance, and doubles
// the hit-testable area over a single tiny circle. `shape: 'ring'` (a
// hollow circle) is used for point-only layers (ports, tenth-fleet);
// `shape: 'diamond'` for airfields' centerpoint, so the two read as
// visually distinct icon families rather than identical dots — a rotated
// square outline, echoing the same hollow-diamond language TrackSymbol and
// the OOB markers already use elsewhere in the app for "this is a
// platform/contact," just in this layer's own color instead of an
// affiliation color.
function pointMarkerStyle(color: string, shape: 'ring' | 'diamond'): Style[] {
  const outline =
    shape === 'diamond'
      ? new RegularShape({ points: 4, radius: 9, angle: Math.PI / 4, fill: new Fill({ color: '#0c1416' }), stroke: new Stroke({ color, width: 2 }) })
      : new CircleStyle({ radius: 7, fill: new Fill({ color: '#0c1416' }), stroke: new Stroke({ color, width: 2 }) });
  return [new Style({ image: outline }), new Style({ image: new CircleStyle({ radius: 2.5, fill: new Fill({ color }) }) })];
}

// Builds the OL style for a 'polygon' or 'mixed' geometry context layer.
// Airfields (the one 'mixed' layer) carries a `kind` property
// (boundary/runway/taxiway/centerpoint) — style each differently, matching
// the GeoServer-side SLD used for non-OpenLayers WMS consumers
// (geoserver-init/airfields_style.sld), both driven by the same
// assets/layerColors.json so the two can't drift out of sync the way they
// once had (see contextLayers.ts's header comment). Point (centerpoint)
// features get the diamond marker instead of fill/stroke — the fallback
// fill/stroke values below for that branch are unreachable (Point geometry
// is handled above) and intentionally not centralized in layerColors.json
// for that reason. Other polygon layers (e.g. EEZ) have no `kind` property
// and use their own flat paint overrides instead (see ContextLayer.polygon*
// fields).
function polygonStyleFor(layer: ContextLayer) {
  return (feature: FeatureLike): Style | Style[] => {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'Point') {
      return pointMarkerStyle(layer.pointColor ?? LAYER_COLORS.ports.fill, 'diamond');
    }
    if (layer.id === 'airfields') {
      const kind = feature.get('kind') as string | undefined;
      const style = kind === 'boundary' || kind === 'runway' || kind === 'taxiway' ? LAYER_COLORS.airfields[kind] : { fill: '#5fe39a', fillOpacity: 0.5, stroke: '#06090a', strokeWidth: 0.4 };
      return new Style({ fill: new Fill({ color: hexToRgba(style.fill, style.fillOpacity) }), stroke: new Stroke({ color: style.stroke, width: style.strokeWidth }) });
    }
    return new Style({
      fill: new Fill({ color: hexToRgba(layer.polygonFillColor ?? '#5fe39a', layer.polygonFillOpacity ?? 0.5) }),
      stroke: new Stroke({ color: layer.polygonLineColor ?? '#06090a', width: layer.polygonLineWidth ?? 0.4, lineDash: layer.polygonLineDasharray }),
    });
  };
}

// Builds the OL style for a 'line' geometry context layer: per-feature
// color/width/opacity keyed on layer.lineColorProperty when the layer
// defines one (e.g. shipping lanes' major/middle/minor/chokepoint
// `lane_type`), falling back to the layer's flat line* fields for
// unmatched values or when no lineColorProperty is set.
function lineStyleFor(layer: ContextLayer) {
  const { lineColorProperty, lineColorMap, lineWidthMap, lineOpacityMap } = layer;
  return (feature: FeatureLike): Style => {
    let color = layer.lineColor ?? '#ffffff';
    let width = layer.lineWidth ?? 1;
    let opacity = layer.lineOpacity ?? 0.6;
    if (lineColorProperty && lineColorMap) {
      const key = String(feature.get(lineColorProperty));
      color = lineColorMap[key] ?? color;
      width = lineWidthMap?.[key] ?? width;
      opacity = lineOpacityMap?.[key] ?? opacity;
    }
    return new Style({ stroke: new Stroke({ color: hexToRgba(color, opacity), width }) });
  };
}

// Builds the CQL_FILTER param for a 'wms' sourceType layer's GetMap
// request — the WMS equivalent of contextLayerData.ts's GetFeature
// CQL_FILTER, reusing its same cqlString escaping. Returns undefined (so
// the param is omitted entirely) when there's no filterProperty or the
// user hasn't typed anything, matching a plain unfiltered GetMap request.
function wmsCqlFilter(layer: ContextLayer, filterText: string): string | undefined {
  const trimmed = layer.filterProperty ? filterText.trim() : '';
  if (!trimmed || !layer.filterProperty) return undefined;
  return `${layer.filterProperty} ILIKE ${cqlString(`%${trimmed}%`)}`;
}

export function syncContextLayers(
  map: OlMap,
  visibility: Record<string, boolean>,
  filters: Record<string, string>,
  layerRefs: Map<string, BaseLayer>,
  appliedFilters: Map<string, string>,
  radarUrlRef: { current: string | null },
) {
  for (const layer of CONTEXT_LAYERS) {
    const shouldShow = !!visibility[layer.id];
    const hasLayer = layerRefs.has(layer.id);
    // Only layers with a filterProperty (assets/contextLayers.ts) have a
    // meaningful filter at all — everything else always resolves to '',
    // which never diverges from its own applied value, so this is a no-op
    // for every other layer.
    const desiredFilter = layer.filterProperty ? (filters[layer.id] ?? '') : '';
    const filterChanged = hasLayer && desiredFilter !== (appliedFilters.get(layer.id) ?? '');

    if (layer.geometryType === 'raster') {
      if (shouldShow && !hasLayer) {
        if (layer.sourceType === 'wms') {
          // GeoServer-rendered tiles, styled by the layer's already-
          // provisioned SLD — synchronous, unlike the XYZ path below, since
          // the URL is a fixed GeoServer endpoint rather than something
          // that needs resolving first.
          const olLayer = new TileLayer({
            source: new TileWMS({
              url: layer.wmsBaseUrl!,
              params: { LAYERS: layer.wmsLayerName, TRANSPARENT: true, ...(wmsCqlFilter(layer, desiredFilter) ? { CQL_FILTER: wmsCqlFilter(layer, desiredFilter) } : {}) },
              attributions: layer.attribution,
            }),
            opacity: layer.rasterOpacity ?? 1,
          });
          layerRefs.set(layer.id, olLayer);
          appliedFilters.set(layer.id, desiredFilter);
          map.addLayer(olLayer);
        } else {
          // weather-radar's tile URL changes every ~10min (see rainviewer.ts)
          // and must be re-resolved each time it's turned on; every other
          // raster layer's URL is a fixed template, already sitting on
          // layer.rasterTileUrl — resolve immediately, no fetch needed.
          const urlPromise = layer.id === 'weather-radar' ? fetchLatestRadarTileUrl() : Promise.resolve(layer.rasterTileUrl!);
          urlPromise
            .then((url) => {
              if (!useStore.getState().contextLayerVisibility[layer.id] || layerRefs.has(layer.id)) return;
              if (layer.id === 'weather-radar') radarUrlRef.current = url;
              const olLayer = new TileLayer({
                source: new XYZ({ url, maxZoom: layer.rasterMaxZoom, attributions: layer.attribution }),
                opacity: layer.rasterOpacity ?? 0.6,
              });
              layerRefs.set(layer.id, olLayer);
              map.addLayer(olLayer);
            })
            .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
        }
      } else if (!shouldShow && hasLayer) {
        map.removeLayer(layerRefs.get(layer.id)!);
        layerRefs.delete(layer.id);
        appliedFilters.delete(layer.id);
      } else if (shouldShow && hasLayer && filterChanged && layer.sourceType === 'wms') {
        // In-place tile refresh instead of remove+rebuild — the whole point
        // of a WMS-backed filter: no client-side re-fetch of anything, just
        // a new GetMap request for the same tiles under a new CQL_FILTER.
        const source = (layerRefs.get(layer.id) as TileLayer<TileWMS>).getSource()!;
        const filter = wmsCqlFilter(layer, desiredFilter);
        source.updateParams({ CQL_FILTER: filter ?? null });
        appliedFilters.set(layer.id, desiredFilter);
      }
      continue;
    }

    if (shouldShow && (!hasLayer || filterChanged)) {
      if (filterChanged) {
        // The layer's already showing, but under a different filter (or no
        // filter) than what's now wanted — drop it and rebuild from a fresh
        // fetch rather than trying to patch the existing VectorSource, same
        // as any other "layer's on but its data changed" case in this app.
        map.removeLayer(layerRefs.get(layer.id)!);
        layerRefs.delete(layer.id);
      }
      loadContextLayerData(layer, desiredFilter)
        .then((geojson) => {
          if (!useStore.getState().contextLayerVisibility[layer.id] || layerRefs.has(layer.id)) return;

          if (layer.geometryType === 'heatmap') {
            const points = buildHeatmapPoints(layer, geojson);
            const source = new VectorSource({ features: geoJSONFormat.readFeatures(points) });
            const olLayer = new HeatmapLayer({
              source,
              weight: (f) => (f.get('weight') as number) ?? 1,
              radius: 10,
              blur: 16,
              gradient: ['rgba(0,0,0,0)', 'rgba(63,210,230,.6)', 'rgba(95,227,154,.75)', 'rgba(255,214,10,.85)', 'rgba(255,171,56,.9)', 'rgba(255,90,71,.95)'],
              opacity: 0.7,
            });
            layerRefs.set(layer.id, olLayer);
            appliedFilters.set(layer.id, desiredFilter);
            map.addLayer(olLayer);
            return;
          }

          const source = new VectorSource({ features: geoJSONFormat.readFeatures(geojson) });
          let olLayer: BaseLayer;
          if (layer.geometryType === 'polygon' || layer.geometryType === 'mixed') {
            olLayer = new VectorLayer({ source, style: polygonStyleFor(layer) });
          } else if (layer.geometryType === 'line') {
            olLayer = new VectorLayer({ source, style: lineStyleFor(layer) });
          } else {
            const markerStyle = pointMarkerStyle(layer.pointColor ?? '#3fd2e6', 'ring');
            olLayer = new VectorLayer({ source, style: markerStyle });
          }
          layerRefs.set(layer.id, olLayer);
          appliedFilters.set(layer.id, desiredFilter);
          map.addLayer(olLayer);
        })
        .catch((err) => console.error(`Failed to load context layer "${layer.id}"`, err));
    } else if (!shouldShow && hasLayer) {
      map.removeLayer(layerRefs.get(layer.id)!);
      layerRefs.delete(layer.id);
      appliedFilters.delete(layer.id);
    }
  }
}

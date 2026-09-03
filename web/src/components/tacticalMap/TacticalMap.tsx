// The tactical map's lifecycle: mounting the OpenLayers map (and, on
// demand, the ol-cesium 3D/2.5D scene), keeping it in sync with basemap/
// projection/mode/drawing-tool state, and rendering the overlay layers.
// Split out of a single 1,800+ line TacticalMap.tsx (see this repo's
// maintainability audit) into this directory: geometryHelpers.ts (pure
// helpers), mapConstants.ts (fixed reference data), contextLayerStyles.ts
// (WMS/vector layer sync), overlays.tsx (the SVG live-entity layer), and
// StylePicker.tsx (the dimension/basemap/projection control). This file is
// what's left: map mount/teardown, the drawing-tool integration, the 3D/
// 2.5D Cesium bridge, and the render tree that assembles the pieces above.
// components/TacticalMap.tsx re-exports this file's default export
// unchanged, so nothing outside this directory needed to change its import.
import { useCallback, useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import 'olcs/css/olcs.css';
import OlMap from 'ol/Map';
import View from 'ol/View';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import ImageLayer from 'ol/layer/Image';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import { Style, Fill, Stroke } from 'ol/style';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import type Polygon from 'ol/geom/Polygon';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { defaults as defaultControls } from 'ol/control/defaults';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Attribution from 'ol/control/Attribution';
import { useStore } from '../../store';
import type { DrawLayerId } from '../../store';
import { computeStaticMapExtentWebMercator, fetchGoogleStaticMapDataUrl, GOOGLE_STATIC_MAP_SIZE } from '../../googleStaticMap';
import { statusMeta } from '../../oobSelectors';
import { hexToRgba } from '../../assets/palette';
import { AO_BOUNDS, AO_CENTER, BASEMAP_STYLES, registerProjections } from '../../mapProjection';
import { buildAirborneEntities, exaggeratedMeters, logAltitudeMeters, MODE_25D_LOOK_ANGLE_DEG } from '../../cesium3d';
import type OLCesiumType from 'olcs';
import type * as CesiumNS from 'cesium';
import OobMapLayer from '../OobMapLayer';
import TimelapseMapLayer from '../TimelapseMapLayer';
import { CONTEXT_LAYERS } from '../../assets/contextLayers';
import { portFeatureFromGeoJSON } from '../../portFeature';
import { airfieldFeatureFromGeoJSON } from '../../airfieldFeature';
import { fetchLatestRadarTileUrl } from '../../rainviewer';
import type { FeatureCollection } from 'geojson';
import type { ProjectFn } from './geometryHelpers';
import { resolveTileUrls } from './geometryHelpers';
import { FEATURE_STORAGE_PROJECTION, geoJSONFormat, syncContextLayers } from './contextLayerStyles';
import { MapOverlaySvg } from './overlays';
import { StylePicker } from './StylePicker';
import { OOB_LEGEND_ROWS } from './mapConstants';

registerProjections();

export default function TacticalMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const layerRefs = useRef(new Map<string, BaseLayer>());
  // The filter text each currently-rendered context layer was actually
  // fetched with — compared against the store's live contextLayerFilters in
  // syncContextLayers to detect "still visible, but the search box changed"
  // and trigger a refetch, which plain visibility-toggle tracking wouldn't.
  const appliedContextLayerFiltersRef = useRef(new Map<string, string>());
  const radarUrlRef = useRef<string | null>(null);
  // ol-cesium 3D/2.5D mode (Plan C / Phase 3) — populated by the mapMode
  // effect below, on first activation only (dynamic import, see cesium3d.ts).
  const ol3dRef = useRef<OLCesiumType | null>(null);
  const cesiumRef = useRef<typeof CesiumNS | null>(null);
  const dataSourceRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const pickHandlerRef = useRef<CesiumNS.ScreenSpaceEventHandler | null>(null);
  const basemapId = useStore((s) => s.basemapId);
  const mapProjectionCode = useStore((s) => s.mapProjectionCode);
  const legendMode = useStore((s) => s.legendMode);
  const showOob = useStore((s) => s.showOob);
  const mapMode = useStore((s) => s.mapMode);
  const cesiumActive = mapMode !== '2D';
  const is25D = mapMode === '2.5D';
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const drawTool = useStore((s) => s.drawTool);
  const drawingToolActive = useStore((s) => s.activeManager === 'draw');
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const drawnShapes = useStore((s) => s.drawnShapes);
  const shapeEditing = useStore((s) => s.shapeEditing);
  const timelapseBboxRequest = useStore((s) => s.timelapseBboxRequest);
  const drawImageLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const capturePreviewLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawPolygonPreviewLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawnShapesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const persistedShapeImageLayersRef = useRef<ImageLayer<ImageStatic>[]>([]);
  const shapeEditLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const shapeEditInteractionRef = useRef<Modify | null>(null);
  // The value itself was previously discarded (`[, bumpRender]`) — this was
  // purely a "force a re-render" counter. Now also read by project's
  // useCallback below, so a camera/view change (the only thing this is
  // bumped for — postrender, 3D mode switches, the throttled Cesium camera
  // listener) is exactly what gives `project` a new identity, and nothing
  // else does.
  const [renderTick, bumpRender] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const basemap = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    const projection = mapProjectionCode;

    const baseLayer = new TileLayer({ source: new XYZ({ urls: resolveTileUrls(basemap.tileUrlTemplates), attributions: basemap.attribution }) });
    baseLayerRef.current = baseLayer;

    const view = new View({ projection, center: fromLonLat(AO_CENTER, projection), zoom: 10, minZoom: 0 });

    const map = new OlMap({
      target: containerRef.current,
      layers: [baseLayer],
      view,
      // doubleClickZoom is on by default — off here since double-click is
      // this app's "identify" gesture (open a port/airfield/OOB card), not
      // a zoom trigger.
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false, doubleClickZoom: false }),
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }).extend([new Attribution({ collapsible: false })]),
    });
    mapRef.current = map;

    // OL's postrender fires on every rendered frame, including continuously
    // during a pan/zoom drag (not just once at rest) — un-throttled, that
    // forced a full React re-render (and, via project's useCallback below, a
    // full re-projection of every track symbol/marker) at up to 60fps while
    // dragging. Same fix, same rate, as the Cesium postRender listener
    // further below already applies for the identical reason.
    let lastBump = 0;
    const rerender = () => {
      const now = performance.now();
      if (now - lastBump < 50) return;
      lastBump = now;
      bumpRender((v) => v + 1);
    };
    map.on('postrender', rerender);
    view.fit(transformExtent([AO_BOUNDS.west, AO_BOUNDS.south, AO_BOUNDS.east, AO_BOUNDS.north], 'EPSG:4326', projection), { padding: [24, 24, 24, 24], duration: 0 });

    // One map-level singleclick/pointermove pair covers every identifiable
    // context layer — OpenLayers doesn't have MapLibre's per-layer-id event
    // binding, so identify which ContextLayer (if any) owns the hit OL
    // layer via layerRefs. 'mixed' layers (airfields) only treat their
    // Point (centerpoint) features as identifiable, same as before —
    // boundary/runway/taxiway polygons stay non-interactive. Deliberately
    // 'singleclick' (OL's debounced single-click event, which only fires
    // once it's sure a second click isn't coming) rather than raw 'click':
    // a port/airfield/OOB icon opens its card on one click, not two — this
    // is a different interaction model from live tactical entities
    // (TrackSymbol etc.), which use click-to-select / dblclick-to-open on
    // their own SVG overlay, a separate system from this one.
    const identifiableLayers = CONTEXT_LAYERS.filter((l) => l.identifiable);
    const layerFilter = (l: BaseLayer) => identifiableLayers.some((cl) => layerRefs.current.get(cl.id) === l);

    map.on('singleclick', (evt) => {
      const hit = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, olLayer) => {
          const layer = identifiableLayers.find((cl) => layerRefs.current.get(cl.id) === olLayer);
          if (!layer) return undefined;
          if (layer.geometryType === 'mixed' && feature.getGeometry()?.getType() !== 'Point') return undefined;
          return { feature, layer };
        },
        { layerFilter, hitTolerance: 6 },
      );
      if (!hit) return;
      // Features are always parsed into FEATURE_STORAGE_PROJECTION
      // (EPSG:3857), independent of whatever the view's current projection
      // is — reproject from that fixed storage projection, not the view's.
      if (hit.layer.id === 'airfields') useStore.getState().openAirfield(airfieldFeatureFromGeoJSON(hit.feature, FEATURE_STORAGE_PROJECTION));
      else if (hit.layer.id === 'tenth-fleet') useStore.getState().openOob(hit.feature.get('oobId') as string);
      else useStore.getState().openPort(portFeatureFromGeoJSON(hit.feature, FEATURE_STORAGE_PROJECTION));
    });
    map.on('pointermove', (evt) => {
      if (evt.dragging) return;
      const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter, hitTolerance: 6 });
      const el = map.getTargetElement();
      if (el) el.style.cursor = hit ? 'pointer' : '';
    });

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: box.width, h: box.height });
      map.updateSize();
      rerender();
    });
    ro.observe(containerRef.current);

    const layers = layerRefs.current;
    return () => {
      ro.disconnect();
      pickHandlerRef.current?.destroy();
      pickHandlerRef.current = null;
      ol3dRef.current?.destroy();
      ol3dRef.current = null;
      cesiumRef.current = null;
      dataSourceRef.current = null;
      map.setTarget(undefined);
      mapRef.current = null;
      baseLayerRef.current = null;
      layers.clear();
    };
    // Basemap and projection changes are handled by their own effects below
    // (swap the base layer's source / rebuild the view in place) rather
    // than tearing down and remounting the whole map — only the initial
    // basemapId/mapProjectionCode values matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swapping the base layer's source (rather than MapLibre's old
  // map.setStyle(), which wiped every custom source/layer) means context
  // layers never need re-syncing after a basemap change — they live on the
  // map's layer collection independently of the base layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !baseLayerRef.current) return;
    const basemap = BASEMAP_STYLES.find((b) => b.id === basemapId) ?? BASEMAP_STYLES[0];
    baseLayerRef.current.setSource(new XYZ({ urls: resolveTileUrls(basemap.tileUrlTemplates), attributions: basemap.attribution }));
  }, [basemapId]);

  // Switching projection means constructing a new View (OpenLayers has no
  // in-place projection change) — vector/raster layers need no touching at
  // all, since they were parsed into a fixed storage projection and
  // OpenLayers reprojects on the fly at render time whenever a layer's data
  // projection differs from the view's.
  const appliedProjectionCode = useRef(mapProjectionCode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapProjectionCode === appliedProjectionCode.current) return;
    const prevView = map.getView();
    const prevProjection = prevView.getProjection();
    const centerLngLat = toLonLat(prevView.getCenter() ?? fromLonLat(AO_CENTER, prevProjection), prevProjection);
    const nextView = new View({ projection: mapProjectionCode, center: fromLonLat(centerLngLat, mapProjectionCode), zoom: prevView.getZoom() ?? 10, minZoom: 0 });
    map.setView(nextView);
    appliedProjectionCode.current = mapProjectionCode;
  }, [mapProjectionCode]);

  // ol-cesium is large and most sessions never touch 3D mode, so it's
  // dynamically imported here on first activation rather than at module
  // load (see cesium3d.ts's header comment). Toggling back off just hides
  // the already-built Cesium scene via setEnabled(false) — no teardown
  // until the whole map unmounts (see the mount effect's cleanup above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapMode === '2D') {
      ol3dRef.current?.setEnabled(false);
      bumpRender((v) => v + 1);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!ol3dRef.current) {
        const [{ default: OLCesium }, Cesium] = await Promise.all([import('olcs'), import('cesium')]);
        if (cancelled || !mapRef.current) return;
        // olcs's own compiled source references a bare global `Cesium`
        // identifier throughout (no import of its own — see OLCesium.js)
        // rather than importing the package itself. That's fine in a
        // production build, where vite-plugin-cesium injects a classic
        // global Cesium.js <script> tag and rewrites `import 'cesium'` to
        // reference it via rollup-plugin-external-globals — but neither
        // rewrite runs under Vite's dev-server transform, so without this,
        // olcs throws "Cesium is not defined" in dev. Polyfilling the
        // global from the real ESM import we already have works in both.
        (window as unknown as { Cesium?: typeof Cesium }).Cesium = Cesium;
        const ol3d = new OLCesium({ map: mapRef.current });
        const scene = ol3d.getCesiumScene();
        const dataSource = new Cesium.CustomDataSource('meridian-airborne');
        await ol3d.getDataSources().add(dataSource);
        ol3dRef.current = ol3d;
        cesiumRef.current = Cesium;
        dataSourceRef.current = dataSource;
        // Cesium's default render loop runs continuously (every animation
        // frame, ~60/s) even when the camera is idle, and postRender fires
        // once per rendered frame. Forcing a full React re-render on every
        // single one of those pegged the tab's CPU and ballooned memory —
        // throttle to a rate that still tracks the camera smoothly for the
        // SVG overlay's project() calls without re-rendering 60x/s.
        let lastBump = 0;
        scene.postRender.addEventListener(() => {
          const now = performance.now();
          if (now - lastBump < 50) return;
          lastBump = now;
          bumpRender((v) => v + 1);
        });

        // 2.5D's "standardized view" guarantee (fixed look angle, locked
        // heading) can't be enforced solely via the screenSpaceCameraController
        // flags below: Cesium's update3D gates BOTH free orbit-rotate AND
        // ground-plane panning behind the single enableRotate flag (pan3D,
        // the drag-to-pan handler, is only reached through the
        // enableRotate-gated spin3D dispatcher) — there's no separate
        // "translate only" flag in 3D scene mode. Disabling enableRotate to
        // stop heading drift silently disabled panning too. So enableRotate
        // stays on in both modes, and this listener re-locks heading/pitch
        // every frame instead — a no-op during ordinary panning (which only
        // ever changes position, not orientation) and only a visible
        // correction in the rare edge case (dragging past the horizon) that
        // would otherwise let Cesium's look3D/rotate3D fallback drift it.
        scene.postRender.addEventListener(() => {
          if (useStore.getState().mapMode !== '2.5D') return;
          scene.camera.setView({
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(MODE_25D_LOOK_ANGLE_DEG - 90), roll: 0 },
          });
        });

        // Picking parity with the 2D SVG overlay (TrackSymbol/sensor-marker
        // onClick) — a real answer to Risk 03/the "picking moves to a
        // different system" problem Plan C's Section 06 named, scoped here
        // to the airborne entities that only exist in the Cesium scene.
        const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        handler.setInputAction((evt: { position: CesiumNS.Cartesian2 }) => {
          const picked = scene.pick(evt.position);
          const kind = picked?.id?.properties?.meridianKind?.getValue?.();
          const id = picked?.id?.properties?.meridianId?.getValue?.();
          if (!kind || !id) return;
          if (kind === 'target') useStore.getState().selectTarget(id);
          else useStore.getState().openEntity('sensor', id);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        pickHandlerRef.current = handler;
      }
      if (cancelled) return;
      ol3dRef.current!.setEnabled(true);
      // 2.5D is the standardized view: fixed look angle, locked heading,
      // pan/zoom only — no tilt/rotate drag to wander into an unrecognizable
      // picture. Plain 3D restores the free camera. setTilt/setHeading go
      // through olcs's own Camera (not raw Cesium calls) so the OL view's
      // rotation/resolution stay in sync the same way resetNorth's does.
      const scene = ol3dRef.current.getCesiumScene();
      const camera = ol3dRef.current.getCamera();
      const sscc = scene.screenSpaceCameraController;
      if (mapMode === '2.5D') {
        // enableRotate is deliberately left on — see the postRender listener
        // above for why disabling it isn't the right way to lock heading.
        sscc.enableTilt = false;
        camera.setHeading(0);
        camera.setTilt(cesiumRef.current!.Math.toRadians(MODE_25D_LOOK_ANGLE_DEG));
      } else {
        sscc.enableTilt = true;
      }
      bumpRender((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [mapMode]);

  // Keeps the Cesium scene's airborne markers in sync with the same store
  // data TrackSymbol/sensor markers read — pure add-on, no fetch/WS of its
  // own. No-ops until the async init effect above has actually created the
  // data source (harmless: mapMode leaving '2D' and Cesium finishing loading
  // are rarely the same tick, and this effect re-runs on the next store
  // update regardless).
  //
  // The server pushes a fresh `targets` array roughly once a second (see
  // server/src/index.ts's 1000ms sim tick), so this effect re-fires that
  // often even when nothing airborne actually moved. It used to
  // removeAll() the data source and rebuild every stem/point/label from
  // scratch on every one of those ticks — a full destroy-and-recreate of
  // every marker once a second, which is what read as "blinking" (this is
  // separate from, and in addition to, the depthFailMaterial fix below for
  // the ground-endpoint z-fighting flicker). Updating existing entities'
  // properties in place — and only adding/removing entities whose presence
  // actually changed — keeps the same primitives alive across ticks instead
  // of tearing them down every time.
  useEffect(() => {
    if (mapMode === '2D') return;
    const Cesium = cesiumRef.current;
    const dataSource = dataSourceRef.current;
    if (!Cesium || !dataSource) return;
    const heightForAlt = is25D ? logAltitudeMeters : exaggeratedMeters;
    const entities = dataSource.entities;
    const wanted = new Set<string>();
    for (const a of buildAirborneEntities(targets, sensors, mapMode)) {
      const groundPos = Cesium.Cartesian3.fromDegrees(a.lng, a.lat, 0);
      const airPos = Cesium.Cartesian3.fromDegrees(a.lng, a.lat, heightForAlt(a.altFt));
      // depthFailMaterial mirrors material so the stem still draws (rather
      // than flickering in/out) on frames where it grazes the globe/terrain
      // depth buffer near its ground-level endpoint — PolylineGraphics has
      // no disableDepthTestDistance escape hatch like the point/label below.
      const stemColor = Cesium.Color.fromCssColorString(a.color).withAlpha(0.5);
      const stemId = `${a.kind}:${a.id}:stem`;
      wanted.add(stemId);
      const stem = entities.getById(stemId);
      if (!stem) {
        entities.add({ id: stemId, polyline: { positions: [groundPos, airPos], width: 1, material: stemColor, depthFailMaterial: stemColor } });
      } else if (stem.polyline) {
        stem.polyline.positions = new Cesium.ConstantProperty([groundPos, airPos]);
        stem.polyline.material = new Cesium.ColorMaterialProperty(stemColor);
        stem.polyline.depthFailMaterial = new Cesium.ColorMaterialProperty(stemColor);
      }

      const markColor = Cesium.Color.fromCssColorString(a.color);
      const labelText = `${a.label}\n${Math.round(a.altFt).toLocaleString()} FT`;
      const markId = `${a.kind}:${a.id}`;
      wanted.add(markId);
      const mark = entities.getById(markId);
      if (!mark) {
        entities.add({
          id: markId,
          position: airPos,
          point: { pixelSize: 9, color: markColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text: labelText,
            font: '10px "IBM Plex Mono"',
            fillColor: markColor,
            pixelOffset: new Cesium.Cartesian2(0, -24),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#070b0c').withAlpha(0.78),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { meridianKind: a.kind, meridianId: a.id },
        });
      } else {
        mark.position = new Cesium.ConstantPositionProperty(airPos);
        if (mark.point) mark.point.color = new Cesium.ConstantProperty(markColor);
        if (mark.label) {
          mark.label.text = new Cesium.ConstantProperty(labelText);
          mark.label.fillColor = new Cesium.ConstantProperty(markColor);
        }
      }
    }
    for (const e of entities.values.slice()) {
      if (!wanted.has(e.id)) entities.removeById(e.id);
    }
  }, [mapMode, is25D, targets, sensors]);

  const contextLayerVisibility = useStore((s) => s.contextLayerVisibility);
  const contextLayerFilters = useStore((s) => s.contextLayerFilters);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncContextLayers(map, contextLayerVisibility, contextLayerFilters, layerRefs.current, appliedContextLayerFiltersRef.current, radarUrlRef);
  }, [contextLayerVisibility, contextLayerFilters]);

  // Drawing tool, step 1a: while choosing where to capture, keep the
  // preview rectangle continuously locked to the map's live view — recomputed
  // (same math, computeStaticMapExtentWebMercator, the actual capture uses)
  // on every 'moveend', i.e. whenever the user pans OR zooms, with no
  // separate "confirm the area" click. The map's own zoom (rounded — Google
  // Static Maps' zoom parameter is integer-only) becomes drawTool.captureZoom
  // directly; there's no independent zoom control to keep in sync with it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawingToolActive || drawTool.phase !== 'capture') return;
    const view = map.getView();
    const updatePreview = () => {
      const center = view.getCenter();
      if (!center) return;
      const [lng, lat] = toLonLat(center, view.getProjection());
      const zoom = Math.round(view.getZoom() ?? useStore.getState().drawTool.captureZoom);
      const extent = computeStaticMapExtentWebMercator(lng, lat, zoom, GOOGLE_STATIC_MAP_SIZE);
      useStore.getState().setCaptureZoom(zoom);
      useStore.getState().setCapturePreview([lng, lat], extent);
    };
    updatePreview();
    map.on('moveend', updatePreview);
    return () => {
      map.un('moveend', updatePreview);
    };
  }, [drawingToolActive, drawTool.phase]);

  // Drawing tool, step 1b: draws the dashed preview rectangle itself —
  // "the outline of the area on the map where a Google image will be
  // added." Only shown while still choosing where to capture; cleared once
  // the phase moves on or the preview is stale (extent cleared by a reset).
  const captureExtent = drawTool.captureExtent;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (capturePreviewLayerRef.current) {
      map.removeLayer(capturePreviewLayerRef.current);
      capturePreviewLayerRef.current = null;
    }
    if (!drawingToolActive || drawTool.phase !== 'capture' || !captureExtent) return;
    const [minX, minY, maxX, maxY] = captureExtent;
    // captureExtent is EPSG:3857 meters (same as the actual capture's
    // image extent) — converted to lng/lat corners here so it can go
    // through geoJSONFormat like every other feature in this file, rather
    // than importing raw ol Feature/Polygon constructors just for this.
    const corners: [number, number][] = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    const ring = [...corners.map((c) => toLonLat(c)), toLonLat(corners[0])];
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({
      source,
      style: new Style({ stroke: new Stroke({ color: '#3fd2e6', width: 2, lineDash: [6, 6] }) }),
    });
    capturePreviewLayerRef.current = layer;
    map.addLayer(layer);
  }, [captureExtent, drawTool.phase, drawingToolActive]);

  // Drawing tool, step 2: fetch a Google Static Maps image for the last-
  // previewed center (see googleStaticMap.ts) whenever DrawingToolManager
  // bumps captureRequestId. Deliberately uses drawTool.captureCenter (set
  // by the preview step above), not the map's live view center, so what's
  // actually captured always matches the rectangle the user just confirmed
  // — even if they've since nudged the map without re-previewing.
  const captureRequestId = drawTool.captureRequestId;
  useEffect(() => {
    const { captureCenter, captureZoom, captureScale } = useStore.getState().drawTool;
    if (captureRequestId === 0 || !captureCenter) return;
    const [lng, lat] = captureCenter;
    let cancelled = false;
    fetchGoogleStaticMapDataUrl(lng, lat, captureZoom, captureScale)
      .then((dataUrl) => {
        if (cancelled) return;
        const extent = computeStaticMapExtentWebMercator(lng, lat, captureZoom, GOOGLE_STATIC_MAP_SIZE);
        useStore.getState().setCapturedGoogleImage(dataUrl, extent);
      })
      .catch((err) => {
        if (!cancelled) useStore.getState().setCaptureError(err instanceof Error ? err.message : 'Failed to capture Google imagery.');
      });
    return () => {
      cancelled = true;
    };
  }, [captureRequestId]);

  // LayerManager's "USE CURRENT MAP VIEW" button (one per domain's
  // timelapse layer) bumps timelapseBboxRequest — the map itself isn't
  // reachable from that panel. Reads the view's *live* extent at the
  // moment of the request, not a value threaded through props, then
  // converts it to lng/lat (EPSG:4326) — the axis order and datum
  // historyQuery.ts's BboxFilter expects — and writes it into whichever
  // layer's slot the request named.
  useEffect(() => {
    const map = mapRef.current;
    if (!timelapseBboxRequest || !map) return;
    const view = map.getView();
    const extent = view.calculateExtent(map.getSize());
    const [west, south, east, north] = transformExtent(extent, view.getProjection(), 'EPSG:4326');
    useStore.getState().setTimelapseBbox(timelapseBboxRequest.layerId, { west, south, east, north });
  }, [timelapseBboxRequest]);

  // Places the captured Google image on the map at its exact, already-
  // computed EPSG:3857 extent — no warping step (unlike the earlier
  // uploaded-screenshot version, removed): a Static Maps image's bounds are
  // fully determined by the parameters it was requested with, so this is
  // just a plain axis-aligned ol/source/ImageStatic. OL reprojects it on
  // the fly if the view's current projection isn't EPSG:3857 (see
  // FEATURE_STORAGE_PROJECTION's header comment — same mechanism).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawImageLayerRef.current) {
      map.removeLayer(drawImageLayerRef.current);
      drawImageLayerRef.current = null;
    }
    if (!drawTool.imageDataUrl || !drawTool.imageExtent) return;
    const imageSource = new ImageStatic({ url: drawTool.imageDataUrl, imageExtent: drawTool.imageExtent, projection: 'EPSG:3857' });
    // olcs's ImageStatic -> Cesium.SingleTileImageryProvider conversion
    // (core.js's sourceToImageryProvider) doesn't pass tileWidth/tileHeight,
    // which current Cesium's synchronous SingleTileImageryProvider
    // constructor requires — throws a DeveloperError the moment this layer
    // is added while in 2.5D/3D mode. olcs_skip opts the source out of that
    // conversion; the image still renders fine in plain 2D.
    imageSource.set('olcs_skip', true);
    const layer = new ImageLayer({ source: imageSource, opacity: 0.9 });
    drawImageLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawTool.imageDataUrl, drawTool.imageExtent]);

  // Drawing tool, step 3: while tracing, attach a plain OL polygon-draw
  // interaction over a scratch source (live in-progress feedback only) —
  // torn down as soon as the phase moves on (drawend calls setDrawnPolygon,
  // which advances the store's phase to 'associate', see store.ts). The
  // finished polygon itself is rendered by a separate effect below, driven
  // by drawTool.polygonLngLat rather than this scratch layer, so it keeps
  // showing through the associate/save step too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drawTool.phase !== 'polygon') return;
    const source = new VectorSource();
    const scratchLayer = new VectorLayer({
      source,
      style: new Style({ fill: new Fill({ color: 'rgba(63,210,230,.12)' }), stroke: new Stroke({ color: '#3fd2e6', width: 2 }) }),
    });
    map.addLayer(scratchLayer);
    const draw = new Draw({ source, type: 'Polygon' });
    draw.on('drawend', (evt) => {
      const geom = evt.feature.getGeometry() as Polygon;
      const projection = map.getView().getProjection();
      const ring = geom
        .getCoordinates()[0]
        .slice(0, -1)
        .map((c) => toLonLat(c, projection) as [number, number]);
      useStore.getState().setDrawnPolygon(ring);
    });
    map.addInteraction(draw);
    return () => {
      map.removeInteraction(draw);
      map.removeLayer(scratchLayer);
    };
  }, [drawTool.phase]);

  // Drawing tool, step 4: the finished, saved-or-about-to-be-saved polygon,
  // rendered from drawTool.polygonLngLat itself (not the scratch Draw
  // source above) so it stays visible through the associate/save step and
  // clears only when resetDrawTool() runs (polygonLngLat back to null).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawPolygonPreviewLayerRef.current) {
      map.removeLayer(drawPolygonPreviewLayerRef.current);
      drawPolygonPreviewLayerRef.current = null;
    }
    if (!drawTool.polygonLngLat || drawTool.polygonLngLat.length < 3) return;
    // Built straight from lng/lat (EPSG:4326) through the same fixed-
    // storage-projection GeoJSON format every other layer in this file
    // uses (see FEATURE_STORAGE_PROJECTION's header comment) — OpenLayers
    // reprojects it on the fly to whatever the view's current projection
    // is, no manual fromLonLat/toLonLat needed here.
    const ring = [...drawTool.polygonLngLat, drawTool.polygonLngLat[0]];
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({ source, style: new Style({ fill: new Fill({ color: 'rgba(95,227,154,.12)' }), stroke: new Stroke({ color: '#5fe39a', width: 2 }) }) });
    drawPolygonPreviewLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawTool.polygonLngLat]);

  // Renders any already-persisted drawn shapes (see store.ts's
  // loadDrawnShapes/drawnShapes and server/src/drawnShapes.ts) belonging to
  // whichever port/airfield/OOB object card is currently open — this is
  // what makes a shape saved in an earlier session show up again, without
  // needing a permanently-on context layer the way the old port-extents/
  // reporting-points layers worked.
  const drawnShapesKey =
    cardId != null && (cardKind === 'port' || cardKind === 'airfield' || cardKind === 'oobObject')
      ? (`${cardKind === 'port' ? 'maritime-ports' : cardKind === 'airfield' ? 'airfields' : 'oob'}:${cardId}` as const)
      : null;
  useEffect(() => {
    if (!drawnShapesKey) return;
    const [layerId, objectId] = drawnShapesKey.split(':') as [DrawLayerId, string];
    useStore.getState().loadDrawnShapes(layerId, objectId);
  }, [drawnShapesKey]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of persistedShapeImageLayersRef.current) map.removeLayer(layer);
    persistedShapeImageLayersRef.current = [];
    if (drawnShapesLayerRef.current) {
      map.removeLayer(drawnShapesLayerRef.current);
      drawnShapesLayerRef.current = null;
    }
    const fc = drawnShapesKey ? drawnShapes[drawnShapesKey] : undefined;
    if (!fc || fc.features.length === 0) return;

    // Each shape's own captured reference image (if it has one — older
    // shapes predate this and won't), added first so the polygon outline
    // below draws on top of it rather than under it.
    for (const f of fc.features) {
      const props = f.properties as { referenceImageUrl?: string | null; referenceImageExtent?: [number, number, number, number] | null } | null;
      if (!props?.referenceImageUrl || !props.referenceImageExtent) continue;
      const imageSource = new ImageStatic({ url: props.referenceImageUrl, imageExtent: props.referenceImageExtent, projection: 'EPSG:3857' });
      // See the drawing-tool capture effect above for why olcs_skip is set here.
      imageSource.set('olcs_skip', true);
      const imageLayer = new ImageLayer({ source: imageSource, opacity: 0.9 });
      persistedShapeImageLayersRef.current.push(imageLayer);
      map.addLayer(imageLayer);
    }

    // The shape currently open in the Edit flow (if any) gets its own
    // editable layer + Modify interaction below — omitted here so it isn't
    // rendered twice.
    const editableFc: FeatureCollection = { ...fc, features: fc.features.filter((f) => f.id !== shapeEditing?.shapeId) };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(editableFc) });
    const layer = new VectorLayer({
      source,
      style: (feature) => {
        const kind = (feature.get('kind') as string | undefined) ?? 'outline';
        const color = kind === 'reporting-point' ? '#ffab38' : '#3fd2e6';
        return new Style({ fill: new Fill({ color: hexToRgba(color, 0.08) }), stroke: new Stroke({ color, width: 1.2 }) });
      },
    });
    drawnShapesLayerRef.current = layer;
    map.addLayer(layer);
  }, [drawnShapesKey, drawnShapes, shapeEditing?.shapeId]);

  // Drawing tool, Edit flow: while a saved shape is being edited (see
  // DrawingToolManager.tsx's Saved Shapes list / store.ts's shapeEditing),
  // render it as a single editable feature with an OL Modify interaction
  // attached — dragging an existing vertex moves it, dragging the ghost
  // vertex at an edge's midpoint inserts a new one, both built into Modify
  // with no custom hit-testing needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shapeEditing) return;
    const ring = shapeEditing.ring;
    if (!ring) return;
    const closedRing = [...ring, ring[0]];
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: shapeEditing.shapeId, properties: {}, geometry: { type: 'Polygon', coordinates: [closedRing] } }],
    };
    const source = new VectorSource({ features: geoJSONFormat.readFeatures(fc) });
    const layer = new VectorLayer({
      source,
      style: new Style({ fill: new Fill({ color: hexToRgba('#5fe39a', 0.1) }), stroke: new Stroke({ color: '#5fe39a', width: 2 }) }),
    });
    map.addLayer(layer);
    shapeEditLayerRef.current = layer;
    const modify = new Modify({ source });
    modify.on('modifyend', (evt) => {
      const feature = evt.features.getArray()[0];
      const geom = feature.getGeometry() as Polygon;
      const projection = map.getView().getProjection();
      const editedRing = geom
        .getCoordinates()[0]
        .slice(0, -1)
        .map((c) => toLonLat(c, projection) as [number, number]);
      useStore.getState().setEditingShapeRing(editedRing);
    });
    map.addInteraction(modify);
    shapeEditInteractionRef.current = modify;
    return () => {
      map.removeInteraction(modify);
      map.removeLayer(layer);
      shapeEditLayerRef.current = null;
      shapeEditInteractionRef.current = null;
    };
    // Only re-run when switching which shape is being edited, not on every
    // in-flight ring update — this effect owns the interaction's lifecycle,
    // modifyend already keeps the store in sync without a rebuild each drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeEditing?.shapeId]);

  // RainViewer's mosaic advances roughly every 10 minutes — re-poll on that
  // cadence and swap the live tile URL in place (no source/layer teardown)
  // so the radar layer stays current while toggled on.
  const radarVisible = contextLayerVisibility['weather-radar'];
  useEffect(() => {
    if (!radarVisible) return;
    const id = setInterval(() => {
      const olLayer = layerRefs.current.get('weather-radar') as TileLayer<XYZ> | undefined;
      if (!olLayer) return;
      fetchLatestRadarTileUrl()
        .then((url) => {
          radarUrlRef.current = url;
          olLayer.getSource()?.setUrl(url);
        })
        .catch((err) => console.error('Failed to refresh weather-radar tiles', err));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [radarVisible]);

  const flyToRequest = useStore((s) => s.flyToRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToRequest) return;
    const view = map.getView();
    const projection = view.getProjection();
    view.animate({ center: fromLonLat([flyToRequest.lng, flyToRequest.lat], projection), zoom: flyToRequest.zoom, duration: 1200 });
  }, [flyToRequest]);

  // LayerManager.tsx's per-domain "center on this layer's data" button —
  // fits the whole extent rather than flyTo's single point + fixed zoom,
  // since the entities being centered on can be spread arbitrarily far
  // apart (a fixed zoom that suits a tightly-clustered layer would push a
  // widely-spread one off-screen instead of bringing it into view).
  const fitBoundsRequest = useStore((s) => s.fitBoundsRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBoundsRequest) return;
    const view = map.getView();
    const extent = transformExtent(
      [fitBoundsRequest.west, fitBoundsRequest.south, fitBoundsRequest.east, fitBoundsRequest.north],
      'EPSG:4326',
      view.getProjection(),
    );
    view.fit(extent, { padding: [60, 60, 60, 60], duration: 1200, maxZoom: 14 });
  }, [fitBoundsRequest]);

  const resetNorthRequest = useStore((s) => s.resetNorthRequest);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !resetNorthRequest) return;
    // ol-cesium's Camera keeps the OL View's rotation synced to the Cesium
    // camera heading while 3D is enabled, so going through it (rather than
    // just view.setRotation) is what makes this stick once the user is back
    // in 2D after having rotated the 3D globe.
    const camera = ol3dRef.current?.getCamera();
    if (camera) camera.setHeading(0);
    else map.getView().setRotation(0);
  }, [resetNorthRequest]);

  // The continuity insight from the altitude plan's Section 06: this is the
  // same coordinate-to-pixel swap the MapLibre->OpenLayers migration already
  // proved out once (map.project() -> map.getPixelFromCoordinate()) — now
  // extended a second time so the existing SVG overlay (ground/surface
  // targets, sensor coverage, NAIs, ownship/bullseye) keeps tracking
  // correctly under the Cesium camera while 3D mode is active, with zero
  // changes to the symbology itself.
  // useCallback'd on cesiumActive alone (its only non-ref dependency) so
  // this keeps one stable identity across the many renders per second
  // TacticalMap goes through from live target updates — mapRef/ol3dRef/
  // cesiumRef are refs, so reading .current inside always sees the latest
  // map/camera regardless of when this closure was created. A fresh
  // `project` reference every render was invalidating React.memo on every
  // overlay sub-layer that receives it as a prop (MapOverlaySvg's
  // NaiLayer/SensorCoverage/AcoOverlayLayer/FlightLine below), forcing all
  // of them to recompute their geometry every tick even when nothing they
  // actually draw had changed.
  const project: ProjectFn = useCallback(
    (lng, lat) => {
      if (cesiumActive && ol3dRef.current?.getEnabled() && cesiumRef.current) {
        const scene = ol3dRef.current.getCesiumScene();
        const c = scene.cartesianToCanvasCoordinates(cesiumRef.current.Cartesian3.fromDegrees(lng, lat, 0));
        return c ? { x: c.x, y: c.y } : { x: -9999, y: -9999 };
      }
      const map = mapRef.current;
      if (!map) return { x: -9999, y: -9999 };
      const projection = map.getView().getProjection();
      const p = map.getPixelFromCoordinate(fromLonLat([lng, lat], projection));
      return p ? { x: p[0], y: p[1] } : { x: -9999, y: -9999 };
    },
    // renderTick isn't read in the body above — it's deliberately listed
    // anyway so this callback gets a new identity exactly when the camera/
    // view actually changed (postrender, 3D mode switch, the throttled
    // Cesium camera listener — the only things that ever bump it), which
    // is the one case a memoized overlay layer *must* re-render despite
    // every other prop being unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cesiumActive, renderTick],
  );

  // Sensor-imaging convention (this app's EO/IR/SAR context): look angle
  // measured from nadir, 0° = camera pointed straight down, 90° = level
  // with the horizon — the same convention olcs's own Camera uses for tilt
  // (see getTilt()'s doc comment), so read it straight from there rather
  // than re-deriving it from raw Cesium pitch.
  const lookAngleDeg =
    cesiumActive && ol3dRef.current?.getEnabled() && cesiumRef.current
      ? (ol3dRef.current.getCamera().getTilt() * 180) / Math.PI
      : null;

  return (
    <div className="tactical-map" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#05080a' }}>
      <div ref={containerRef} className="tactical-map-container" style={{ position: 'absolute', inset: 0 }} />

      {size.w > 0 && (
        <div className="tactical-map-overlay-wrap" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {showOob && <OobMapLayer project={project} width={size.w} height={size.h} />}
          <TimelapseMapLayer project={project} width={size.w} height={size.h} />
          <MapOverlaySvg project={project} width={size.w} height={size.h} />
        </div>
      )}

      <div className="tactical-map-scanline" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, background: 'linear-gradient(180deg,rgba(63,210,230,0),rgba(63,210,230,.05))', pointerEvents: 'none', animation: 'twbscan 9s linear infinite' }} />

      <div className="tactical-map-corner-bracket-tl" style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-tr" style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-bl" style={{ position: 'absolute', bottom: 8, left: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="tactical-map-corner-bracket-br" style={{ position: 'absolute', bottom: 8, right: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />

      <div className="tactical-map-legend" style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(8,13,14,.82)', border: '1px solid var(--hairline-mid)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
        {legendMode === 'AFFILIATION' ? (
          <>
            <div className="tactical-map-legend-title" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 1 }}>TRACK AFFILIATION</div>
            <div className="tactical-map-legend-row-hostile" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-hostile" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--red)', transform: 'rotate(45deg)' }} />
              <span className="tactical-map-legend-label-hostile" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>HOSTILE</span>
            </div>
            <div className="tactical-map-legend-row-unknown" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-unknown" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--yellow)' }} />
              <span className="tactical-map-legend-label-unknown" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>UNKNOWN</span>
            </div>
            <div className="tactical-map-legend-row-friendly" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-friendly" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--cyan)', borderRadius: '50%' }} />
              <span className="tactical-map-legend-label-friendly" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>FRIENDLY</span>
            </div>
            <div className="tactical-map-legend-row-neutral" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="tactical-map-legend-swatch-neutral" style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--green)' }} />
              <span className="tactical-map-legend-label-neutral" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>NEUTRAL / NSL</span>
            </div>
          </>
        ) : (
          <>
            <div className="tactical-map-legend-title" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 1 }}>OOB SYMBOLOGY</div>
            {OOB_LEGEND_ROWS.map((row) => {
              const meta = statusMeta(row.status);
              return (
                <div key={row.status} className="tactical-map-legend-row-oob" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    className="tactical-map-legend-swatch-oob"
                    style={{
                      width: 10,
                      height: 10,
                      background: '#0c1416',
                      border: `1.5px ${meta.dash ? 'dashed' : 'solid'} ${meta.color}`,
                      transform: 'rotate(45deg)',
                      opacity: meta.opacity,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {row.glyph ? (
                      <span className="tactical-map-legend-swatch-oob-glyph" style={{ transform: 'rotate(-45deg)', fontSize: 7, lineHeight: 1, color: meta.color, fontWeight: 700 }}>{row.glyph}</span>
                    ) : (
                      <span className="tactical-map-legend-swatch-oob-dot" style={{ width: 2, height: 2, borderRadius: '50%', background: meta.color }} />
                    )}
                  </span>
                  <span className="tactical-map-legend-label-oob" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>{meta.label}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="tactical-map-right-hud" style={{ position: 'absolute', right: 14, top: 53, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          className="tactical-map-zoom-indicator"
          style={{
            textAlign: 'center',
            padding: '4px 10px',
            fontFamily: 'var(--font-display)',
            fontSize: 9.5,
            letterSpacing: '.1em',
            fontWeight: 600,
            color: 'var(--ink-mute)',
            border: '1px solid var(--hairline-mid)',
            background: 'rgba(8,13,14,.82)',
          }}
        >
          ZOOM {mapRef.current?.getView().getZoom()?.toFixed(1) ?? '—'}
        </div>

        {lookAngleDeg != null && (
          <div
            className="tactical-map-look-angle-indicator"
            title="Look angle from nadir — 0° is straight down, 90° is level with the horizon"
            style={{
              textAlign: 'center',
              padding: '4px 10px',
              fontFamily: 'var(--font-display)',
              fontSize: 9.5,
              letterSpacing: '.1em',
              fontWeight: 600,
              color: 'var(--ink-mute)',
              border: '1px solid var(--hairline-mid)',
              background: 'rgba(8,13,14,.82)',
            }}
          >
            LOOK {Math.round(lookAngleDeg)}°
          </div>
        )}

        <StylePicker />
      </div>
    </div>
  );
}

import express from 'express';
import { createServer } from 'node:http';
import { getState, initStore } from './store.js';
import { attachWs } from './ws.js';
import { tick } from './sim.js';
import { startLiveSync } from './liveSync.js';
import { createDrawnShape, deleteDrawnShape, getReferenceImage, listDrawnShapes, updateDrawnShapeGeometry, type DrawnShapeKind } from './drawnShapes.js';
import { fetchGoogleStaticMap } from './googleStaticMap.js';
import { countHistoryFeatures, HistoryQueryError, queryHistoryFeatures, validateFilter } from './historyQuery.js';
import { startKafkaHistoryConsumer } from './kafkaHistoryConsumer.js';

async function main() {
  // Loads (and, on a fresh PostGIS volume, seeds) the live picture before
  // anything can read it — the HTTP route, the WS connection handler, and
  // the sim tick all assume `getState()` already has real data.
  await initStore();

  const app = express();
  // The default 100kb limit is well under a captured Google satellite
  // image's size (a 1280x1280 PNG as a base64 data URL routinely runs
  // several hundred KB to a few MB) — POST /api/drawn-shapes carries one
  // inline as `referenceImage`.
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/state', (_req, res) => {
    res.json(getState());
  });

  // User-drawn shapes (see drawnShapes.ts) — plain REST, independent of the
  // WebSocket action system, since this is reference/annotation data tied
  // to a layer+object pair rather than part of the live simulated picture.
  app.get('/api/drawn-shapes', async (req, res) => {
    const layerId = String(req.query.layerId ?? '');
    const objectId = String(req.query.objectId ?? '');
    if (!layerId || !objectId) {
      res.status(400).json({ error: 'layerId and objectId are required' });
      return;
    }
    res.json(await listDrawnShapes(layerId, objectId));
  });

  const DRAWN_SHAPE_KINDS: DrawnShapeKind[] = ['outline', 'reporting-point'];

  app.post('/api/drawn-shapes', async (req, res) => {
    const { name, layerId, objectId, objectLabel, kind, geometry, referenceImage, referenceImageExtent } = req.body ?? {};
    if (!name || !layerId || !objectId || !objectLabel || geometry?.type !== 'Polygon' || !DRAWN_SHAPE_KINDS.includes(kind)) {
      res.status(400).json({ error: `name, layerId, objectId, objectLabel, a Polygon geometry, and kind (one of ${DRAWN_SHAPE_KINDS.join(', ')}) are required` });
      return;
    }
    res.status(201).json(await createDrawnShape({ name, layerId, objectId, objectLabel, kind, geometry, referenceImage, referenceImageExtent }));
  });

  // Geometry-only edit — see DrawingToolManager.tsx's Saved Shapes list /
  // TacticalMap.tsx's Modify interaction, which is the only thing that
  // hits this route.
  app.patch('/api/drawn-shapes/:id', async (req, res) => {
    const { geometry } = req.body ?? {};
    if (geometry?.type !== 'Polygon') {
      res.status(400).json({ error: 'a Polygon geometry is required' });
      return;
    }
    const updated = await updateDrawnShapeGeometry(req.params.id, geometry);
    if (!updated) {
      res.status(404).json({ error: 'Shape not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/drawn-shapes/:id', async (req, res) => {
    await deleteDrawnShape(req.params.id);
    res.status(204).end();
  });

  // The captured reference image lives in its own route (see
  // drawnShapes.ts's header comment for why it's not a JSON field on the
  // main listing) — served as raw image bytes, not JSON.
  app.get('/api/drawn-shapes/:id/image', async (req, res) => {
    const image = await getReferenceImage(req.params.id);
    if (!image) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.send(image);
  });

  // Timelapse capability, Phase 2 (see historyQuery.ts, kafka/README.md,
  // geoserver/README.md's "Entity Track History" section) — turns a
  // structured filter into a GeoServer WFS query. Never accepts raw CQL
  // from the client; req.query is validated against a fixed whitelist
  // before it's anywhere near buildCqlFilter's string interpolation.
  // bbox arrives as bbox[west]=..&bbox[south]=..&bbox[east]=..&bbox[north]=..
  // (Express's default 'extended' query parser nests this into an object).
  app.get('/api/history/query/count', async (req, res) => {
    try {
      const filter = validateFilter(req.query as Record<string, unknown>);
      res.json({ count: await countHistoryFeatures(filter) });
    } catch (err) {
      if (err instanceof HistoryQueryError) {
        res.status(400).json({ error: err.message });
      } else {
        res.status(502).json({ error: err instanceof Error ? err.message : 'GeoServer query failed.' });
      }
    }
  });

  app.get('/api/history/query', async (req, res) => {
    try {
      const filter = validateFilter(req.query as Record<string, unknown>);
      const result = await queryHistoryFeatures(filter, { startIndex: req.query.startIndex, count: req.query.count });
      res.json(result);
    } catch (err) {
      if (err instanceof HistoryQueryError) {
        res.status(400).json({ error: err.message });
      } else {
        res.status(502).json({ error: err instanceof Error ? err.message : 'GeoServer query failed.' });
      }
    }
  });

  // Proxies the Google Static Maps API (see googleStaticMap.ts) so the
  // drawing tool's reference image is a real, exactly-georectified Google
  // image rather than an uploaded screenshot the user had to manually align
  // via landmark-matching. Kept server-side so GOOGLE_MAPS_API_KEY never
  // reaches the browser.
  app.get('/api/google-static-map', async (req, res) => {
    const lng = Number(req.query.lng);
    const lat = Number(req.query.lat);
    const zoom = Number(req.query.zoom);
    const size = Number(req.query.size ?? 640);
    const scale = Number(req.query.scale ?? 2);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) {
      res.status(400).json({ error: 'lng, lat, and zoom are required numbers' });
      return;
    }
    try {
      const { buffer, contentType } = await fetchGoogleStaticMap({ lng, lat, zoom, size, scale });
      res.setHeader('Content-Type', contentType);
      res.send(buffer);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to fetch Google Static Maps image.' });
    }
  });

  const server = createServer(app);
  attachWs(server);

  const PORT = Number(process.env.PORT) || 8799;
  server.listen(PORT, () => {
    console.log(`[meridian] server listening on http://localhost:${PORT}`);
  });

  setInterval(tick, 1000);

  // Two-way GeoServer integration: pick up edits made through WFS-T (or
  // any other direct write to the live-entity tables) and fold them into
  // the same live state the sim tick and every action handler update.
  startLiveSync();

  // Timelapse capability, Phase 1 — opt-in (see kafka/README.md): only
  // starts if the kafka/ stack is actually up, so `npm run dev` keeps
  // working unmodified for anyone who hasn't brought it up.
  if (process.env.KAFKA_HISTORY_ENABLED === 'true') {
    startKafkaHistoryConsumer();
  }
}

main().catch((err) => {
  console.error('[meridian] failed to start:', err);
  process.exit(1);
});

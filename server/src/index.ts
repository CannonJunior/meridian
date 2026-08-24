import express from 'express';
import { createServer } from 'node:http';
import { getState, initStore } from './store.js';
import { attachWs } from './ws.js';
import { tick } from './sim.js';
import { startLiveSync } from './liveSync.js';
import { createDrawnShape, deleteDrawnShape, listDrawnShapes } from './drawnShapes.js';

async function main() {
  // Loads (and, on a fresh PostGIS volume, seeds) the live picture before
  // anything can read it — the HTTP route, the WS connection handler, and
  // the sim tick all assume `getState()` already has real data.
  await initStore();

  const app = express();
  app.use(express.json());

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

  app.post('/api/drawn-shapes', async (req, res) => {
    const { name, layerId, objectId, objectLabel, geometry } = req.body ?? {};
    if (!name || !layerId || !objectId || !objectLabel || geometry?.type !== 'Polygon') {
      res.status(400).json({ error: 'name, layerId, objectId, objectLabel, and a Polygon geometry are required' });
      return;
    }
    res.status(201).json(await createDrawnShape({ name, layerId, objectId, objectLabel, geometry }));
  });

  app.delete('/api/drawn-shapes/:id', async (req, res) => {
    await deleteDrawnShape(req.params.id);
    res.status(204).end();
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
}

main().catch((err) => {
  console.error('[meridian] failed to start:', err);
  process.exit(1);
});

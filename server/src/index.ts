import express from 'express';
import { createServer } from 'node:http';
import { getState, initStore } from './store.js';
import { attachWs } from './ws.js';
import { tick } from './sim.js';

async function main() {
  // Loads (and, on a fresh PostGIS volume, seeds) the live picture before
  // anything can read it — the HTTP route, the WS connection handler, and
  // the sim tick all assume `getState()` already has real data.
  await initStore();

  const app = express();

  app.get('/api/state', (_req, res) => {
    res.json(getState());
  });

  const server = createServer(app);
  attachWs(server);

  const PORT = Number(process.env.PORT) || 8799;
  server.listen(PORT, () => {
    console.log(`[meridian] server listening on http://localhost:${PORT}`);
  });

  setInterval(tick, 1000);
}

main().catch((err) => {
  console.error('[meridian] failed to start:', err);
  process.exit(1);
});

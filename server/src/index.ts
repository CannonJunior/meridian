import express from 'express';
import { createServer } from 'node:http';
import { getState } from './store.js';
import { attachWs } from './ws.js';
import { tick } from './sim.js';

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

import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getState, subscribe } from './store.js';
import * as actions from './actions.js';
import type { ActionMessage, Approvals, State, View } from './types.js';

function broadcast(wss: WebSocketServer, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

// Only the top-level State keys that actually got a new reference this
// tick — sim.ts/actions.ts only reassign the keys they touch, so a key
// that isn't in here is, by construction, identical to what was already
// broadcast last time. This is what turns "send the whole live picture
// every second, to every client" into "send whatever actually moved" —
// on a typical tick that's `t` and `targets` (sim.ts always produces a
// fresh targets array via .map(), even when no individual target
// changed), not the other five-plus arrays that usually don't.
function diffState(next: State, prev: State): Partial<State> {
  const patch: Partial<State> = {};
  for (const key of Object.keys(next) as (keyof State)[]) {
    if (next[key] !== prev[key]) {
      (patch as Record<string, unknown>)[key] = next[key];
    }
  }
  return patch;
}

function dispatch(msg: ActionMessage): void {
  switch (msg.name) {
    case 'selectTarget':
      actions.selectTarget(msg.args.id);
      break;
    case 'setView':
      actions.setView(msg.args.view as View);
      break;
    case 'cycleRoe':
      actions.cycleRoe();
      break;
    case 'retaskSensor':
      actions.retaskSensor(msg.args.sensorId);
      break;
    case 'assignEffector':
      actions.assignEffector(msg.args.effectorId);
      break;
    case 'toggleAppr':
      actions.toggleAppr(msg.args.key as keyof Approvals, msg.args.id);
      break;
    case 'setPriority':
      actions.setPriority(msg.args.id, msg.args.pri);
      break;
    case 'engage':
      actions.engage();
      break;
    case 'setStage':
      actions.setStage(msg.args.id, msg.args.stageIdx);
      break;
    case 'advanceStage':
      actions.advanceStage();
      break;
    case 'retreatStage':
      actions.retreatStage();
      break;
  }
}

export function attachWs(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', payload: getState() }));

    socket.on('message', (raw) => {
      let msg: ActionMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'action') dispatch(msg);
    });
  });

  // Full state only on initial connect (above); every subsequent broadcast
  // is a delta. The client's setFromServer (store.ts) already merges a
  // Partial<State> into its own copy, so it doesn't need to change shape
  // to receive one — only its declared type does.
  subscribe((next, prev) => {
    const patch = diffState(next, prev);
    if (Object.keys(patch).length > 0) broadcast(wss, { type: 'state', payload: patch });
  });

  return wss;
}

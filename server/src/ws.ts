import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getState, subscribe } from './store.js';
import * as actions from './actions.js';
import type { ActionMessage, Approvals, View } from './types.js';

function broadcast(wss: WebSocketServer, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
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

  subscribe((state) => broadcast(wss, { type: 'state', payload: state }));

  return wss;
}

import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getState, subscribe } from './store.js';
import * as actions from './actions.js';
import { onNotificationReady, replayNotificationsSince } from './notifications.js';
import type { ActionMessage, Approvals, State, View } from './types.js';

// Identity + liveness tracking for each open socket. Before the
// notification system, this app had no concept of "which connection is
// this" at all — confirmed by the design plan's codebase research (zero
// auth/session anywhere). clientId is self-declared via a 'hello' message,
// not authenticated — acceptable only for a closed/trusted deployment (this
// app's "SIMULATION — TRAINING USE ONLY" framing), and that assumption is
// explicitly not this file's to make unilaterally; see the plan's identity
// section. isAlive/backpressureTicks back the heartbeat and backpressure
// guards below.
interface ConnectionInfo {
  clientId: string | null;
  isAlive: boolean;
  backpressureTicks: number;
}
const connections = new Map<WebSocket, ConnectionInfo>();

// Fixed-length UUID only — rejects malformed/oversized/guessed-collision
// values outright rather than trusting whatever a client sends (a red-team
// finding against the draft plan's unvalidated clientId).
const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A trivial socket-exhaustion vector that predates this feature — fixed
// alongside it since this file is already being touched for connection
// handling (a red-team-flagged pre-existing gap).
const MAX_CONNECTIONS_PER_IP = 50;
const ipCounts = new Map<string, number>();

// ws.send() has no built-in flow control — bufferedAmount grows unbounded
// on a client that isn't draining, a documented path to memory exhaustion
// (the sharpest WS-specific risk in the design plan's literature review).
// A socket over threshold for BACKPRESSURE_TICK_LIMIT consecutive guarded
// sends gets terminated rather than left to accumulate indefinitely; one
// over-threshold send is just skipped (better to drop one stale diff than
// pile it onto an already-full buffer).
const BACKPRESSURE_BYTES_THRESHOLD = 1_000_000;
const BACKPRESSURE_TICK_LIMIT = 5;

const HEARTBEAT_INTERVAL_MS = 30_000;

function sendGuarded(client: WebSocket, data: string): void {
  if (client.readyState !== WebSocket.OPEN) return;
  const info = connections.get(client);
  if (client.bufferedAmount > BACKPRESSURE_BYTES_THRESHOLD) {
    if (info) {
      info.backpressureTicks += 1;
      if (info.backpressureTicks > BACKPRESSURE_TICK_LIMIT) {
        client.terminate();
        return;
      }
    }
    return;
  }
  if (info) info.backpressureTicks = 0;
  client.send(data);
}

function broadcast(wss: WebSocketServer, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    sendGuarded(client, data);
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

const APPROVAL_KEYS: (keyof Approvals)[] = ['pid', 'jag', 'strike', 'tea'];
const VIEWS: View[] = ['MAP', 'BOARD'];

// Runtime shape validation for incoming action messages — the counterpart
// to handleHello's CLIENT_ID_RE check just above it. Without this, the raw
// `JSON.parse(...) as ActionMessage | {hello}` cast in the 'message'
// handler was the only "type check" an action message ever got: a
// malformed args value (a numeric `id` where a string is expected, a
// non-numeric `stageIdx`) would reach actions.ts with a false type
// guarantee, and — since actions.ts's own guards assume the declared
// types rather than re-checking them (e.g. setStage's `stageIdx < 0`
// comparison silently does the wrong thing for a non-number) — could
// corrupt live state rather than safely no-op. Checks exactly the shape
// each ActionMessage union member declares, nothing stricter: this
// doesn't check that `id` names a real target, the same "let downstream
// code no-op on an unknown id" contract actions.ts's own functions
// already rely on. Returns null (dropped silently, like a JSON parse
// failure) rather than throwing, since a malformed message from a
// self-declared, unauthenticated client is an expected occurrence to
// tolerate, not a bug to surface.
function validateActionMessage(raw: unknown): ActionMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as { type?: unknown; name?: unknown; args?: unknown };
  if (msg.type !== 'action' || typeof msg.name !== 'string') return null;
  if (typeof msg.args !== 'object' || msg.args === null) return null;
  const a = msg.args as Record<string, unknown>;

  switch (msg.name) {
    case 'selectTarget':
      return typeof a.id === 'string' ? { type: 'action', name: 'selectTarget', args: { id: a.id } } : null;
    case 'setView':
      return typeof a.view === 'string' && VIEWS.includes(a.view as View) ? { type: 'action', name: 'setView', args: { view: a.view as View } } : null;
    case 'cycleRoe':
      return { type: 'action', name: 'cycleRoe', args: {} };
    case 'retaskSensor':
      return typeof a.sensorId === 'string' ? { type: 'action', name: 'retaskSensor', args: { sensorId: a.sensorId } } : null;
    case 'assignEffector':
      return typeof a.effectorId === 'string' ? { type: 'action', name: 'assignEffector', args: { effectorId: a.effectorId } } : null;
    case 'toggleAppr':
      return typeof a.key === 'string' && APPROVAL_KEYS.includes(a.key as keyof Approvals) && (a.id === undefined || typeof a.id === 'string')
        ? { type: 'action', name: 'toggleAppr', args: { key: a.key as keyof Approvals, id: a.id as string | undefined } }
        : null;
    case 'setPriority':
      return typeof a.id === 'string' && (a.pri === null || typeof a.pri === 'number')
        ? { type: 'action', name: 'setPriority', args: { id: a.id, pri: a.pri as number | null } }
        : null;
    case 'engage':
      return { type: 'action', name: 'engage', args: {} };
    case 'setStage':
      return typeof a.id === 'string' && typeof a.stageIdx === 'number'
        ? { type: 'action', name: 'setStage', args: { id: a.id, stageIdx: a.stageIdx } }
        : null;
    case 'advanceStage':
      return { type: 'action', name: 'advanceStage', args: {} };
    case 'retreatStage':
      return { type: 'action', name: 'retreatStage', args: {} };
    default:
      return null;
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

function handleHello(socket: WebSocket, msg: { clientId?: unknown; lastSeenNotificationId?: unknown }): void {
  const info = connections.get(socket);
  if (!info) return;
  const clientId = typeof msg.clientId === 'string' && CLIENT_ID_RE.test(msg.clientId) ? msg.clientId : null;
  if (!clientId) {
    console.error('[meridian] ws: rejected malformed hello clientId');
    return;
  }
  info.clientId = clientId;

  // Reconnect catch-up — a fresh full 'state' snapshot already covers the
  // live tactical picture (sent on every connection below); this covers
  // whatever notifications were missed while this clientId was offline.
  const sinceId = typeof msg.lastSeenNotificationId === 'string' ? msg.lastSeenNotificationId : null;
  replayNotificationsSince(clientId, sinceId)
    .then((events) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      for (const event of events) sendGuarded(socket, JSON.stringify({ type: 'notification', event }));
    })
    .catch((err) => console.error('[meridian] ws: notification replay failed:', err));
}

export function attachWs(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    // Small JSON payloads — per-socket zlib compression state (commonly
    // 30-150KB per direction) costs more at thousands of connections than
    // it saves on messages this size. Left on, the "50-100K sockets per
    // process" scaling figure this app's notification design leaned on
    // doesn't actually hold (a red-team finding against the draft plan).
    perMessageDeflate: false,
    // Guards against a malformed/oversized hello or action payload.
    maxPayload: 64 * 1024,
    verifyClient: (info, cb) => {
      const ip = info.req.socket.remoteAddress ?? 'unknown';
      if ((ipCounts.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
        cb(false, 429, 'Too Many Connections');
        return;
      }
      cb(true);
    },
  });

  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress ?? 'unknown';
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    connections.set(socket, { clientId: null, isAlive: true, backpressureTicks: 0 });

    function cleanup(): void {
      // Idempotent — 'error' is typically followed by 'close', and this
      // must tolerate running twice without double-decrementing ipCounts.
      if (!connections.has(socket)) return;
      connections.delete(socket);
      const count = (ipCounts.get(ip) ?? 1) - 1;
      if (count <= 0) ipCounts.delete(ip);
      else ipCounts.set(ip, count);
    }
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.on('pong', () => {
      const info = connections.get(socket);
      if (info) info.isAlive = true;
    });

    sendGuarded(socket, JSON.stringify({ type: 'state', payload: getState() }));

    socket.on('message', (raw) => {
      let msg: ActionMessage | { type: 'hello'; clientId?: unknown; lastSeenNotificationId?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'hello') {
        handleHello(socket, msg);
        return;
      }
      if (msg?.type === 'action') {
        const validated = validateActionMessage(msg);
        if (validated) dispatch(validated);
      }
    });
  });

  // Detects dead connections (closed lid, dropped network) that never send
  // a close frame — without this they leak as phantom open sockets
  // indefinitely. Standard isAlive/ping-pong idiom: terminate whatever
  // didn't answer the *previous* ping before sending the next one.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const info = connections.get(client);
      if (!info) continue;
      if (!info.isAlive) {
        client.terminate();
        continue;
      }
      info.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  // Full state only on initial connect (above); every subsequent broadcast
  // is a delta. The client's setFromServer (store.ts) already merges a
  // Partial<State> into its own copy, so it doesn't need to change shape
  // to receive one — only its declared type does.
  subscribe((next, prev) => {
    const patch = diffState(next, prev);
    if (Object.keys(patch).length > 0) broadcast(wss, { type: 'state', payload: patch });
  });

  // Delivers a (possibly batched — see notifications.ts) event to every
  // socket it's actually addressed to: every open socket for 'broadcast',
  // or every socket whose declared clientId matches for 'client' scope —
  // deliberately every matching socket, not just one, since multi-tab is
  // normal and all tabs should see it.
  onNotificationReady((event) => {
    const data = JSON.stringify({ type: 'notification', event });
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (event.scope === 'broadcast') {
        sendGuarded(client, data);
        continue;
      }
      const info = connections.get(client);
      if (info?.clientId === event.targetId) sendGuarded(client, data);
    }
  });

  return wss;
}

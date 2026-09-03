import { useStore } from './store';
import type { AppNotification } from './store';
import type { State } from './types';

let socket: WebSocket | null = null;
let retryDelay = 500;
const MAX_RETRY_DELAY = 5000;

const CLIENT_ID_KEY = 'meridian.clientId';
const LAST_SEEN_NOTIFICATION_KEY = 'meridian.lastSeenNotificationId';

// Self-declared identity for the notification system's targeted delivery
// (server/src/ws.ts's 'hello' handshake) — not authentication, just "which
// browser is this" so a 'client'-scope notification reaches the right
// socket(s). Generated once, persisted, stable across reloads/reconnects.
function getOrCreateClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

// Persisted in localStorage rather than store state, because it must
// survive a full page reload, not just a WS reconnect within one session —
// otherwise a reload would make the server replay notifications this
// browser already saw last time it connected.
function getLastSeenNotificationId(): string | null {
  return localStorage.getItem(LAST_SEEN_NOTIFICATION_KEY);
}
function setLastSeenNotificationId(id: string): void {
  localStorage.setItem(LAST_SEEN_NOTIFICATION_KEY, id);
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function connect(): void {
  if (socket) return;
  socket = new WebSocket(wsUrl());

  socket.onopen = () => {
    retryDelay = 500;
    useStore.getState().setConnected(true);
    // Declares identity and asks the server to replay anything published
    // since this browser was last connected — see server/src/ws.ts's
    // handleHello / notifications.ts's replayNotificationsSince.
    socket?.send(JSON.stringify({ type: 'hello', clientId: getOrCreateClientId(), lastSeenNotificationId: getLastSeenNotificationId() }));
  };

  socket.onclose = () => {
    useStore.getState().setConnected(false);
    socket = null;
    // Full jitter, not just a capped exponential ramp — an unjittered
    // backoff means every client that disconnected around the same moment
    // (a server restart, a network blip) reconnects in the same
    // synchronized window. That's the thundering-herd risk the
    // notification system's red team flagged against the reconnect-replay
    // path (many simultaneous replay queries hitting the same DB pool);
    // jitter spreads the reconnect wave out in time instead.
    const delay = Math.random() * retryDelay;
    setTimeout(connect, delay);
    retryDelay = Math.min(retryDelay * 1.6, MAX_RETRY_DELAY);
  };

  socket.onerror = () => {
    socket?.close();
  };

  socket.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(ev.data as string) as { type: string; payload?: Partial<State>; event?: AppNotification };
    // Full State on initial connect, a Partial<State> delta on every
    // subsequent tick (server/src/ws.ts) — setFromServer merges whichever
    // it gets the same way either way.
    if (msg.type === 'state' && msg.payload) useStore.getState().setFromServer(msg.payload);
    if (msg.type === 'notification' && msg.event) {
      setLastSeenNotificationId(msg.event.id);
      useStore.getState().receiveNotification(msg.event);
    }
  };
}

export function sendAction(name: string, args: Record<string, unknown> = {}): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'action', name, args }));
  }
}

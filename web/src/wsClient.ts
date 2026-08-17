import { useStore } from './store';
import type { State } from './types';

let socket: WebSocket | null = null;
let retryDelay = 500;

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
  };

  socket.onclose = () => {
    useStore.getState().setConnected(false);
    socket = null;
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.6, 5000);
  };

  socket.onerror = () => {
    socket?.close();
  };

  socket.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(ev.data as string) as { type: string; payload: State };
    if (msg.type === 'state') useStore.getState().setFromServer(msg.payload);
  };
}

export function sendAction(name: string, args: Record<string, unknown> = {}): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'action', name, args }));
  }
}

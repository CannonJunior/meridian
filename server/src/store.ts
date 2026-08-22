import { loadState, persistTick } from './db.js';
import type { State } from './types.js';

type Listener = (s: State) => void;

let state: State;
const listeners = new Set<Listener>();

// node-postgres is Promise-based (unlike the old better-sqlite3 backend),
// so the initial load has to be awaited explicitly at startup — see
// index.ts, which awaits this before accepting any connections or starting
// the sim tick. Nothing in this module reads `state` before that.
export async function initStore(): Promise<void> {
  state = await loadState();
}

export function getState(): State {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Synchronous from the caller's perspective, same as it always was:
// in-memory state updates and listener notification (the WebSocket
// broadcast) happen immediately, so a tick reaches connected clients
// without waiting on a database round-trip. persistTick's Promise is
// intentionally not awaited — it writes through in the background, and a
// failed write is logged rather than allowed to break the live picture.
export function update(fn: (s: State) => State): State {
  const prev = state;
  const next = fn(prev);
  if (next !== state) {
    state = next;
    persistTick(next, prev).catch((err) => console.error('[meridian] persistTick failed:', err));
    for (const l of listeners) l(state);
  }
  return state;
}

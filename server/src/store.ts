import { loadState, persistTick } from './db.js';
import type { State } from './types.js';

// Passed both states (not just the new one) so a listener can diff for
// itself which top-level keys actually changed — see ws.ts's broadcast,
// the one real consumer of this today.
type Listener = (next: State, prev: State) => void;

let state: State;
const listeners = new Set<Listener>();

// sim.ts's tick() clones and bumps decay/trkQ for every active (stage<4)
// target on every single tick, purely for cosmetic sensor-quality jitter —
// which means `next.targets !== prev.targets` (and, for practical purposes,
// every active target's own row) is true every tick, forever, regardless of
// whether anything durability-worthy actually happened. Persisting that to
// Postgres on every tick was one UPDATE per active target, per second,
// continuously. None of that cosmetic churn needs to survive a restart with
// sub-multi-second fidelity, so persistTick is throttled to run at most
// once every PERSIST_EVERY_N_TICKS ticks — the in-memory `state` update and
// the WS broadcast below stay untouched, so the live picture other clients
// see is still exactly per-tick; only the DB write is coalesced. A new log
// entry (a real event — BDA, an operator action, ...) always forces an
// immediate flush regardless of the counter, so anything narratively
// meaningful is never left un-persisted for more than an instant.
const PERSIST_EVERY_N_TICKS = 3;
let ticksSincePersist = 0;

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
    ticksSincePersist++;
    if (ticksSincePersist >= PERSIST_EVERY_N_TICKS || next.log !== prev.log) {
      ticksSincePersist = 0;
      persistTick(next, prev).catch((err) => console.error('[meridian] persistTick failed:', err));
    }
    for (const l of listeners) l(state, prev);
  }
  return state;
}

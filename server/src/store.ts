import { loadState, persistTick } from './db.js';
import type { State } from './types.js';

type Listener = (s: State) => void;

let state: State = loadState();
const listeners = new Set<Listener>();

export function getState(): State {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(fn: (s: State) => State): State {
  const next = fn(state);
  if (next !== state) {
    state = next;
    persistTick(state);
    for (const l of listeners) l(state);
  }
  return state;
}

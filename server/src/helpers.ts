import { STAGES } from './types.js';
import type { State, Target } from './types.js';

export function sensorName(s: State, id: string | null | undefined): string {
  const sn = s.sensors.find((x) => x.id === id);
  return sn ? sn.callsign : '—';
}

export function effName(s: State, id: string | null | undefined): string {
  const e = s.effectors.find((x) => x.id === id);
  return e ? e.callsign : '—';
}

export function isEngageReady(sel: Target | undefined | null): boolean {
  if (!sel) return false;
  if (sel.stage === 4) return false;
  return sel.stage === 3 && !!sel.effector && sel.appr.tea && sel.appr.jag && sel.appr.pid && sel.appr.strike;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export { STAGES };

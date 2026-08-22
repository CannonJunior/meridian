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

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// One sim tick is 1 real second (see index.ts's setInterval(tick, 1000)),
// but real speeds in knots over a real AO would then take hours to cover
// any visible distance. SIM_MINUTES_PER_TICK fast-forwards the simulated
// clock — a standard wargaming technique — without touching the physics
// itself: course/speed/distance are all still real, just advanced through
// simulated time faster than real time passes.
//
// Calibrated (not a round guess) to roughly match how long the old
// abstract-grid sim took to cross the AO at a representative speed: an
// 18kt target crossing the ~45nm-wide AO took ~1680 ticks (28 real
// minutes) under the old `x + 0.1*(speed/30)` formula. Solving
// 60*45/(18*M) = 1680 for M gives ~0.089; 0.1 (a 6x real-time clock) is
// the nearest clean value, ticks 18kt across the AO in ~25 minutes. An
// earlier value of 60 here was a units error (worked out to crossing the
// entire AO in ~2.5 seconds instead) — verified against a live run before
// landing on this one.
export const SIM_MINUTES_PER_TICK = 0.1;

// Destination point given a start position, true bearing, and distance —
// the standard spherical "direct geodesic" formula. Used by sim.ts to move
// airborne/surface targets each tick in real units instead of the old
// abstract-grid arithmetic.
export function destinationPoint(lng: number, lat: number, bearingDeg: number, distanceNm: number): { lng: number; lat: number } {
  const dr = distanceNm / EARTH_RADIUS_NM;
  const br = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(dr) + Math.cos(phi1) * Math.sin(dr) * Math.cos(br));
  const lambda2 = lambda1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(phi1), Math.cos(dr) - Math.sin(phi1) * Math.sin(phi2));

  return { lng: toDeg(lambda2), lat: toDeg(phi2) };
}

// Great-circle distance between two points, in nautical miles (haversine).
export function distanceNm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { STAGES };

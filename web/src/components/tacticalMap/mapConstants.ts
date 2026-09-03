// Fixed reference data for the tactical map — computed once at module
// scope rather than per-render, and shared between TacticalMap.tsx (the
// OOB legend) and overlays.tsx (the ownship/bullseye rings). Split out of
// TacticalMap.tsx itself (see this repo's maintainability audit).
import { geodesicCircleLngLat } from '../../selectors';
import type { ObjectStatus } from '../../assets/oob';

// Fixed reference points on the picture, not tied to any live entity — real
// lng/lat equivalent to the old abstract grid's (12,86) and (50,46), see
// seed.ts's header comment for how every other fixed seed position was
// converted the same way. Their geodesic rings never move, so — unlike
// every other shape overlays.tsx's MapOverlaySvg draws — the lng/lat point
// set is computed once here at module scope rather than recomputed every
// render (each ring is 72 destinationPoint/trig calls; 7 rings, every
// second, forever, for geometry that's provably static was pure waste).
export const OWNSHIP_LNG_LAT: [number, number] = [-5.942, 35.82];
export const BULLSEYE_LNG_LAT: [number, number] = [-5.6, 36.02];
export const OWNSHIP_RINGS_LNGLAT = [10, 20, 30, 40].map((nm) => ({ nm, points: geodesicCircleLngLat(OWNSHIP_LNG_LAT[0], OWNSHIP_LNG_LAT[1], nm) }));
export const BULLSEYE_RINGS_LNGLAT = [5, 10, 15].map((nm) => ({ nm, points: geodesicCircleLngLat(BULLSEYE_LNG_LAT[0], BULLSEYE_LNG_LAT[1], nm) }));

export const OOB_LEGEND_ROWS: { status: ObjectStatus; glyph?: string }[] = [
  { status: 'VISIBLE' },
  { status: 'UNIDENTIFIED', glyph: '?' },
  { status: 'MISIDENTIFIED', glyph: '?' },
  { status: 'OBSCURED' },
  { status: 'UNKNOWN' },
  { status: 'DESTROYED', glyph: '╳' },
];

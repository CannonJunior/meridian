import { affColor, altBand } from './selectors';
import type { Sensor, Target } from './types';

// Pure data-prep helpers for the ol-cesium 3D perspective mode (altitude
// display plan Plan C / Phase 3). Deliberately free of any 'cesium'/'olcs'
// import — those are large and dynamically imported only once the user
// actually toggles 3D on (see TacticalMap.tsx) — so importing this module
// at the top of TacticalMap.tsx costs nothing extra in the 2D-only path.

// '3D' is the free-camera Cesium globe; '2.5D' is the same globe with a
// fixed look angle and a locked heading — a standardized oblique view meant
// to stay recognizable rather than let the camera wander into a picture
// nobody can read. See MODE_25D_LOOK_ANGLE_DEG and the tilt/rotate lockout
// in TacticalMap.tsx's 3D-init effect.
export type MapMode = '2D' | '3D' | '2.5D';

// Look angle from nadir (0° = straight down, 90° = level with the horizon —
// same convention as olcs's own Camera.tilt_ and this app's LOOK indicator).
export const MODE_25D_LOOK_ANGLE_DEG = 60;

// A UAS at ~19,000ft inside a ~50km-wide AO is a barely-perceptible bump at
// true scale — the altitude plan's Section 06 calls this exaggeration
// "mandatory, not optional." Applied uniformly to every airborne entity's
// real altitude so relative comparisons between them stay honest even
// though the absolute height off the ground plane is not to scale.
export const ALTITUDE_EXAGGERATION = 3;
const FT_TO_M = 0.3048;

export function exaggeratedMeters(altFt: number): number {
  return altFt * FT_TO_M * ALTITUDE_EXAGGERATION;
}

// 2.5D's alternative to the linear exaggeration above: a log scale keeps a
// 60,000ft ISR platform from towering over everything else in the picture
// while still giving the much more common low-altitude tactical traffic
// (a few hundred to a few thousand feet) room to visually separate from the
// ground — the opposite trade-off from the linear scale, which is honest
// about relative altitude but lets one high-flyer dominate the view.
const LOG_SCALE_UNIT_M = 1500;
const LOG_SCALE_REF_FT = 500;

export function logAltitudeMeters(altFt: number): number {
  return LOG_SCALE_UNIT_M * Math.log2(1 + Math.max(altFt, 0) / LOG_SCALE_REF_FT);
}

export type AirborneKind = 'target' | 'sensor';

export interface AirborneEntity {
  id: string;
  kind: AirborneKind;
  label: string;
  lng: number;
  lat: number;
  altFt: number;
  color: string;
}

// Same "airborne = non-null altFt" filter TrackSymbol (Plan A) and the
// reverted VSD both used — kept here as the one place that decides it, so
// the 3D layer and the map tag stay in sync. Effectors also carry altFt
// (Phase 0 / Section 03) but have no lng/lat at all in this app's data
// model — they're never placed on the 2D map either — so there's nowhere
// to put a 3D marker for one; only targets and sensors are positionable.
//
// Color: plain 3D colors targets by affiliation (hostility is the salient
// fact there) and sensors by altitude band (all friendly, so hostility
// would be a no-op). 2.5D instead colors everything by altitude band — the
// same bucketed-not-linear categorization TrackSymbol's 2D altitude tag
// uses (selectors.ts's altBand) — since the standardized view's whole point
// is reading altitude structure across the whole picture at a glance.
export function buildAirborneEntities(targets: Target[], sensors: Sensor[], mode: MapMode = '3D'): AirborneEntity[] {
  const out: AirborneEntity[] = [];
  for (const t of targets) {
    if (t.altFt == null || t.stage >= 4) continue;
    const color = mode === '2.5D' ? altBand(t.altFt).color : affColor(t.aff);
    out.push({ id: t.id, kind: 'target', label: `${t.id.slice(1)} ${t.name}`, lng: t.lng, lat: t.lat, altFt: t.altFt, color });
  }
  for (const s of sensors) {
    if (s.altFt == null) continue;
    out.push({ id: s.id, kind: 'sensor', label: s.callsign, lng: s.lng, lat: s.lat, altFt: s.altFt, color: altBand(s.altFt).color });
  }
  return out;
}

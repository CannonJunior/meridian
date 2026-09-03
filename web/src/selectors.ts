import type { CSSProperties } from 'react';
import { forward as mgrsForward } from 'mgrs';
import { STAGES } from './types';
import type { Affiliation, AtoDay, Category, Domain, Effector, FriendlyUnit, Sensor, Sortie, SortieStatus, State, Target, Threat } from './types';

// Pure derived-value helpers, ported 1:1 from the `Component` class methods
// in Meridian Fires C2.dc.html (renderVals/renderMap section, lines ~920-1113).

// Raw hex duplicate of theme.css's :root palette — predates theme.css's
// CSS custom properties (this whole file was ported 1:1 from the original
// Meridian Fires C2.dc.html, back when there was no :root to reference;
// see this file's header). Nothing generates one from the other, so they
// can drift: `violet` here was `#c77dff` against theme.css's `--violet:
// #b98bff` until this comment was added — fixed to match, but there's
// nothing stopping the next new color from diverging the same way.
// Prefer `var(--x)` directly over adding a new key here — it works
// identically in every context this app actually renders through (DOM
// style objects and SVG presentation attributes both resolve CSS custom
// properties; see overlays.tsx's TrackSymbol, which already does this).
// `C` is kept only because most of this file's existing color-computation
// functions (threatColor, confColor, decayInfo, DOMAIN_META, and the
// several dozen other call sites across components/) already return one of
// these values — not because any of them need a literal hex string for a
// canvas/non-DOM context. Retiring `C` for good would mean migrating all
// of those, which is a larger, standalone cleanup, not a one-file fix.
export const C = {
  amber: '#ffab38',
  red: '#ff5a47',
  redCrit: '#ff3b30',
  cyan: '#3fd2e6',
  blue: '#5b9dff',
  yellow: '#ffd23f',
  green: '#5fe39a',
  violet: '#b98bff',
  ink: '#dfe9e7',
  dim: '#7a8d8a',
  faint: '#46554f',
};

export function affColor(a: Affiliation): string {
  return a === 'HOS' ? C.red : a === 'UNK' ? C.yellow : a === 'FRD' ? C.cyan : C.green;
}
export function affFull(a: Affiliation): string {
  return a === 'HOS' ? 'HOSTILE' : a === 'UNK' ? 'UNKNOWN' : a === 'FRD' ? 'FRIENDLY' : 'NEUTRAL';
}
export function affShapeStyle(a: Affiliation): CSSProperties {
  if (a === 'HOS') return { transform: 'rotate(45deg)' };
  if (a === 'FRD') return { borderRadius: '50%' };
  return {};
}
export function threatColor(x: Threat): string {
  return x === 'CRIT' ? C.redCrit : x === 'HIGH' ? C.red : x === 'MED' ? C.amber : C.yellow;
}
export function confColor(c: number): string {
  return c >= 85 ? C.green : c >= 65 ? C.amber : C.red;
}
export function decayInfo(d: number): { color: string; label: string } {
  if (d < 15) return { color: C.green, label: `FRESH ${d}s` };
  if (d < 35) return { color: C.amber, label: `AGING ${d}s` };
  return { color: C.red, label: `STALE ${d}s` };
}

// TCAS/MIL-STD-2525D-style altitude tag + a deliberately-not-to-scale stem
// length — bucketed into bands, not linear, so the boring middle of the
// range gets compressed and a threshold crossing (e.g. climbing above
// 30,000ft) gets a visibly different band rather than a barely-different
// pixel offset. See the altitude display plan's Plan A (Section 04).
export interface AltBand {
  label: string;
  color: string;
  stemLen: number;
}
export function altBand(altFt: number): AltBand {
  const label = altFt >= 18000 ? `FL${Math.round(altFt / 100)}` : `${Math.round(altFt).toLocaleString()} FT`;
  if (altFt < 5000) return { label, color: C.amber, stemLen: 8 };
  if (altFt < 15000) return { label, color: C.cyan, stemLen: 16 };
  if (altFt < 30000) return { label, color: C.blue, stemLen: 24 };
  return { label, color: C.green, stemLen: 32 };
}

const CAT_FULL: Record<Category, string> = {
  TEL: 'BALLISTIC MISSILE / TEL',
  SAM: 'SURFACE-AIR / AIR DEFENSE',
  C2: 'COMMAND & CONTROL',
  SHIP: 'SURFACE COMBATANT',
  BOAT: 'FAST ATTACK CRAFT',
  RADAR: 'EARLY-WARNING RADAR',
  UAS: 'UNMANNED AIR SYSTEM',
  TROOP: 'GROUND FORCES',
  EMIT: 'UNRESOLVED EMITTER',
};
export function catFull(c: Category): string {
  return CAT_FULL[c] || c;
}

const UNIT_FOR: Record<Category, string> = {
  TEL: '7th Rocket Bde · 2 Bn',
  SAM: '112th ADA Regiment',
  C2: 'Sector Air Ops Centre',
  SHIP: 'Eastern Surface Action Grp',
  BOAT: '18th FAC Squadron',
  RADAR: 'IADS EW Company',
  UAS: 'UAV Detachment (unk)',
  TROOP: 'Mech Inf Brigade',
  EMIT: 'Unattributed network',
};
export function unitFor(t: Target): string {
  return UNIT_FOR[t.cat] || 'Unknown formation';
}

// Domain classification (LayerManager.tsx's per-domain checkboxes, the
// domain-segmented Kafka topics — see kafka/README.md's "Live Domain
// Tracks" section, and server/src/domain.ts, which mirrors this file
// exactly for the server-side producer). Targets carry a Category, which
// maps to a domain directly; sensors and friendly units carry no such
// field, so they're classified by platform-name keyword instead — fixture-
// specific but the only signal either type actually has today. A newly
// added platform this doesn't recognize falls through to GROUND, the most
// common default (infantry, ADA, static installations), rather than AIR or
// SEA, which would be a more visible wrong guess for something that isn't
// obviously either of those.
const CAT_DOMAIN: Record<Category, Domain> = {
  TEL: 'GROUND',
  SAM: 'GROUND',
  C2: 'GROUND',
  SHIP: 'SEA',
  BOAT: 'SEA',
  RADAR: 'GROUND',
  UAS: 'AIR',
  TROOP: 'GROUND',
  EMIT: 'GROUND',
};
export function domainForTarget(t: Target): Domain {
  return CAT_DOMAIN[t.cat] || 'GROUND';
}

// Checked before the generic altFt-set-means-airborne rule below, so a
// satellite (no altFt — see ORACLE in server/src/seed.ts) still lands in
// SPACE rather than falling through to GROUND.
const SPACE_SENSOR_PLATFORM = /\bSAT\b/;
export function domainForSensor(s: Sensor): Domain {
  if (SPACE_SENSOR_PLATFORM.test(s.platform)) return 'SPACE';
  if (s.altFt != null) return 'AIR';
  return 'GROUND';
}

const SEA_UNIT_KEYWORDS = /CARRIER|DESTROYER|CRUISER|FRIGATE|NAVAL|\bDDG\b|\bSHIP\b/;
const AIR_UNIT_KEYWORDS = /AIR PATROL|AIRCRAFT|BOMBER|FIGHTER|^[A-Z]{1,2}-\d/;
export function domainForUnit(u: FriendlyUnit): Domain {
  if (SEA_UNIT_KEYWORDS.test(u.platform) || SEA_UNIT_KEYWORDS.test(u.type)) return 'SEA';
  if (AIR_UNIT_KEYWORDS.test(u.platform) || AIR_UNIT_KEYWORDS.test(u.type)) return 'AIR';
  return 'GROUND';
}

export const DOMAINS: Domain[] = ['AIR', 'SEA', 'GROUND', 'SPACE'];
// SEA's display label is "MARITIME" — the Domain value itself stays 'SEA'
// (it's what the classification functions, the Kafka topic names, and the
// live_sea_tracks table all key on), only the user-facing text changed.
export const DOMAIN_META: Record<Domain, { label: string; color: string }> = {
  AIR: { label: 'AIR', color: C.cyan },
  SEA: { label: 'MARITIME', color: C.blue },
  GROUND: { label: 'GROUND', color: C.amber },
  SPACE: { label: 'SPACE', color: C.violet },
};

export function sensorName(sensors: Sensor[], id: string | null | undefined): string {
  const s = sensors.find((x) => x.id === id);
  return s ? s.callsign : '—';
}
export function effName(effectors: Effector[], id: string | null | undefined): string {
  const e = effectors.find((x) => x.id === id);
  return e ? e.callsign : '—';
}

// A real WGS84 -> MGRS conversion (the `mgrs` package — small, zero
// dependencies, the standard JS implementation), replacing what used to be
// arithmetic on the abstract x/y grid glued onto a hardcoded, made-up grid
// zone ('37T CK') that had no relationship to the AO's real location (the
// Strait of Gibraltar is actually grid zone 30S).
export function mgrs(t: { lng: number; lat: number }): string {
  const ref = mgrsForward([t.lng, t.lat], 5); // e.g. "30STE5921289469" (5-digit = 1m precision)
  const zone = ref.slice(0, 3);
  const square = ref.slice(3, 5);
  const digits = ref.slice(5);
  const half = digits.length / 2;
  return `${zone} ${square} ${digits.slice(0, half)} ${digits.slice(half)}`;
}

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance between two points, in nautical miles (haversine)
// — mirrors server/src/helpers.ts's copy (no shared-code package between
// the two TS projects in this repo).
export function distanceNm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Destination point given a start position, bearing, and great-circle
// distance — mirrors server/src/helpers.ts's copy (no shared-code package
// between the two TS projects in this repo).
export function destinationPoint(lng: number, lat: number, bearingDeg: number, distanceNm: number): { lng: number; lat: number } {
  const dr = distanceNm / EARTH_RADIUS_NM;
  const br = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(dr) + Math.cos(phi1) * Math.sin(dr) * Math.cos(br));
  const lambda2 = lambda1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(phi1), Math.cos(dr) - Math.sin(phi1) * Math.sin(phi2));
  return { lng: toDeg(lambda2), lat: toDeg(phi2) };
}

// Vertices (lng/lat) of a true geodesic circle — a constant-great-circle-
// distance ring around a center point — rather than the flat screen-space
// circle range rings used to be drawn as (a fixed pixel radius around a
// single projected center point). A screen-space circle's implied ground
// radius shrinks the farther the center is from the equator (Web Mercator
// stretches distance by secant(lat)), and has no relationship at all to the
// actual ground footprint once a 3D/2.5D camera is tilted or rotated. Since
// every OTHER vertex is projected individually through the map's own
// project() — same as every other geographic overlay element (NAIs, sensor
// coverage, etc.) — the resulting polygon automatically reflects whatever
// distortion the active 2D projection or 3D camera applies, rather than
// pretending a range ring is a perfect on-screen circle regardless of
// latitude or viewing angle.
export function geodesicCircleLngLat(centerLng: number, centerLat: number, radiusNm: number, segments = 72): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const { lng, lat } = destinationPoint(centerLng, centerLat, (360 * i) / segments, radiusNm);
    pts.push([lng, lat]);
  }
  return pts;
}

// Vertices (lng/lat) of a sensor's field-of-view "cone" as a true geodesic
// sector (a fan of equal-radius bearings from the sensor, not the flat
// screen-space triangle — sensor point + two straight-line far corners —
// sensor coverage cones used to be drawn as). The center point is included
// first and last so the caller can render it directly as a closed polygon;
// same geodesic-vertex rationale as geodesicCircleLngLat above.
export function geodesicSectorLngLat(
  centerLng: number,
  centerLat: number,
  radiusNm: number,
  centerBearingDeg: number,
  halfAngleDeg: number,
  segments = 24,
): [number, number][] {
  const pts: [number, number][] = [[centerLng, centerLat]];
  for (let i = 0; i <= segments; i++) {
    const bearing = centerBearingDeg - halfAngleDeg + (2 * halfAngleDeg * i) / segments;
    const { lng, lat } = destinationPoint(centerLng, centerLat, bearing, radiusNm);
    pts.push([lng, lat]);
  }
  pts.push([centerLng, centerLat]);
  return pts;
}

// Vertices (lng/lat) of a wide-area sensor's elliptical footprint — same
// geodesic-vertex fix as the circle/sector above, generalized to an
// ellipse: radius at each bearing follows the standard polar-ellipse
// equation (relative to the ellipse's own major-axis bearing), then that
// per-bearing radius is placed with the same destinationPoint great-circle
// math as everything else here, rather than an axis-aligned screen-space
// <ellipse>.
export function geodesicEllipseLngLat(
  centerLng: number,
  centerLat: number,
  semiMajorNm: number,
  semiMinorNm: number,
  majorAxisBearingDeg: number,
  segments = 72,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (360 * i) / segments;
    const theta = toRad(bearing - majorAxisBearingDeg);
    const a = semiMajorNm;
    const b = semiMinorNm;
    const r = (a * b) / Math.sqrt((b * Math.cos(theta)) ** 2 + (a * Math.sin(theta)) ** 2);
    const { lng, lat } = destinationPoint(centerLng, centerLat, bearing, r);
    pts.push([lng, lat]);
  }
  return pts;
}

const DTG_BASE = Date.UTC(2026, 5, 28, 3, 14, 0);
const pad2 = (n: number) => String(n).padStart(2, '0');

export function fmtDTG(tick: number): string {
  const d = new Date(DTG_BASE + tick * 1000);
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// The command-bar clock reflects the real wall-clock time (Zulu), unlike
// fmtDTG/fmtLogTime above which run on the simulation's own tick-based clock.
export function fmtRealDTG(d: Date): string {
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
export function fmtRealDateLine(d: Date): string {
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad2(d.getUTCFullYear() % 100)} · ZULU`;
}
export function fmtLogTime(t: number): string {
  const d = new Date(DTG_BASE + t * 1000);
  return `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
}

export interface Signature {
  emcon: string;
  band: string;
  freq: string;
  prf: string;
  mode: string;
  intercept: string;
  sigColor: string;
}
export function sigFor(t: Target): Signature {
  if (t.cat === 'SAM') {
    if (t.name === 'VIPER') return { emcon: 'ACTIVE', band: 'S / X-BAND', freq: '3.2 GHz acq · 9.1 GHz track', prf: 'staggered', mode: 'TARGET TRACK', intercept: 'T-00:14', sigColor: C.red };
    return { emcon: 'INTERMITTENT', band: 'C / X-BAND', freq: '5.6 GHz', prf: 'fixed', mode: 'SEARCH', intercept: 'T-02:40', sigColor: C.amber };
  }
  if (t.cat === 'RADAR') return { emcon: 'ACTIVE', band: 'VHF', freq: '~220 MHz', prf: 'low', mode: 'EW SEARCH (C-VLO)', intercept: 'T-00:51', sigColor: C.red };
  if (t.cat === 'EMIT') return { emcon: 'BURST', band: 'UHF', freq: 'unresolved', prf: '—', mode: 'COMINT', intercept: 'T-00:30', sigColor: C.yellow };
  if (t.cat === 'SHIP' || t.cat === 'BOAT') return { emcon: 'NAV ONLY', band: 'X-BAND', freq: '9.4 GHz', prf: 'nav', mode: 'SURFACE SEARCH', intercept: 'T-01:10', sigColor: C.amber };
  if (t.cat === 'C2') return { emcon: 'EMCON-A', band: 'HF / SATCOM', freq: 'masked', prf: '—', mode: 'C2 LINKS', intercept: 'T-12:00', sigColor: C.green };
  if (t.cat === 'UAS') return { emcon: 'DATALINK', band: 'Ku-BAND', freq: '14.2 GHz', prf: '—', mode: 'CMD / CTRL UPLINK', intercept: 'T-00:06', sigColor: C.amber };
  return { emcon: 'EMCON / SILENT', band: '—', freq: '—', prf: '—', mode: '—', intercept: '—', sigColor: C.dim };
}

export interface PhysSig {
  rcs: string;
  dims: string;
  mob: string;
}
const PHYS_FOR: Record<Category, PhysSig> = {
  TEL: { rcs: 'LARGE (vehicle)', dims: '~13 m TEL', mob: 'WHEELED 8×8 · SHOOT-&-SCOOT' },
  SAM: { rcs: 'MED (radar + TELs)', dims: 'battery dispersed', mob: 'TRACKED · RELOCATABLE' },
  C2: { rcs: 'FIXED structure', dims: 'hardened bunker', mob: 'STATIC' },
  SHIP: { rcs: 'VERY LARGE', dims: '~157 m DDG', mob: '22 KT · MANEUVERING' },
  BOAT: { rcs: 'SMALL (stealth hull)', dims: '~43 m · ×3', mob: '36 KT · HIGH SPEED' },
  RADAR: { rcs: 'LARGE array', dims: 'mast-mounted', mob: 'TOWED · SLOW' },
  UAS: { rcs: 'LOW OBSERVABLE', dims: '~10 m span', mob: 'AIR · 96 KT' },
  TROOP: { rcs: 'DISPERSED', dims: 'coy (+80 pax)', mob: 'DISMOUNTED / MTZD' },
  EMIT: { rcs: 'POINT', dims: 'unknown', mob: 'UNKNOWN' },
};
export function physFor(t: Target): PhysSig {
  return PHYS_FOR[t.cat] || { rcs: '—', dims: '—', mob: '—' };
}

export interface SourceRow {
  int: string;
  sensor: string;
  rel: string;
  relColor: string;
  recency: string;
}
const REL_COLOR: Record<string, string> = { 'A-1': C.green, 'B-2': C.amber, 'C-3': C.yellow, 'F-6': C.red };
export function sourcesFor(t: Target, sensors: Sensor[]): SourceRow[] {
  const rc = (c: string) => REL_COLOR[c] || C.dim;
  const custody = sensorName(sensors, t.custody);
  let rows: [string, string, string, string][];
  if (t.cat === 'SAM' || t.cat === 'RADAR' || t.cat === 'EMIT') rows = [['ELINT', 'PROWLER-2', 'A-1', 'live'], ['IMINT', custody, 'B-2', '2m'], ['SIGINT', 'PROWLER-2', 'B-2', '6m']];
  else if (t.cat === 'SHIP' || t.cat === 'BOAT') rows = [['GMTI', 'GLOBE-7', 'A-1', 'live'], ['IMINT', 'GLOBE-7', 'B-2', '3m'], ['ELINT', 'PROWLER-2', 'C-3', '9m']];
  else if (t.cat === 'TEL') rows = [['IMINT', 'ORACLE', 'A-1', '2m'], ['ELINT', 'PROWLER-2', 'B-2', '4m'], ['GMTI', 'GLOBE-7', 'B-2', '7m']];
  else if (t.cat === 'UAS') rows = [['RADAR', 'SENTRY-3', 'A-1', 'live'], ['ELINT', 'PROWLER-2', 'B-2', '1m']];
  else rows = [['GMTI', 'GREYHOUND', 'C-3', 'live'], ['IMINT', custody, 'C-3', '5m']];
  return rows.map(([int, sensor, rel, recency]) => ({ int, sensor, rel, relColor: rc(rel), recency }));
}

export interface ObsRow {
  time: string;
  sensor: string;
  int: string;
  note: string;
}
export function obsFor(t: Target, tick: number, sensors: Sensor[]): ObsRow[] {
  const offs = [0.5, 4, 12, 33, 72];
  const notes = [
    'Position update — track custody maintained.',
    `Classification refined to ${t.type}.`,
    'Cross-cue confirmation, multi-INT correlation.',
    `Pattern-of-life consistent with ${catFull(t.cat)}.`,
    'Initial detection — nominated to collection.',
  ];
  const custody = sensorName(sensors, t.custody);
  const obsSensors = [custody, 'PROWLER-2', custody, 'GLOBE-7', 'SENTRY-3'];
  const ints = ['IMINT', 'ELINT', 'MULTI-INT', 'GMTI', 'RADAR'];
  const base = DTG_BASE + tick * 1000;
  return offs.map((o, i) => {
    const d = new Date(base - o * 60000);
    return { time: `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`, sensor: obsSensors[i], int: ints[i], note: notes[i] };
  });
}

export function rationaleFor(t: Target): string {
  const corr = t.cat === 'SAM' || t.cat === 'RADAR' || t.cat === 'EMIT' ? 'ELINT emitter geolocation and EO/IR imagery' : 'GMTI, imagery, and pattern-of-life';
  const tail = t.nsl
    ? 'NSL proximity flag asserted — engagement restricted pending de-confliction.'
    : t.aff === 'HOS'
      ? 'Eligible for prosecution per HPTL guidance.'
      : 'Retained for situational awareness; not target-eligible.';
  return `Track ${t.id.slice(1)} (${t.name}) assessed ${affFull(t.aff)} ${catFull(t.cat)} at ${t.conf}% confidence. Correlation across ${corr} supports the classification. ${tail}`;
}

export interface AssocRow {
  affColor: string;
  affShape: CSSProperties;
  idShort: string;
  name: string;
  rel: string;
  dist: string;
  relColor: string;
  clickable: boolean;
  oid?: string;
  border: string;
}
export function computeAssoc(sel: Target, state: Pick<State, 'targets' | 'sensors' | 'effectors'>): AssocRow[] {
  type Raw = { kind: 'unit' | 'sensor' | 'effector' | 'target'; aff: Affiliation; id: string; name: string; rel: string; dist: string; clickable: boolean; oid?: string };
  const res: Raw[] = [];
  res.push({ kind: 'unit', aff: sel.aff, id: 'UNIT', name: unitFor(sel), rel: 'PARENT', dist: '', clickable: false });
  if (sel.custody && sel.custody !== '—') res.push({ kind: 'sensor', aff: 'FRD', id: 'SNSR', name: sensorName(state.sensors, sel.custody), rel: 'CUSTODY', dist: '', clickable: false });
  if (sel.effector) res.push({ kind: 'effector', aff: 'FRD', id: 'EFF', name: effName(state.effectors, sel.effector), rel: 'PAIRED', dist: '', clickable: false });

  // Thresholds are the old abstract-grid-unit values (13/28/42) converted
  // to real nautical miles at this AO's scale (~0.45 NM/unit), preserving
  // the original relative "how close counts as close" calibration now
  // that the underlying distance is real.
  const dist = (a: Target, b: Target) => distanceNm(a.lng, a.lat, b.lng, b.lat);
  const others = state.targets
    .filter((o) => o.id !== sel.id)
    .map((o) => ({ o, d: dist(sel, o) }))
    .sort((a, b) => a.d - b.d);
  let added = 0;
  for (const { o, d } of others) {
    if (added >= 5) break;
    let rel: string | null = null;
    if (d < 6) rel = 'CO-LOCATED';
    else if (sel.cat !== 'SAM' && o.cat === 'SAM' && o.aff === 'HOS' && d < 13) rel = 'AD COVER';
    else if (sel.cat === 'SAM' && o.aff === 'HOS' && o.cat !== 'SAM' && d < 13 && (o.threat === 'CRIT' || o.threat === 'HIGH')) rel = 'DEFENDS';
    else if (sel.cat === 'C2' && o.aff === 'HOS' && d < 19) rel = 'SUBORDINATE';
    if (rel) {
      res.push({ kind: 'target', aff: o.aff, id: o.id, name: o.name, rel, dist: `${d.toFixed(1)} NM`, clickable: true, oid: o.id });
      added++;
    }
  }

  return res.map((a) => ({
    affColor: affColor(a.aff),
    affShape: affShapeStyle(a.aff),
    idShort: a.kind === 'target' ? a.id.slice(1) : a.id,
    name: a.name,
    rel: a.rel,
    dist: a.dist,
    relColor: a.rel === 'DEFENDS' || a.rel === 'AD COVER' ? C.red : a.rel === 'PAIRED' ? C.amber : a.kind === 'sensor' ? C.cyan : '#9fb2ae',
    clickable: a.clickable,
    oid: a.oid,
    border: a.clickable ? '#1c2a28' : '#131e1d',
  }));
}

export interface EffCandidate {
  data: Effector;
  pk: number;
  inRange: boolean;
  assigned: boolean;
  suited: boolean;
}
export function effFor(sel: Target, effectors: Effector[]): EffCandidate[] {
  return effectors
    .map((e) => {
      let pk = e.suits.includes(sel.cat) ? 0.78 + (e.id.length % 5) * 0.03 : 0.42 + (e.id.length % 4) * 0.04;
      if (!e.kinetic) pk = e.suits.includes(sel.cat) ? 0.7 : 0.2;
      if ((sel.threat === 'CRIT' || sel.threat === 'HIGH') && !e.stealth && sel.cat === 'SAM') pk -= 0.12;
      pk = Math.max(0.12, Math.min(0.95, pk));
      const inRange = e.rng >= 6;
      const assigned = sel.effector === e.id;
      return { data: e, pk, inRange, assigned, suited: e.suits.includes(sel.cat) };
    })
    .sort((a, b) => Number(b.suited) - Number(a.suited) || b.pk - a.pk);
}

export function isEngageReady(sel: Target | undefined | null): boolean {
  if (!sel) return false;
  if (sel.stage === 4) return false;
  return sel.stage === 3 && !!sel.effector && sel.appr.tea && sel.appr.jag && sel.appr.pid && sel.appr.strike;
}

export function statusColorFor(t: Target): string {
  if (t.status === 'NEUTRALIZED') return C.green;
  if (t.status.indexOf('ENGAGED') >= 0) return C.red;
  if (t.status === 'CLEARED HOT') return C.red;
  if (t.status === 'NO-STRIKE') return C.green;
  if (t.aff === 'UNK') return C.yellow;
  return '#9fb2ae';
}

export function trkColorFor(trkQ: number): string {
  return trkQ >= 80 ? C.green : trkQ >= 55 ? C.amber : C.red;
}

export function cdeColorFor(cde: string): string {
  return cde === 'CDE-3' ? C.red : cde === 'CDE-2' ? C.amber : C.green;
}

export function nslDistFor(t: Target): { label: string; color: string } {
  if (t.nsl) return { label: '0.4 KM — IN NSZ', color: C.red };
  if (t.cat === 'SHIP' || t.cat === 'BOAT') return { label: '2.1 KM', color: '#9fb2ae' };
  return { label: '> 5 KM CLR', color: '#9fb2ae' };
}

export function stageForF2T2EA(stage: number): number {
  // stageToPhase mapping from the source: [1,2,3,3,5][sel.stage]
  const map = [1, 2, 3, 3, 5];
  return map[stage] ?? 0;
}

// Rolling ATO timeline strip (design brief §III.1) — Phase B.
export const ATO_DAYS: AtoDay[] = ['D-3', 'D-2', 'D-1', 'D0', 'D+1', 'D+2', 'D+3'];

// Tutorial-groundwork fix for the design brief's RT-T1 finding: a sortie's
// ATO-day band is derived here, live, from totWindowStart against the
// real clock — never stored. An earlier version of Sortie had `atoDay` as
// a field, computed once at seed time; left alone for long enough (no
// live producer ever recomputes it, and nothing in the app resets the
// seed on a schedule), every stored label would quietly go stale relative
// to "today" without anything failing loudly. A sortie whose window falls
// outside the D-3..D+3 band it can represent (badly stale fixture data,
// or a real deployment's sortie further out than this UI bothers banding)
// clamps to the nearest edge rather than producing an invalid label or
// silently vanishing from every day's count.
export function atoDayFor(totWindowStart: string, referenceDate: Date = new Date()): AtoDay {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const startOfToday = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  const offsetDays = Math.floor((new Date(totWindowStart).getTime() - startOfToday) / DAY_MS);
  const clamped = Math.max(-3, Math.min(3, offsetDays));
  return (clamped === 0 ? 'D0' : clamped > 0 ? `D+${clamped}` : `D${clamped}`) as AtoDay;
}

// Which BDA phase would be maturing that far back (PDA→FDA→TSA) — an
// illustrative day-band label per the design brief's hero diagram, not a
// computed aggregate of that day's actual sorties' bda fields. A day with
// no strike sorties at all still gets a phase label; it just has nothing
// to show under it.
const ATO_DAY_PHASE: Record<AtoDay, string> = {
  'D-3': 'TSA',
  'D-2': 'FDA',
  'D-1': 'PDA',
  D0: 'EXECUTION',
  'D+1': 'ATO PRODUCTION',
  'D+2': 'MAAP / PLANNING',
  'D+3': 'GUIDANCE',
};
export function atoDayPhaseLabel(day: AtoDay): string {
  return ATO_DAY_PHASE[day];
}
export function atoDayPhaseColor(day: AtoDay): string {
  if (day === 'D0') return C.amber;
  if (day === 'D+1') return C.cyan;
  if (day === 'D+2' || day === 'D+3') return C.dim;
  return C.green; // D-1..D-3, assessing
}

export function sortieStatusColor(status: SortieStatus): string {
  if (status === 'AIRBORNE' || status === 'TOT') return C.amber;
  if (status === 'COMPLETE') return C.green;
  if (status === 'CANCELLED') return C.red;
  return '#9fb2ae'; // FRAGGED, RTB
}

// Sorties carry real UTC timestamps (design brief RT-01), not the sim's
// DTG_BASE-relative tick clock fmtDTG/fmtLogTime above render — a separate
// formatter on purpose, not a variant of fmtRealDTG (which takes a Date
// already, not an ISO string, and includes seconds a TOT window doesn't
// need).
export function fmtSortieTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z`;
}

// Phase E — every sortie currently tasked against a CPCL requirement
// (assets/collectionRequirements.ts), not stored on the requirement
// itself, so a sortie ceasing to be tasked (or a new one picking it up)
// never needs a second place updated to match.
export function sortiesForCollectionRequirement(sorties: Sortie[], requirementId: string): Sortie[] {
  return sorties.filter((s) => s.collectionRequirementIds.includes(requirementId));
}

// A requirement reads as "being collected" only while something is
// actually on station/airborne against it — a FRAGGED (not yet launched)
// or COMPLETE (already recovered) sortie doesn't currently satisfy it,
// even if one's tasked for later or already flew earlier.
export function isCollectionRequirementSatisfied(sorties: Sortie[], requirementId: string): boolean {
  return sortiesForCollectionRequirement(sorties, requirementId).some((s) => s.status === 'AIRBORNE' || s.status === 'TOT');
}

// Indexes sorties by every collectionRequirementId they carry, once, for
// callers checking many requirements against the same sortie list — the
// CPCL panel (LeftRail.tsx) was otherwise having each of its rows filter
// the whole sorties array for itself via sortiesForCollectionRequirement
// above, an O(requirements × sorties) scan for what a single Map build
// answers in one pass.
export function indexSortiesByCollectionRequirement(sorties: Sortie[]): Map<string, Sortie[]> {
  const index = new Map<string, Sortie[]>();
  for (const s of sorties) {
    for (const reqId of s.collectionRequirementIds) {
      const list = index.get(reqId);
      if (list) list.push(s);
      else index.set(reqId, [s]);
    }
  }
  return index;
}

export { STAGES };

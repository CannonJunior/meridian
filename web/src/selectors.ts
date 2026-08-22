import type { CSSProperties } from 'react';
import { forward as mgrsForward } from 'mgrs';
import { STAGES } from './types';
import type { Affiliation, Category, Effector, Sensor, State, Target, Threat } from './types';

// Pure derived-value helpers, ported 1:1 from the `Component` class methods
// in Meridian Fires C2.dc.html (renderVals/renderMap section, lines ~920-1113).

export const C = {
  amber: '#ffab38',
  red: '#ff5a47',
  redCrit: '#ff3b30',
  cyan: '#3fd2e6',
  blue: '#5b9dff',
  yellow: '#ffd23f',
  green: '#5fe39a',
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

export { STAGES };

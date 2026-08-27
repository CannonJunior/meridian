export type Affiliation = 'HOS' | 'UNK' | 'FRD' | 'NEU';
export type Threat = 'CRIT' | 'HIGH' | 'MED' | 'LOW' | null;
export type Category = 'TEL' | 'SAM' | 'C2' | 'SHIP' | 'BOAT' | 'RADAR' | 'UAS' | 'TROOP' | 'EMIT';
export type SensorCoverage = 'cone' | 'wide' | 'area' | 'none';
export type View = 'MAP' | 'BOARD';
export type CardKind = 'target' | 'sensor' | 'unit' | 'nai' | 'zone';

export interface Approvals {
  pid: boolean;
  jag: boolean;
  strike: boolean;
  tea: boolean;
}

export interface Target {
  id: string;
  name: string;
  type: string;
  cat: Category;
  aff: Affiliation;
  threat: Threat;
  stage: number;
  pri: number | null;
  conf: number;
  trkQ: number;
  lng: number;
  lat: number;
  course: number;
  speed: number;
  elev: string;
  custody: string;
  decay: number;
  sidc: string;
  effector: string | null;
  method: string;
  cde: string;
  nsl: boolean;
  appr: Approvals;
  status: string;
  bda: string | null;
  engagedAt: number | null;
  // Real vertical position in feet, null for anything that isn't airborne
  // (ships, ground SAM sites, static installations) — see the altitude
  // display plan's Section 03. vsFtMin is the current climb/descend rate,
  // also null when altFt is null; it exists only to drive the TCAS-style
  // trend chevron, not as an independent fact about the entity.
  altFt: number | null;
  vsFtMin: number | null;
}

export interface Sensor {
  id: string;
  callsign: string;
  platform: string;
  intType: string;
  status: 'ON STATION' | 'TASKED' | 'DEGRADED' | 'RTB';
  tasking: string;
  endur: number;
  lng: number;
  lat: number;
  cov: SensorCoverage;
  covDir?: number;
  altFt: number | null;
}

export interface Effector {
  id: string;
  callsign: string;
  platform: string;
  weapon: string;
  status: string;
  tot: number;
  rng: number;
  suits: Category[];
  stealth: boolean;
  kinetic: boolean;
  altFt: number | null;
}

export interface FriendlyUnit {
  id: string;
  callsign: string;
  platform: string;
  type: string;
  role: string;
  status: string;
  lng: number;
  lat: number;
  weapon: string;
  endur: number;
  effId: string | null;
}

// A real geographic bounding box (degrees), replacing the old abstract
// x/y/w/h box — lngMin/latMin is the southwest corner, lngMax/latMax the
// northeast corner, matching the west->east / south->north sense every
// other real-coordinate field in this app now uses.
export interface Nai {
  id: string;
  desc: string;
  pir: string;
  color: string;
  lngMin: number;
  latMin: number;
  lngMax: number;
  latMax: number;
}

export interface LogEntry {
  t: number;
  tag: string;
  text: string;
  tag2: string;
}

// Phase A of the "Rolling Air Picture" plan (see the design brief) — the
// Sortie entity, scoped to the full ATO per the locked decision, not just
// strike/SEAD. Deliberately its own entity rather than a new field on
// Target or Effector: a real ATO line is many-to-many with both (one
// sortie can service several DMPIs, one target can need several sorties'
// reattack), and most mission types here (AAR, AIRLIFT, AEW, CSAR) carry
// no target at all.
export type SortieMissionType = 'STRIKE' | 'SEAD' | 'CAS' | 'OCA' | 'DCA' | 'ISR' | 'AAR' | 'AIRLIFT' | 'AEW' | 'CSAR';
export type SortieStatus = 'FRAGGED' | 'AIRBORNE' | 'TOT' | 'RTB' | 'COMPLETE' | 'CANCELLED';
// D-3..D+3 — the rolling-timeline band a sortie belongs to. Derived at
// seed/fixture time from totWindowStart relative to "now," not stored
// independently of it, but kept as its own field since Phase B's timeline
// strip and AIR TASKING manager filter by day far more often than they'd
// want to recompute the offset from a raw timestamp on every render.
export type AtoDay = 'D-3' | 'D-2' | 'D-1' | 'D0' | 'D+1' | 'D+2' | 'D+3';
export type BdaPhaseStatus = 'PENDING' | 'ASSESSED' | 'INCONCLUSIVE';

// One (sortie, target) pair's combat-assessment ladder (CJCSI 3162.02A) —
// keyed by targetId on Sortie.bda rather than living on Target, since a
// target under simultaneous reattack by more than one sortie needs one of
// these per sortie that struck it, not one shared status (see the design
// brief's RT-04 finding). Target.bda's existing free-text field is
// untouched here — Phase F is what reconciles the two.
export interface SortieBda {
  pda: BdaPhaseStatus;
  fda: BdaPhaseStatus;
  tsa: BdaPhaseStatus;
  reattackRecommended: boolean;
  note: string | null;
}

export interface Sortie {
  id: string;
  // Shared by every sortie flying as part of the same strike package —
  // null for independent lines (a standing ISR orbit, a scheduled airlift
  // run) that were never packaged with anything else.
  packageId: string | null;
  callsign: string;
  platform: string;
  // Set only when this sortie's airframe is *also* tracked as a live
  // Effector or Sensor elsewhere in State (e.g. an ISR sortie flown by the
  // same MQ-9 that's already a Sensor) — Phase B resolves it against
  // whichever of the two arrays actually contains the id. null for
  // mission types (AAR, AIRLIFT, CSAR) Meridian doesn't otherwise model.
  linkedPlatformId: string | null;
  missionType: SortieMissionType;
  // ICAO code, uppercased (e.g. 'LXGB') — resolved client-side against the
  // real `airfields` GeoServer layer by web/src/airfieldIcaoIndex.ts (Phase
  // C), not a GeoServer feature id directly, since that's the one stable
  // identifier both this fixture data and that layer's OSM-derived `icao`
  // property agree on. A code with no match in the layer (or no code at
  // all) simply doesn't resolve to a map location — see the design
  // brief's RT-08 finding.
  originAirfield: string;
  recoveryAirfield: string;
  // Populated for strike/SEAD/CAS lines; empty for everything else.
  targetIds: string[];
  // What an AAR/tanker or AEW sortie is in support of — its "target" is
  // other sorties, not a Target. Empty for strike lines.
  supportedSortieIds: string[];
  // What an ISR sortie is tasked against — ids into the CPCL/JIPCL list
  // Phase E adds to the ISR manager (§III.7 of the design brief); these
  // ids don't resolve to anything yet in Phase A, only strike/SEAD lines
  // ever have both this and targetIds empty simultaneously.
  collectionRequirementIds: string[];
  // ISO 8601 UTC — always real wall-clock time, anchored to the same
  // clock CommandBar.tsx renders. Never derived from or compared against
  // State.t, which is Meridian's abstract, pausable/speedable sim tick —
  // conflating the two was the design brief's RT-01 finding.
  totWindowStart: string;
  totWindowEnd: string;
  status: SortieStatus;
  atoDay: AtoDay;
  // Keyed by targetId — see SortieBda's doc comment. null for sorties
  // with no targetIds.
  bda: Record<string, SortieBda> | null;
}

export interface Stage {
  key: string;
  name: string;
  color: string;
}

export interface Roe {
  label: string;
  color: string;
}

export const STAGES: Stage[] = [
  { key: 'IDENTIFIED', name: 'IDENT', color: '#7a8d8a' },
  { key: 'PRIORITIZED', name: 'PRIOR', color: '#ffd23f' },
  { key: 'COORDINATION', name: 'COORD', color: '#ffab38' },
  { key: 'EXECUTION', name: 'EXEC', color: '#ff5a47' },
  { key: 'COMPLETE', name: 'CMPLT', color: '#5fe39a' },
];

export const ROES: Roe[] = [
  { label: 'WEAPONS HOLD', color: '#ff5a47' },
  { label: 'WEAPONS TIGHT', color: '#ffab38' },
  { label: 'WEAPONS FREE', color: '#5fe39a' },
];

export interface State {
  t: number;
  selectedId: string;
  view: View;
  roeIdx: number;
  targets: Target[];
  sensors: Sensor[];
  effectors: Effector[];
  units: FriendlyUnit[];
  nais: Nai[];
  log: LogEntry[];
  sorties: Sortie[];
}

export type ActionMessage =
  | { type: 'action'; name: 'selectTarget'; args: { id: string } }
  | { type: 'action'; name: 'setView'; args: { view: View } }
  | { type: 'action'; name: 'cycleRoe'; args: Record<string, never> }
  | { type: 'action'; name: 'retaskSensor'; args: { sensorId: string } }
  | { type: 'action'; name: 'assignEffector'; args: { effectorId: string } }
  | { type: 'action'; name: 'toggleAppr'; args: { key: keyof Approvals; id?: string } }
  | { type: 'action'; name: 'setPriority'; args: { id: string; pri: number | null } }
  | { type: 'action'; name: 'engage'; args: Record<string, never> }
  | { type: 'action'; name: 'setStage'; args: { id: string; stageIdx: number } }
  | { type: 'action'; name: 'advanceStage'; args: Record<string, never> }
  | { type: 'action'; name: 'retreatStage'; args: Record<string, never> };

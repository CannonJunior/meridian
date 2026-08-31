export type Affiliation = 'HOS' | 'UNK' | 'FRD' | 'NEU';
export type Threat = 'CRIT' | 'HIGH' | 'MED' | 'LOW' | null;
export type Category = 'TEL' | 'SAM' | 'C2' | 'SHIP' | 'BOAT' | 'RADAR' | 'UAS' | 'TROOP' | 'EMIT';
// Physical domain a live entity operates in — what the Layer Manager's
// per-domain checkboxes (LayerManager.tsx) filter the map overlay by, and
// what the domain-segmented Kafka topics (kafka/README.md's "Live Domain
// Tracks" section) key on. Not stored on Target/Sensor/FriendlyUnit
// themselves — derived live via selectors.ts's domainFor*() functions from
// fields (cat, platform) that already exist, same reasoning as AtoDay.
export type Domain = 'AIR' | 'SEA' | 'GROUND' | 'SPACE';
export type SensorCoverage = 'cone' | 'wide' | 'area' | 'none';
export type View = 'MAP' | 'BOARD';
export type CardKind = 'target' | 'sensor' | 'unit' | 'nai' | 'zone' | 'oobObject' | 'port' | 'airfield' | 'kbEntity' | 'sortie';
// Which target list is currently driving the collection-table's contents —
// see assets/targetLists.ts for each list's definition and membership rule.
export type TargetListId = 'hptl' | 'jtl' | 'jiptl' | 'rtl' | 'nsl';

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
  // Real vertical position in feet, null for anything that isn't airborne.
  // vsFtMin is the current climb/descend rate, also null when altFt is
  // null — see the altitude display plan's Section 03 / Plan A.
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

// A real geographic bounding box (degrees) — southwest corner
// (lngMin/latMin) to northeast corner (lngMax/latMax) — replacing the old
// abstract x/y/w/h box.
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
// no target at all. Mirrors server/src/types.ts exactly, same as every
// other shared type in this file.
export type SortieMissionType = 'STRIKE' | 'SEAD' | 'CAS' | 'OCA' | 'DCA' | 'ISR' | 'AAR' | 'AIRLIFT' | 'AEW' | 'CSAR';
export type SortieStatus = 'FRAGGED' | 'AIRBORNE' | 'TOT' | 'RTB' | 'COMPLETE' | 'CANCELLED';
export type AtoDay = 'D-3' | 'D-2' | 'D-1' | 'D0' | 'D+1' | 'D+2' | 'D+3';
export type BdaPhaseStatus = 'PENDING' | 'ASSESSED' | 'INCONCLUSIVE';

export interface SortieBda {
  pda: BdaPhaseStatus;
  fda: BdaPhaseStatus;
  tsa: BdaPhaseStatus;
  reattackRecommended: boolean;
  note: string | null;
}

export interface Sortie {
  id: string;
  packageId: string | null;
  callsign: string;
  platform: string;
  linkedPlatformId: string | null;
  missionType: SortieMissionType;
  originAirfield: string;
  recoveryAirfield: string;
  targetIds: string[];
  supportedSortieIds: string[];
  collectionRequirementIds: string[];
  totWindowStart: string;
  totWindowEnd: string;
  status: SortieStatus;
  // No stored atoDay — derive it live from totWindowStart via
  // selectors.ts's atoDayFor() instead of trusting a label written once
  // at seed time (see that function's doc comment for why).
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

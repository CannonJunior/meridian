export type Affiliation = 'HOS' | 'UNK' | 'FRD' | 'NEU';
export type Threat = 'CRIT' | 'HIGH' | 'MED' | 'LOW' | null;
export type Category = 'TEL' | 'SAM' | 'C2' | 'SHIP' | 'BOAT' | 'RADAR' | 'UAS' | 'TROOP' | 'EMIT';
export type SensorCoverage = 'cone' | 'wide' | 'area' | 'none';
export type View = 'MAP' | 'BOARD';
export type CardKind = 'target' | 'sensor' | 'unit' | 'nai' | 'zone' | 'oobObject' | 'port' | 'airfield' | 'kbEntity';
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
}

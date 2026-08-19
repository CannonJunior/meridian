// Order-of-battle asset data: the single source of truth for the OOB tree
// (org chart) and, for every leaf that is a physical object, the map
// representation of that object (status + real-world position). This file
// holds only data — derived views (flattened object lists, graph nodes/edges,
// status styling) live in oobSelectors.ts / assets/oobGraph.ts.

export type OobKind = 'country' | 'branch' | 'fleet' | 'command' | 'group' | 'squadron' | 'base' | 'ship' | 'unit';

// Every OOB node is either an ORGANIZATION (a command echelon — nation,
// branch, fleet, task force, squadron, base) or an OBJECT (a physical thing
// that can be plotted on the map — currently only ships).
export type OobEntityType = 'organization' | 'object';

// Objects are not always known-good tracks: they can be obscured (e.g. a
// submerged submarine), misidentified, destroyed, or simply missing for
// unknown reasons. VISIBLE is the default "we hold custody" state.
export type ObjectStatus = 'VISIBLE' | 'OBSCURED' | 'MISIDENTIFIED' | 'DESTROYED' | 'UNKNOWN';

const OBJECT_KINDS: ReadonlySet<OobKind> = new Set(['ship', 'unit']);

export interface OobNode {
  id: string;
  name: string;
  role?: string;
  kind: OobKind;
  entityType: OobEntityType;
  children?: OobNode[];
  // Object-only fields (present when entityType === 'object'):
  status?: ObjectStatus;
  lng?: number;
  lat?: number;
}

type OobDraft = Omit<OobNode, 'entityType' | 'children'> & { children?: OobDraft[] };

function finalize(nodes: OobDraft[]): OobNode[] {
  return nodes.map((n) => ({
    ...n,
    entityType: OBJECT_KINDS.has(n.kind) ? 'object' : 'organization',
    children: n.children ? finalize(n.children) : undefined,
  }));
}

// Individual hull positions aren't public real-time data. Ships are spread in
// a small deterministic ring around their home port/station so co-located
// hulls don't render stacked on top of one another on the map — this is a
// station approximation, not a live position feed.
const YOKOSUKA = { lng: 139.667, lat: 35.293 };
const SASEBO = { lng: 129.723, lat: 33.161 };
const GUAM = { lng: 144.65, lat: 13.444 };

function nearPort(port: { lng: number; lat: number }, index: number, count: number): { lng: number; lat: number } {
  const angle = (index / count) * Math.PI * 2;
  const radius = 0.05 + (index % 2) * 0.02;
  return { lng: port.lng + Math.cos(angle) * radius, lat: port.lat + Math.sin(angle) * radius * 0.6 };
}

function ship(id: string, name: string, port: { lng: number; lat: number }, index: number, count: number, opts: { role?: string; status?: ObjectStatus } = {}): OobDraft {
  const pos = nearPort(port, index, count);
  return { id, name, kind: 'ship', role: opts.role, status: opts.status ?? 'VISIBLE', lng: pos.lng, lat: pos.lat };
}

// -- Yokosuka-based hulls: flagship, CSG-5, DESRON 15 (14 total) --------
const YOKOSUKA_COUNT = 14;
const blueRidge = ship('us-7f-flagship', 'USS Blue Ridge (LCC-19)', YOKOSUKA, 0, YOKOSUKA_COUNT, { role: 'Fleet flagship' });
const csg5Ships: OobDraft[] = [
  ship('us-cvn-73', 'USS George Washington (CVN-73)', YOKOSUKA, 1, YOKOSUKA_COUNT, { role: 'Aircraft carrier · CSG-5 flagship' }),
  ship('us-cg-62', 'USS Robert Smalls (CG-62)', YOKOSUKA, 2, YOKOSUKA_COUNT, { role: 'Guided-missile cruiser' }),
];
const desron15Ships: OobDraft[] = [
  ship('us-ddg-65', 'USS Benfold (DDG-65)', YOKOSUKA, 3, YOKOSUKA_COUNT),
  ship('us-ddg-69', 'USS Milius (DDG-69)', YOKOSUKA, 4, YOKOSUKA_COUNT, { status: 'OBSCURED' }),
  ship('us-ddg-76', 'USS Higgins (DDG-76)', YOKOSUKA, 5, YOKOSUKA_COUNT),
  ship('us-ddg-83', 'USS Howard (DDG-83)', YOKOSUKA, 6, YOKOSUKA_COUNT),
  ship('us-ddg-85', 'USS McCampbell (DDG-85)', YOKOSUKA, 7, YOKOSUKA_COUNT),
  ship('us-ddg-86', 'USS Shoup (DDG-86)', YOKOSUKA, 8, YOKOSUKA_COUNT),
  ship('us-ddg-88', 'USS Preble (DDG-88)', YOKOSUKA, 9, YOKOSUKA_COUNT, { status: 'UNKNOWN' }),
  ship('us-ddg-105', 'USS Dewey (DDG-105)', YOKOSUKA, 10, YOKOSUKA_COUNT),
  ship('us-ddg-113', 'USS John Finn (DDG-113)', YOKOSUKA, 11, YOKOSUKA_COUNT),
  ship('us-ddg-114', 'USS Ralph Johnson (DDG-114)', YOKOSUKA, 12, YOKOSUKA_COUNT),
  ship('us-ddg-115', 'USS Rafael Peralta (DDG-115)', YOKOSUKA, 13, YOKOSUKA_COUNT),
];

// -- Sasebo-based hulls: TF-76 amphibious force (9 total) ----------------
const SASEBO_COUNT = 9;
const tf76Ships: OobDraft[] = [
  ship('us-lha-6', 'USS America (LHA-6)', SASEBO, 0, SASEBO_COUNT),
  ship('us-lpd-18', 'USS New Orleans (LPD-18)', SASEBO, 1, SASEBO_COUNT),
  ship('us-lpd-20', 'USS Green Bay (LPD-20)', SASEBO, 2, SASEBO_COUNT),
  ship('us-lsd-47', 'USS Rushmore (LSD-47)', SASEBO, 3, SASEBO_COUNT),
  ship('us-lsd-48', 'USS Ashland (LSD-48)', SASEBO, 4, SASEBO_COUNT),
  ship('us-mcm-7', 'USS Patriot (MCM-7)', SASEBO, 5, SASEBO_COUNT),
  ship('us-mcm-9', 'USS Pioneer (MCM-9)', SASEBO, 6, SASEBO_COUNT),
  ship('us-mcm-10', 'USS Warrior (MCM-10)', SASEBO, 7, SASEBO_COUNT),
  ship('us-mcm-14', 'USS Chief (MCM-14)', SASEBO, 8, SASEBO_COUNT, { status: 'MISIDENTIFIED' }),
];

// -- Guam-based hulls: submarine tenders + attack submarine (3 total) ----
const GUAM_COUNT = 3;
const guamShips: OobDraft[] = [
  ship('us-as-39', 'USS Emory S. Land (AS-39)', GUAM, 0, GUAM_COUNT, { role: 'Submarine tender' }),
  ship('us-as-40', 'USS Frank Cable (AS-40)', GUAM, 1, GUAM_COUNT, { role: 'Submarine tender' }),
  ship('us-ssn-722', 'USS Key West (SSN-722)', GUAM, 2, GUAM_COUNT, { role: 'Attack submarine', status: 'OBSCURED' }),
];

const seventhFleet: OobDraft = {
  id: 'us-navy-7f',
  name: 'U.S. Seventh Fleet',
  role: 'Western Pacific / Indian Ocean · HQ Fleet Activities Yokosuka, Japan',
  kind: 'fleet',
  children: [
    blueRidge,
    {
      id: 'us-7f-tf70',
      name: 'Task Force 70 — Battle Force',
      role: 'Carrier strike group, cruisers & destroyers',
      kind: 'command',
      children: [
        { id: 'us-7f-tf70-csg5', name: 'Carrier Strike Group Five', kind: 'group', children: csg5Ships },
        { id: 'us-7f-tf70-desron15', name: 'Destroyer Squadron 15', kind: 'squadron', children: desron15Ships },
      ],
    },
    { id: 'us-7f-tf71', name: 'Task Force 71 — Naval Special Warfare', role: 'NSW units & EOD Mobile Units · Guam', kind: 'command' },
    { id: 'us-7f-tf72', name: 'Task Force 72 — Patrol and Reconnaissance Force', role: 'ASW aircraft (P-3, EP-3) · NAF Misawa, Japan', kind: 'command' },
    { id: 'us-7f-tf73', name: 'Task Force 73 — Logistics Group Western Pacific', role: 'Fleet support & supply ships · Singapore', kind: 'command' },
    { id: 'us-7f-tf74', name: 'Task Force 74 — Fleet Submarine Force', role: 'Submarine operations planning & coordination', kind: 'command' },
    { id: 'us-7f-tf75', name: 'Task Force 75 — Navy Expeditionary Forces Command Pacific', role: 'Coastal riverine operations · Camp Covington, Guam', kind: 'command' },
    { id: 'us-7f-tf76', name: 'Task Force 76 — Amphibious Assault Force', role: 'Marine landing support · HQ Fleet Activities Sasebo, Japan', kind: 'command', children: tf76Ships },
    { id: 'us-7f-tf77', name: 'Task Force 77 — Mine Warfare Force', role: 'Mine countermeasure, hunter & control ships', kind: 'command' },
    { id: 'us-7f-tf78', name: 'Task Force 78 — Commander Naval Forces Korea', role: 'Administrative liaison · Busan Naval Base / Chinhae', kind: 'command' },
    { id: 'us-7f-tf79', name: 'Task Force 79 — Landing Force Seventh Fleet', role: 'Reinforced MEU drawn from III MEF, Okinawa', kind: 'command' },
    {
      id: 'us-7f-bases',
      name: 'Forward-Deployed Bases',
      kind: 'group',
      children: [
        { id: 'us-7f-base-yokosuka', name: 'Fleet Activities Yokosuka, Japan', role: 'Houses CSG-5, DESRON 15 & flagship', kind: 'base' },
        { id: 'us-7f-base-sasebo', name: 'Fleet Activities Sasebo, Japan', role: 'Houses TF-76 amphibious units', kind: 'base' },
        { id: 'us-7f-base-guam', name: 'Naval Base Guam (Apra Harbor)', kind: 'base', children: guamShips },
      ],
    },
  ],
};

const RAW_TREE: OobDraft[] = [
  {
    id: 'ru',
    name: 'Russia',
    kind: 'country',
    children: [
      { id: 'ru-navy', name: 'Russian Navy', role: 'Voyenno-Morskoy Flot', kind: 'branch' },
      { id: 'ru-aerospace', name: 'Russian Aerospace Forces', kind: 'branch' },
      { id: 'ru-ground', name: 'Russian Ground Forces', kind: 'branch' },
    ],
  },
  {
    id: 'us',
    name: 'United States',
    kind: 'country',
    children: [
      {
        id: 'us-navy',
        name: 'US Navy',
        kind: 'branch',
        children: [
          { id: 'us-navy-2f', name: 'U.S. Second Fleet', role: 'Atlantic', kind: 'fleet' },
          { id: 'us-navy-3f', name: 'U.S. Third Fleet', role: 'Eastern Pacific', kind: 'fleet' },
          { id: 'us-navy-4f', name: 'U.S. Fourth Fleet', role: 'Caribbean / Central & South America', kind: 'fleet' },
          { id: 'us-navy-5f', name: 'U.S. Fifth Fleet', role: 'Middle East / Persian Gulf', kind: 'fleet' },
          { id: 'us-navy-6f', name: 'U.S. Sixth Fleet', role: 'Europe / Mediterranean', kind: 'fleet' },
          seventhFleet,
          { id: 'us-navy-10f', name: 'U.S. Tenth Fleet', role: 'Fleet Cyber Command', kind: 'fleet' },
        ],
      },
    ],
  },
];

export const OOB_TREE: OobNode[] = finalize(RAW_TREE);

// Order-of-battle asset data: the single source of truth for the OOB tree
// (org chart) and, for every leaf that is a physical object, the map
// representation of that object (status + real-world position). This file
// holds only data — derived views (flattened object lists, graph nodes/edges,
// status styling) live in oobSelectors.ts / assets/oobGraph.ts.

export type OobKind = 'country' | 'branch' | 'fleet' | 'numberedAF' | 'command' | 'group' | 'wing' | 'squadron' | 'base' | 'ship' | 'unit' | 'contact';

// Every OOB node is either an ORGANIZATION (a command echelon — nation,
// branch, fleet, task force, squadron, base) or an OBJECT (a physical thing
// that can be plotted on the map — ships, and unidentified contacts).
export type OobEntityType = 'organization' | 'object';

// Objects are not always known-good tracks: they can be obscured (e.g. a
// submerged submarine), misidentified, destroyed, or simply missing for
// unknown reasons. VISIBLE is the default "we hold custody" state.
//
// UNIDENTIFIED is distinct from UNKNOWN: UNKNOWN means a *previously known*
// hull went missing from tracking; UNIDENTIFIED means a contact was picked
// up and is being actively tracked, but the system has never established
// which specific vessel (or even class) it is — see the "contact" kind and
// ContactParametrics below for the identification workflow this enables.
export type ObjectStatus = 'VISIBLE' | 'OBSCURED' | 'MISIDENTIFIED' | 'DESTROYED' | 'UNKNOWN' | 'UNIDENTIFIED';

const OBJECT_KINDS: ReadonlySet<OobKind> = new Set(['ship', 'unit', 'contact']);

// Partial, real-world-plausible parametric data collected on an
// UNIDENTIFIED contact — never a complete profile (that's the point: if we
// had everything, it wouldn't be unidentified). Each field is independently
// optional because different collection methods surface different subsets
// (a visual sighting gives length/flag; an ESM intercept gives radar band;
// a port-watch report gives last port visited). The identify workflow in
// OobObjectCardBody lets an analyst narrow a small reference library of
// known vessel profiles (assets/vesselProfiles.ts) against whichever of
// these fields are actually populated, and assign a tentative class ID.
export interface ContactParametrics {
  estimatedLengthM?: number;
  radarBand?: string;
  lastPortVisited?: string;
  observedFlag?: string;
  firstDetected?: string;
}

// Sourced from each hull class's Wikipedia page (class infobox + the linked
// radar/weapon system pages for range figures). One fit is shared across
// every hull of a class — real sister ships carry near-identical combat
// systems suites, so per-hull granularity isn't warranted here.
export interface RadarSystem {
  name: string;
  type: string;
  rangeNm: number;
}
export interface WeaponSystem {
  name: string;
  type: string;
  rangeNm: number;
}

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
  radars?: RadarSystem[];
  weapons?: WeaponSystem[];
  // Object-only, "ship" kind only — physical parametrics used by the
  // knowledge-base similarity search (kb/similarity.ts) to compare hulls
  // across countries. Optional because backfilling every class in this file
  // is future work (see kb/ontology.ts's plan notes) — only populated for
  // classes actually exercised by a cross-country similarity comparison
  // today (Arleigh Burke, Ticonderoga, and the new PLA Navy classes below).
  class?: string;
  lengthM?: number;
  displacementT?: number;
  // Object-only, "ship" kind only — the reference(s) used to determine
  // this ship's command assignment (and, where relevant, its class specs),
  // shown on the object card's HIERARCHY tab. Populated per-hull rather
  // than folded into the class FIT constants above, since two sister ships
  // can be sourced from different pages (e.g. one confirmed via its own
  // Wikipedia article, another via its squadron's roster page).
  sources?: { label: string; url: string }[];
  // Object-only, "contact" kind only:
  parametrics?: ContactParametrics;
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
const WIKI_CURRENT_SHIPS = { label: 'Wikipedia — List of current ships of the United States Navy', url: 'https://en.wikipedia.org/wiki/List_of_current_ships_of_the_United_States_Navy' };

function nearPort(port: { lng: number; lat: number }, index: number, count: number): { lng: number; lat: number } {
  const angle = (index / count) * Math.PI * 2;
  const radius = 0.05 + (index % 2) * 0.02;
  return { lng: port.lng + Math.cos(angle) * radius, lat: port.lat + Math.sin(angle) * radius * 0.6 };
}

function ship(
  id: string,
  name: string,
  port: { lng: number; lat: number },
  index: number,
  count: number,
  opts: {
    role?: string;
    status?: ObjectStatus;
    class?: string;
    lengthM?: number;
    displacementT?: number;
    radars?: RadarSystem[];
    weapons?: WeaponSystem[];
    sources?: { label: string; url: string }[];
  } = {},
): OobDraft {
  const pos = nearPort(port, index, count);
  return {
    id,
    name,
    kind: 'ship',
    role: opts.role,
    status: opts.status ?? 'VISIBLE',
    lng: pos.lng,
    lat: pos.lat,
    class: opts.class,
    lengthM: opts.lengthM,
    displacementT: opts.displacementT,
    radars: opts.radars,
    weapons: opts.weapons,
    sources: opts.sources,
  };
}

// An UNIDENTIFIED contact: unlike ship(), position is a direct lng/lat (a
// point of interest within a fleet's AOR, not a station near a homeport),
// and there is no radar/weapon fit — by definition, we don't yet know what
// this is. `parametrics` carries whatever partial data collection actually
// produced; see ContactParametrics above.
function contact(id: string, name: string, lng: number, lat: number, role: string, parametrics: ContactParametrics = {}): OobDraft {
  return { id, name, kind: 'contact', role, status: 'UNIDENTIFIED', lng, lat, parametrics };
}

// -- Class sensor/weapon fits (nm ranges; sourced from Wikipedia — see the
// research notes accompanying this data for per-system sourcing detail) ----
const BLUE_RIDGE_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-48E', type: '3D air-search', rangeNm: 250 },
  { name: 'AN/SPS-67', type: 'surface-search', rangeNm: 56 },
];
const BLUE_RIDGE_WEAPONS: WeaponSystem[] = [
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];

const NIMITZ_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-48E', type: '3D air-search', rangeNm: 250 },
  { name: 'AN/SPS-49(V)5', type: '2D air-search', rangeNm: 256 },
  { name: 'AN/SPQ-9B', type: 'surface-search / target-acquisition', rangeNm: 40 },
];
const NIMITZ_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-162 ESSM', type: 'surface-to-air missile', rangeNm: 27 },
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 },
];

const TICONDEROGA_RADARS: RadarSystem[] = [
  { name: 'AN/SPY-1A/B', type: '3D multi-function phased-array', rangeNm: 200 },
  { name: 'AN/SPS-49', type: '2D air-search', rangeNm: 256 },
];
const TICONDEROGA_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-66M SM-2MR Standard', type: 'surface-to-air missile', rangeNm: 92 },
  { name: 'RIM-161 SM-3', type: 'surface-to-air / BMD missile', rangeNm: 650 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'RUM-139 VL-ASROC', type: 'anti-submarine missile', rangeNm: 12 },
  { name: 'RGM-84 Harpoon', type: 'anti-ship missile', rangeNm: 77 },
  { name: 'Mk 45 5"/54 gun', type: 'naval gun', rangeNm: 13 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
];
// Physical parametrics (length/displacement from each class's Wikipedia
// infobox) bundled with the sensor/weapon fit, so a single spread onto
// ship()'s opts carries everything the knowledge-base similarity search
// (kb/similarity.ts) needs — see the OobNode.class/lengthM/displacementT
// doc comment above for why this isn't backfilled onto every class yet.
const TICONDEROGA_FIT = { class: 'Ticonderoga-class cruiser', lengthM: 173, displacementT: 9800, radars: TICONDEROGA_RADARS, weapons: TICONDEROGA_WEAPONS };

const ARLEIGH_BURKE_RADARS: RadarSystem[] = [
  { name: 'AN/SPY-1D', type: '3D multi-function phased-array', rangeNm: 200 },
  { name: 'AN/SPS-67(V)3/(V)5', type: 'surface-search', rangeNm: 56 },
];
const ARLEIGH_BURKE_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-66M SM-2MR Standard', type: 'surface-to-air missile', rangeNm: 92 },
  { name: 'RIM-162 ESSM', type: 'surface-to-air missile', rangeNm: 27 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'RGM-84 Harpoon', type: 'anti-ship missile', rangeNm: 77 },
  { name: 'Mk 45 5"/54 gun', type: 'naval gun', rangeNm: 13 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 46 torpedo', type: 'anti-submarine torpedo', rangeNm: 6 },
];
const ARLEIGH_BURKE_FIT = { class: 'Arleigh Burke-class destroyer', lengthM: 154, displacementT: 9200, radars: ARLEIGH_BURKE_RADARS, weapons: ARLEIGH_BURKE_WEAPONS };

const AMERICA_LHA_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-48G', type: '3D air-search', rangeNm: 250 },
  { name: 'AN/SPS-49', type: '2D air-search', rangeNm: 256 },
  { name: 'AN/SPQ-9B', type: 'surface-search', rangeNm: 40 },
];
const AMERICA_LHA_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'RIM-162 ESSM', type: 'surface-to-air missile', rangeNm: 27 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];

const SAN_ANTONIO_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-48G', type: '3D air-search', rangeNm: 250 },
  { name: 'AN/SPQ-9B', type: 'surface-search', rangeNm: 40 },
];
const SAN_ANTONIO_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'Mk 46 / Bushmaster II 30 mm gun', type: 'autocannon', rangeNm: 1.08 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];

const WHIDBEY_ISLAND_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-49', type: '2D air-search', rangeNm: 256 },
  { name: 'AN/SPS-67', type: 'surface-search', rangeNm: 56 },
];
const WHIDBEY_ISLAND_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];

const AVENGER_MCM_RADARS: RadarSystem[] = [{ name: 'AN/SPS-55', type: 'surface-search / navigation', rangeNm: 43 }];
const AVENGER_MCM_WEAPONS: WeaponSystem[] = [{ name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 }];

const EMORY_LAND_AS_RADARS: RadarSystem[] = [];
const EMORY_LAND_AS_WEAPONS: WeaponSystem[] = [{ name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 }];

const LOS_ANGELES_SSN_RADARS: RadarSystem[] = [];
const LOS_ANGELES_SSN_WEAPONS: WeaponSystem[] = [
  { name: 'Mk 48 ADCAP torpedo', type: 'heavyweight torpedo', rangeNm: 11 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'UGM-84 Harpoon', type: 'anti-ship missile', rangeNm: 77 },
];

// Independence-class LCS's own Wikipedia page cites no range figure for any
// of its radars (AN/SPS-77 Sea Giraffe, BridgeMaster E) or most weapons —
// those are omitted per the same "don't guess" rule used throughout this
// file. Ranges below came from each weapon's own Wikipedia page instead.
const INDEPENDENCE_LCS_RADARS: RadarSystem[] = [];
const INDEPENDENCE_LCS_WEAPONS: WeaponSystem[] = [
  { name: 'Mk 110 57 mm gun', type: 'naval gun', rangeNm: 9.2 },
  { name: 'RGM-184A Naval Strike Missile', type: 'anti-ship missile', rangeNm: 110 },
  { name: 'SeaRAM (RIM-116 RAM)', type: 'close-in weapon system', rangeNm: 4.86 },
  { name: 'AGM-114L Hellfire (SUW module)', type: 'anti-vessel missile', rangeNm: 5.95 },
  { name: 'Mk44 Bushmaster II 30 mm gun', type: 'autocannon', rangeNm: 1.08 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];

// -- Additional class fits added for the fleet-wide sourcing pass --------
// Ford-class: neither AN/SPY-3/SPY-4 (CVN-78) nor AN/SPY-6(V)3/SPQ-9B
// (CVN-79+) carry a sourced range figure on the class's own Wikipedia page
// — AN/SPQ-9B's range is already sourced elsewhere in this file (Nimitz
// fit, 40nm) for the identical physical system, reused here; the phased-
// array search radars are omitted rather than guessed. Point-defense
// weapons (ESSM/RAM/Phalanx) reuse the exact range figures already sourced
// for Nimitz-class, since Ford-class carries the identical systems.
// https://en.wikipedia.org/wiki/Gerald_R._Ford-class_aircraft_carrier
const FORD_RADARS: RadarSystem[] = [{ name: 'AN/SPQ-9B', type: 'surface-search / target-acquisition (CVN-79 and later)', rangeNm: 40 }];
const FORD_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-162 ESSM', type: 'surface-to-air missile', rangeNm: 27 },
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
];
const FORD_FIT = { class: 'Gerald R. Ford-class aircraft carrier', lengthM: 337, displacementT: 100000, radars: FORD_RADARS, weapons: FORD_WEAPONS };

// Zumwalt-class: the Advanced Gun System is omitted — it has carried no
// usable ammunition since LRLAP procurement was cancelled in 2016, and the
// Navy has been physically removing both AGS mounts since 2023–24 to make
// room for hypersonic-missile tubes, so modeling it as a current weapon
// would misrepresent the ships as fitted today. Conventional Prompt Strike
// (hypersonic) is likewise omitted here — IOC is reported as ~2027, not
// yet fleet-operational, and the only sourced range figure available is
// inferred from the Army's sister LRHW variant rather than a Navy-specific
// number, too speculative for this file's "don't guess" bar.
// https://en.wikipedia.org/wiki/Zumwalt-class_destroyer
const ZUMWALT_RADARS: RadarSystem[] = [{ name: 'AN/SPY-3', type: 'X-band active electronically scanned array multi-function radar', rangeNm: 174 }];
const ZUMWALT_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-162 ESSM', type: 'surface-to-air missile', rangeNm: 27 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'RIM-174 Standard ERAM (SM-6)', type: 'extended-range anti-air / anti-surface missile', rangeNm: 130 },
  { name: 'RUM-139 VL-ASROC', type: 'anti-submarine missile', rangeNm: 11.9 },
  { name: 'Mk 46 Mod 2 Gun Weapon System (30 mm)', type: 'close-in surface/anti-swarm autocannon', rangeNm: 1.1 },
];
const ZUMWALT_FIT = { class: 'Zumwalt-class destroyer', lengthM: 185.9, displacementT: 15907, radars: ZUMWALT_RADARS, weapons: ZUMWALT_WEAPONS };

// Virginia/Seawolf-class: no surface-search radar entry, matching the
// existing Los Angeles-class precedent (submarines rely on sonar, not
// radar, for their primary sensing — neither class's Wikipedia page
// documents a comparable radar fit). Weapon ranges reuse the exact figures
// already sourced for Los Angeles-class (identical physical systems: Mk 48
// ADCAP, Tomahawk Block IV, Harpoon).
// https://en.wikipedia.org/wiki/Virginia-class_submarine
// https://en.wikipedia.org/wiki/Seawolf-class_submarine
const VIRGINIA_WEAPONS: WeaponSystem[] = [
  { name: 'Mk 48 ADCAP torpedo', type: 'heavyweight torpedo', rangeNm: 11 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'UGM-84 Harpoon', type: 'anti-ship missile', rangeNm: 77 },
];
const VIRGINIA_FIT = { class: 'Virginia-class submarine', lengthM: 115, displacementT: 7900, radars: [], weapons: VIRGINIA_WEAPONS };
const SEAWOLF_WEAPONS: WeaponSystem[] = [
  { name: 'Mk 48 ADCAP torpedo', type: 'heavyweight torpedo', rangeNm: 11 },
  { name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 },
  { name: 'UGM-84 Harpoon', type: 'anti-ship missile', rangeNm: 77 },
];
const SEAWOLF_FIT = { class: 'Seawolf-class submarine', lengthM: 108, displacementT: 9138, radars: [], weapons: SEAWOLF_WEAPONS };

// Ohio-class SSBN/SSGN: one shared hull length/displacement figure per the
// class's own Wikipedia infobox (no separate SSBN/SSGN figures given).
// Trident II range (4,000nm) is the figure the class infobox itself cites;
// other sources give payload-dependent figures up to ~6,220nm, so this is
// the conservative baseline, not a single authoritative constant. Tomahawk
// entry reuses the exact range already sourced elsewhere in this file.
// https://en.wikipedia.org/wiki/Ohio-class_submarine
const OHIO_SSBN_WEAPONS: WeaponSystem[] = [{ name: 'UGM-133A Trident II (D5)', type: 'submarine-launched ballistic missile', rangeNm: 4000 }];
const OHIO_SSBN_FIT = { class: 'Ohio-class ballistic missile submarine', lengthM: 170, displacementT: 18750, radars: [], weapons: OHIO_SSBN_WEAPONS };
const OHIO_SSGN_WEAPONS: WeaponSystem[] = [{ name: 'BGM-109 Tomahawk (Block IV)', type: 'land-attack cruise missile', rangeNm: 864 }];
const OHIO_SSGN_FIT = { class: 'Ohio-class guided missile submarine', lengthM: 170, displacementT: 18750, radars: [], weapons: OHIO_SSGN_WEAPONS };

// Wasp-class: AN/SPS-48/49/67 range figures reused from the identical
// systems already sourced elsewhere in this file (Nimitz/America-class);
// RIM-7 Sea Sparrow range from its own Wikipedia page.
// https://en.wikipedia.org/wiki/Wasp-class_amphibious_assault_ship
const WASP_RADARS: RadarSystem[] = [
  { name: 'AN/SPS-48', type: '3D air-search', rangeNm: 250 },
  { name: 'AN/SPS-49', type: '2D air-search', rangeNm: 256 },
  { name: 'AN/SPS-67', type: 'surface-search', rangeNm: 56 },
];
const WASP_WEAPONS: WeaponSystem[] = [
  { name: 'RIM-116 RAM', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'RIM-7 Sea Sparrow', type: 'surface-to-air missile', rangeNm: 10 },
  { name: 'Phalanx CIWS', type: 'close-in weapon system', rangeNm: 0.8 },
  { name: 'Mk 38 25 mm gun', type: 'autocannon', rangeNm: 1.35 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];
const WASP_FIT = { class: 'Wasp-class amphibious assault ship', lengthM: 257, displacementT: 41150, radars: WASP_RADARS, weapons: WASP_WEAPONS };

// Freedom-class: TRS-3D range from its manufacturer (Hensoldt) datasheet;
// TRS-4D (fitted LCS-17 onward) likewise. Weapon ranges from each weapon's
// own Wikipedia page (Bofors 57mm, RIM-116 RAM, AGM-114 Hellfire, Mk44
// Bushmaster II) — the class's onboard 150kW laser is omitted, no sourced
// range figure exists for it.
// https://en.wikipedia.org/wiki/Freedom-class_littoral_combat_ship
const FREEDOM_RADARS: RadarSystem[] = [
  { name: 'TRS-3D', type: 'air/surface-search radar (LCS-1 through LCS-15)', rangeNm: 108 },
  { name: 'TRS-4D rotating (AN/SPS-80)', type: '3D AESA air/surface-search radar (fitted LCS-17 onward)', rangeNm: 135 },
];
const FREEDOM_WEAPONS: WeaponSystem[] = [
  { name: 'Mk 110 57 mm gun', type: 'naval gun', rangeNm: 9.2 },
  { name: 'RIM-116 RAM (Mk 49 launcher)', type: 'surface-to-air missile', rangeNm: 4.86 },
  { name: 'AGM-114L Hellfire (SUW module)', type: 'anti-vessel missile', rangeNm: 5.95 },
  { name: 'Mk44 Bushmaster II 30 mm gun (SUW module)', type: 'autocannon', rangeNm: 1.08 },
  { name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 },
];
const FREEDOM_FIT = { class: 'Freedom-class littoral combat ship', lengthM: 115.2, displacementT: 3500, radars: FREEDOM_RADARS, weapons: FREEDOM_WEAPONS };

// Support/auxiliary classes newly encountered in this pass. No radar
// system is documented for any of the three — genuinely unfitted rather
// than an omission, per each class's own Wikipedia page. Where a weapon
// system is the same physical system already sourced elsewhere in this
// file (M2 .50 cal, Mk 38 25mm), the existing range figure is reused;
// where the source only gave a mount count with no range (e.g. ESB's M2
// .50 cals), the weapon is included using the already-sourced M2 range
// rather than guessing a new one, since it's the identical weapon.
// https://en.wikipedia.org/wiki/USS_Lewis_B._Puller_(ESB-3)
// https://en.wikipedia.org/wiki/Lewis_and_Clark-class_dry_cargo_ship
// https://en.wikipedia.org/wiki/Spearhead-class_expeditionary_fast_transport
const ESB_WEAPONS: WeaponSystem[] = [{ name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 }];
const ESB_FIT = { class: 'Lewis B. Puller-class expeditionary sea base', lengthM: 233, displacementT: 90000, radars: [], weapons: ESB_WEAPONS };
const TAKE_WEAPONS: WeaponSystem[] = [{ name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 }];
const TAKE_FIT = { class: 'Lewis and Clark-class dry cargo/ammunition ship', lengthM: 210, displacementT: 45149, radars: [], weapons: TAKE_WEAPONS };
const EPF_WEAPONS: WeaponSystem[] = [{ name: 'M2 .50 cal machine gun', type: 'machine gun', rangeNm: 0.97 }];
const EPF_FIT = { class: 'Spearhead-class expeditionary fast transport', lengthM: 103, displacementT: 1515, radars: [], weapons: EPF_WEAPONS };

// -- Yokosuka-based hulls: flagship, CSG-5, DESRON 15 (16 total) --------
const YOKOSUKA_COUNT = 16;
const blueRidge = ship('us-7f-flagship', 'USS Blue Ridge (LCC-19)', YOKOSUKA, 0, YOKOSUKA_COUNT, { role: 'Fleet flagship', radars: BLUE_RIDGE_RADARS, weapons: BLUE_RIDGE_WEAPONS });
const csg5Ships: OobDraft[] = [
  ship('us-cvn-73', 'USS George Washington (CVN-73)', YOKOSUKA, 1, YOKOSUKA_COUNT, { role: 'Aircraft carrier · CSG-5 flagship', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS }),
  ship('us-cg-62', 'USS Robert Smalls (CG-62)', YOKOSUKA, 2, YOKOSUKA_COUNT, {
    role: 'Guided-missile cruiser · Navy ordered a homeport shift to San Diego, CA in Mar 2026 (relieved in Japan by DDG-89 Mustin), but as of the latest verified reporting the ship was still operating forward with CSG-5 — the physical move does not appear complete',
    ...TICONDEROGA_FIT,
    sources: [
      { label: 'Navy Times — US Navy rotates last cruiser homeported in Japan to San Diego', url: 'https://www.navytimes.com/news/your-navy/2026/03/12/us-navy-rotates-last-cruiser-homeported-in-japan-to-san-diego/' },
      { label: 'Stars and Stripes — Last Japan-based Navy cruiser', url: 'https://www.stripes.com/branches/navy/2026-03-12/last-japan-based-navy-cruiser-21037031.html' },
    ],
  }),
];
const desron15Ships: OobDraft[] = [
  ship('us-ddg-65', 'USS Benfold (DDG-65)', YOKOSUKA, 3, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-69', 'USS Milius (DDG-69)', YOKOSUKA, 4, YOKOSUKA_COUNT, { status: 'OBSCURED', ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-76', 'USS Higgins (DDG-76)', YOKOSUKA, 5, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-83', 'USS Howard (DDG-83)', YOKOSUKA, 6, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-85', 'USS McCampbell (DDG-85)', YOKOSUKA, 7, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-86', 'USS Shoup (DDG-86)', YOKOSUKA, 8, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-88', 'USS Preble (DDG-88)', YOKOSUKA, 9, YOKOSUKA_COUNT, { status: 'UNKNOWN', ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-105', 'USS Dewey (DDG-105)', YOKOSUKA, 10, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-113', 'USS John Finn (DDG-113)', YOKOSUKA, 11, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-114', 'USS Ralph Johnson (DDG-114)', YOKOSUKA, 12, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-115', 'USS Rafael Peralta (DDG-115)', YOKOSUKA, 13, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-63', 'USS Stethem (DDG-63)', YOKOSUKA, 14, YOKOSUKA_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-89', 'USS Mustin (DDG-89)', YOKOSUKA, 15, YOKOSUKA_COUNT, {
    role: 'Relieved USS Robert Smalls in forward-deployed Japan rotation, Mar 2026',
    ...ARLEIGH_BURKE_FIT,
    sources: [{ label: 'Navy Times — US Navy rotates last cruiser homeported in Japan to San Diego', url: 'https://www.navytimes.com/news/your-navy/2026/03/12/us-navy-rotates-last-cruiser-homeported-in-japan-to-san-diego/' }],
  }),
];

// -- Sasebo-based hulls: TF-76 amphibious force (9 total) ----------------
const SASEBO_COUNT = 9;
const tf76Ships: OobDraft[] = [
  ship('us-lha-6', 'USS America (LHA-6)', SASEBO, 0, SASEBO_COUNT, { radars: AMERICA_LHA_RADARS, weapons: AMERICA_LHA_WEAPONS }),
  ship('us-lpd-18', 'USS New Orleans (LPD-18)', SASEBO, 1, SASEBO_COUNT, { radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS }),
  ship('us-lpd-20', 'USS Green Bay (LPD-20)', SASEBO, 2, SASEBO_COUNT, { radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS }),
  ship('us-lsd-47', 'USS Rushmore (LSD-47)', SASEBO, 3, SASEBO_COUNT, { radars: WHIDBEY_ISLAND_RADARS, weapons: WHIDBEY_ISLAND_WEAPONS }),
  ship('us-lsd-48', 'USS Ashland (LSD-48)', SASEBO, 4, SASEBO_COUNT, { radars: WHIDBEY_ISLAND_RADARS, weapons: WHIDBEY_ISLAND_WEAPONS }),
  ship('us-mcm-7', 'USS Patriot (MCM-7)', SASEBO, 5, SASEBO_COUNT, { radars: AVENGER_MCM_RADARS, weapons: AVENGER_MCM_WEAPONS }),
  ship('us-mcm-9', 'USS Pioneer (MCM-9)', SASEBO, 6, SASEBO_COUNT, { radars: AVENGER_MCM_RADARS, weapons: AVENGER_MCM_WEAPONS }),
  ship('us-mcm-10', 'USS Warrior (MCM-10)', SASEBO, 7, SASEBO_COUNT, { radars: AVENGER_MCM_RADARS, weapons: AVENGER_MCM_WEAPONS }),
  ship('us-mcm-14', 'USS Chief (MCM-14)', SASEBO, 8, SASEBO_COUNT, { status: 'MISIDENTIFIED', radars: AVENGER_MCM_RADARS, weapons: AVENGER_MCM_WEAPONS }),
];

// Tripoli ARG / PHIBRON 11 — a second Sasebo-based amphibious ready group,
// distinct from the existing tf76Ships flat list above (which represents
// the pre-existing America ARG). Added as its own group so the two ARGs
// stay distinguishable rather than merging into one undifferentiated list.
const TRIPOLI_ARG_COUNT = 2;
const tripoliArgShips: OobDraft[] = [
  ship('us-lha-7', 'USS Tripoli (LHA-7)', SASEBO, 0, TRIPOLI_ARG_COUNT, {
    role: 'Amphibious assault ship · Tripoli ARG flagship',
    radars: AMERICA_LHA_RADARS,
    weapons: AMERICA_LHA_WEAPONS,
    sources: [
      { label: 'Stars and Stripes — America LHA-6 homeport shift to San Diego', url: 'https://www.stripes.com/branches/navy/2025-09-25/uss-america-new-homeport-california-19221487.html' },
      { label: 'PACOM — PHIBRON 11 commodore / Tripoli ARG', url: 'https://www.pacom.mil/Media/News/Article/2040185/lebron-takes-over-as-amphibious-squadron-11-commodore/' },
    ],
  }),
  ship('us-lpd-22', 'USS San Diego (LPD-22)', SASEBO, 1, TRIPOLI_ARG_COUNT, {
    role: 'Amphibious transport dock · Tripoli ARG',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'PACOM — USS San Diego forward-deploys to Sasebo, Japan', url: 'https://www.pacom.mil/Media/News/News-Article-View/Article/3911979/uss-san-diego-forward-deploys-to-sasebo-japan/' }],
  }),
];

// -- Guam-based hulls: submarine tenders (2) + Submarine Squadron 15 (6) --
const GUAM_COUNT = 2;
const guamShips: OobDraft[] = [
  ship('us-as-39', 'USS Emory S. Land (AS-39)', GUAM, 0, GUAM_COUNT, { role: 'Submarine tender', radars: EMORY_LAND_AS_RADARS, weapons: EMORY_LAND_AS_WEAPONS }),
  ship('us-as-40', 'USS Frank Cable (AS-40)', GUAM, 1, GUAM_COUNT, { role: 'Submarine tender', radars: EMORY_LAND_AS_RADARS, weapons: EMORY_LAND_AS_WEAPONS }),
];
const SUBRON15_COUNT = 6;
const SUBRON15_SOURCE = { label: 'Wikipedia — Submarine Squadron 15', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_15' };
const subron15Ships: OobDraft[] = [
  ship('us-ssn-722', 'USS Key West (SSN-722)', GUAM, 0, SUBRON15_COUNT, { role: 'Attack submarine', status: 'OBSCURED', radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS }),
  ship('us-ssn-760', 'USS Annapolis (SSN-760)', GUAM, 1, SUBRON15_COUNT, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON15_SOURCE] }),
  ship('us-ssn-758', 'USS Asheville (SSN-758)', GUAM, 2, SUBRON15_COUNT, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON15_SOURCE] }),
  ship('us-ssn-759', 'USS Jefferson City (SSN-759)', GUAM, 3, SUBRON15_COUNT, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON15_SOURCE] }),
  ship('us-ssn-761', 'USS Springfield (SSN-761)', GUAM, 4, SUBRON15_COUNT, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON15_SOURCE] }),
  ship('us-ssn-783', 'USS Minnesota (SSN-783)', GUAM, 5, SUBRON15_COUNT, { ...VIRGINIA_FIT, sources: [SUBRON15_SOURCE] }),
];

// -- Second, Third, Fourth, Fifth & Sixth Fleet hulls & contacts ---------
// Sourced from Wikipedia (Category:Fleets of the United States Navy and
// each fleet's own article). Unlike Seventh Fleet, most numbered fleets are
// "force provider" headquarters with no permanently assigned hulls — task
// forces are listed as pure organization nodes (no children) where the
// source confirms no standing assignment, rather than inventing ships.
const POINT_LOMA = { lng: -117.24, lat: 32.68 };
const BAHRAIN = { lng: 50.61, lat: 26.21 };
const GAETA = { lng: 13.57, lat: 41.22 };
const ROTA = { lng: -6.35, lat: 36.62 };

// Additional homeports needed for the wider fleet-wide OOB pass (carriers,
// cruisers, destroyers, submarines, amphibs, LCS, support ships) sourced
// from https://en.wikipedia.org/wiki/List_of_current_ships_of_the_United_States_Navy
// and each hull's own Wikipedia article — see the `sources` entry on each
// ship() call below for the specific citation used for ITS command
// assignment (homeport alone is rarely disputed; command assignment is
// what actually required per-hull research).
const NORFOLK = { lng: -76.33, lat: 36.94 };
const LITTLE_CREEK = { lng: -76.19, lat: 36.92 };
const MAYPORT = { lng: -81.41, lat: 30.4 };
const PEARL_HARBOR = { lng: -157.96, lat: 21.35 };
const EVERETT = { lng: -122.22, lat: 47.98 };
const BANGOR = { lng: -122.73, lat: 47.75 };
const BREMERTON = { lng: -122.63, lat: 47.56 };
const GROTON = { lng: -72.09, lat: 41.38 };
const KITTERY = { lng: -70.72, lat: 43.08 };
const KINGS_BAY = { lng: -81.68, lat: 30.8 };

// -- Third Fleet: Carrier Strike Groups 1/3/9/11 ------------------------
const csg1Ships: OobDraft[] = [
  ship('us-cvn-70', 'USS Carl Vinson (CVN-70)', POINT_LOMA, 0, 2, { role: 'Aircraft carrier · CSG-1 flagship · one of several San Diego-homeported carriers rotating through Pacific Fleet strike groups (not permanently Third Fleet)', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS }),
  ship('us-cg-71', 'USS Cape St. George (CG-71)', POINT_LOMA, 1, 2, {
    role: 'Guided-missile cruiser',
    ...TICONDEROGA_FIT,
    sources: [
      { label: 'DVIDS — Carrier Strike Group 1 welcomes new commander', url: 'https://www.dvidshub.net/news/557532/carrier-strike-group-1-welcomes-new-commander' },
      { label: 'Commander, U.S. Third Fleet — Carrier Strike Group 1', url: 'https://www.c3f.navy.mil/' },
    ],
  }),
];
const csg3Ships: OobDraft[] = [
  ship('us-cvn-72', 'USS Abraham Lincoln (CVN-72)', POINT_LOMA, 0, 1, { role: 'Aircraft carrier · CSG-3 flagship', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS, sources: [{ label: 'Wikipedia — Carrier Strike Group 3', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_3' }] }),
];
const csg9Ships: OobDraft[] = [
  ship('us-cvn-71', 'USS Theodore Roosevelt (CVN-71)', POINT_LOMA, 0, 1, {
    role: 'Aircraft carrier · CSG-9 flagship',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [
      { label: 'Wikipedia — Carrier Strike Group 9', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_9' },
      { label: 'DVIDS — Carrier Strike Group 9 holds change of command', url: 'https://www.dvidshub.net/news/printable/568526' },
    ],
  }),
];
// Nimitz is mid-decommissioning transit (departed Bremerton Mar 2026, new
// homeport Norfolk ahead of ~Mar 2027 decommissioning) — positioned at its
// actual current location rather than a Pacific homeport, even though
// CSG-11 is nominally Third Fleet, since that's genuinely where it is now.
const csg11Ships: OobDraft[] = [
  ship('us-cvn-68', 'USS Nimitz (CVN-68)', NORFOLK, 0, 1, {
    role: 'Aircraft carrier · CSG-11 · in transit to Norfolk ahead of decommissioning (extended to ~Mar 2027); atypical, not a stable homeport assignment',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [
      { label: 'USNI News — Navy extends USS Nimitz service life to 2027', url: 'https://news.usni.org/2026/03/14/navy-extends-uss-nimitz-service-life-to-2027-in-line-with-carrier-john-f-kennedys-delivery' },
      { label: 'Navy.mil — USS Nimitz concludes Southern Seas 2026 deployment', url: 'https://www.navy.mil/Press-Office/News-Stories/display-news/Article/4519997/uss-nimitz-concludes-southern-seas-2026-deployment/' },
      { label: 'Wikipedia — Carrier Strike Group 11', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_11' },
    ],
  }),
];

// -- Third Fleet: Destroyer Squadrons 1, 9, 21, 23, 31 -------------------
const DESRON9_SOURCE = { label: 'Wikipedia — List of current ships of the United States Navy (Everett, WA homeport)', url: 'https://en.wikipedia.org/wiki/List_of_current_ships_of_the_United_States_Navy' };
const desron9Ships: OobDraft[] = [
  ship('us-ddg-52', 'USS Barry (DDG-52)', EVERETT, 0, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
  ship('us-ddg-53', 'USS John Paul Jones (DDG-53)', EVERETT, 1, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
  ship('us-ddg-56', 'USS John S. McCain (DDG-56)', EVERETT, 2, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
  ship('us-ddg-100', 'USS Kidd (DDG-100)', EVERETT, 3, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
  ship('us-ddg-101', 'USS Gridley (DDG-101)', EVERETT, 4, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
  ship('us-ddg-102', 'USS Sampson (DDG-102)', EVERETT, 5, 6, { ...ARLEIGH_BURKE_FIT, sources: [DESRON9_SOURCE] }),
];
const DESRON1_SOURCE = { label: 'Wikipedia — Destroyer Squadron 1', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_1' };
const desron1Ships: OobDraft[] = [
  ship('us-ddg-104', 'USS Sterett (DDG-104)', POINT_LOMA, 0, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON1_SOURCE] }),
  ship('us-ddg-110', 'USS William P. Lawrence (DDG-110)', POINT_LOMA, 1, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON1_SOURCE] }),
];
const DESRON21_SOURCE = { label: 'currentops.com — DESRON 21', url: 'https://currentops.com/unit/us/usn/desron-21' };
const desron21Ships: OobDraft[] = [
  ship('us-ddg-73', 'USS Decatur (DDG-73)', POINT_LOMA, 0, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON21_SOURCE] }),
  ship('us-ddg-108', 'USS Wayne E. Meyer (DDG-108)', POINT_LOMA, 1, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON21_SOURCE] }),
];
const DESRON23_SOURCE = { label: 'Wikipedia — Destroyer Squadron 23', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_23' };
const desron23Ships: OobDraft[] = [
  ship('us-ddg-59', 'USS Russell (DDG-59)', POINT_LOMA, 0, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON23_SOURCE] }),
  ship('us-ddg-91', 'USS Pinckney (DDG-91)', POINT_LOMA, 1, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON23_SOURCE] }),
];
const DESRON31_SOURCE = { label: 'currentops.com — DESRON 31', url: 'https://currentops.com/unit/us/usn/desron-31' };
const desron31Ships: OobDraft[] = [
  ship('us-ddg-60', 'USS Paul Hamilton (DDG-60)', PEARL_HARBOR, 0, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-70', 'USS Hopper (DDG-70)', PEARL_HARBOR, 1, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-77', 'USS O’Kane (DDG-77)', PEARL_HARBOR, 2, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-90', 'USS Chafee (DDG-90)', PEARL_HARBOR, 3, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-93', 'USS Chung-Hoon (DDG-93)', PEARL_HARBOR, 4, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-97', 'USS Halsey (DDG-97)', PEARL_HARBOR, 5, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
  ship('us-ddg-112', 'USS Michael Murphy (DDG-112)', PEARL_HARBOR, 6, 7, { ...ARLEIGH_BURKE_FIT, sources: [DESRON31_SOURCE] }),
];

// -- Third Fleet: Submarine Squadrons 1, 7, 11 & Development Squadron 5 --
const SUBRON1_SOURCE = { label: 'Wikipedia — Submarine Squadron 1', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_1' };
const subron1Ships: OobDraft[] = [
  ship('us-ssn-776', 'USS Hawaii (SSN-776)', PEARL_HARBOR, 0, 5, { ...VIRGINIA_FIT, sources: [SUBRON1_SOURCE] }),
  ship('us-ssn-777', 'USS North Carolina (SSN-777)', PEARL_HARBOR, 1, 5, { ...VIRGINIA_FIT, sources: [SUBRON1_SOURCE] }),
  ship('us-ssn-782', 'USS Mississippi (SSN-782)', PEARL_HARBOR, 2, 5, { ...VIRGINIA_FIT, sources: [SUBRON1_SOURCE] }),
  ship('us-ssn-786', 'USS Illinois (SSN-786)', PEARL_HARBOR, 3, 5, { ...VIRGINIA_FIT, sources: [SUBRON1_SOURCE] }),
  ship('us-ssn-792', 'USS Vermont (SSN-792)', PEARL_HARBOR, 4, 5, { ...VIRGINIA_FIT, sources: [SUBRON1_SOURCE] }),
];
const SUBRON7_SOURCE = { label: 'Wikipedia — Submarine Squadron 7', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_7' };
const subron7Ships: OobDraft[] = [
  ship('us-ssn-766', 'USS Charlotte (SSN-766)', PEARL_HARBOR, 0, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-771', 'USS Columbia (SSN-771)', PEARL_HARBOR, 1, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-762', 'USS Columbus (SSN-762)', PEARL_HARBOR, 2, 8, {
    role: 'Attack submarine · master roster lists Norfolk, VA as homeport, but the ship’s own Wikipedia article and Commander, Submarine Force Pacific both state Pearl Harbor / SUBRON 7 — placed per the more specific/authoritative sources',
    radars: LOS_ANGELES_SSN_RADARS,
    weapons: LOS_ANGELES_SSN_WEAPONS,
    sources: [
      { label: 'USS Columbus (SSN-762) — Wikipedia', url: 'https://en.wikipedia.org/wiki/USS_Columbus_(SSN-762)' },
      { label: 'Commander, Submarine Force Pacific — USS Columbus', url: 'https://www.csp.navy.mil/columbus/CO/' },
    ],
  }),
  ship('us-ssn-769', 'USS Toledo (SSN-769)', PEARL_HARBOR, 3, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-770', 'USS Tucson (SSN-770)', PEARL_HARBOR, 4, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-780', 'USS Missouri (SSN-780)', PEARL_HARBOR, 5, 8, { ...VIRGINIA_FIT, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-788', 'USS Colorado (SSN-788)', PEARL_HARBOR, 6, 8, { ...VIRGINIA_FIT, sources: [SUBRON7_SOURCE] }),
  ship('us-ssn-789', 'USS Indiana (SSN-789)', PEARL_HARBOR, 7, 8, { ...VIRGINIA_FIT, sources: [SUBRON7_SOURCE] }),
];
const SUBRON11_SOURCE = { label: 'Wikipedia — Submarine Squadron 11', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_11' };
const subron11Ships: OobDraft[] = [
  ship('us-ssn-772', 'USS Greeneville (SSN-772)', POINT_LOMA, 0, 4, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON11_SOURCE] }),
  ship('us-ssn-767', 'USS Hampton (SSN-767)', POINT_LOMA, 1, 4, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON11_SOURCE] }),
  ship('us-ssn-763', 'USS Santa Fe (SSN-763)', POINT_LOMA, 2, 4, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON11_SOURCE] }),
  ship('us-ssn-756', 'USS Scranton (SSN-756)', POINT_LOMA, 3, 4, { role: 'Attack submarine · decommissioning scheduled 2026', radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON11_SOURCE] }),
];
const DEVRON5_SOURCE = { label: 'Commander, Submarine Force Pacific — USS Seawolf', url: 'https://www.csp.navy.mil/seawolf/' };
const devron5Ships: OobDraft[] = [
  ship('us-ssn-21', 'USS Seawolf (SSN-21)', BANGOR, 0, 3, { ...SEAWOLF_FIT, sources: [DEVRON5_SOURCE] }),
  ship('us-ssn-22', 'USS Connecticut (SSN-22)', BANGOR, 1, 3, { ...SEAWOLF_FIT, sources: [DEVRON5_SOURCE] }),
  ship('us-ssn-23', 'USS Jimmy Carter (SSN-23)', BANGOR, 2, 3, { ...SEAWOLF_FIT, sources: [DEVRON5_SOURCE] }),
];

// -- Third Fleet: Littoral Combat Ship Squadron One (San Diego) ---------
const LCSRON1_SOURCE = { label: 'Wikipedia — Naval Base San Diego (Littoral Combat Ships)', url: 'https://en.wikipedia.org/wiki/Naval_Base_San_Diego#Littoral_Combat_Ships' };
const lcsron1Ships: OobDraft[] = [
  ship('us-lcs-6', 'USS Jackson (LCS-6)', POINT_LOMA, 0, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Jackson (LCS-6)', url: 'https://en.wikipedia.org/wiki/USS_Jackson_(LCS-6)' }] }),
  ship('us-lcs-8', 'USS Montgomery (LCS-8)', POINT_LOMA, 1, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Montgomery (LCS-8)', url: 'https://en.wikipedia.org/wiki/USS_Montgomery_(LCS-8)' }] }),
  ship('us-lcs-10', 'USS Gabrielle Giffords (LCS-10)', POINT_LOMA, 2, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Gabrielle Giffords', url: 'https://en.wikipedia.org/wiki/USS_Gabrielle_Giffords' }] }),
  ship('us-lcs-12', 'USS Omaha (LCS-12)', POINT_LOMA, 3, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Omaha (LCS-12)', url: 'https://en.wikipedia.org/wiki/USS_Omaha_(LCS-12)' }] }),
  ship('us-lcs-14', 'USS Manchester (LCS-14)', POINT_LOMA, 4, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Manchester (LCS-14)', url: 'https://en.wikipedia.org/wiki/USS_Manchester_(LCS-14)' }] }),
  ship('us-lcs-18', 'USS Charleston (LCS-18)', POINT_LOMA, 5, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Charleston (LCS-18)', url: 'https://en.wikipedia.org/wiki/USS_Charleston_(LCS-18)' }] }),
  ship('us-lcs-20', 'USS Cincinnati (LCS-20)', POINT_LOMA, 6, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Cincinnati (LCS-20)', url: 'https://en.wikipedia.org/wiki/USS_Cincinnati_(LCS-20)' }] }),
  ship('us-lcs-22', 'USS Kansas City (LCS-22)', POINT_LOMA, 7, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [{ label: 'Wikipedia — USS Kansas City (LCS-22)', url: 'https://en.wikipedia.org/wiki/USS_Kansas_City_(LCS-22)' }] }),
  ship('us-lcs-24', 'USS Oakland (LCS-24)', POINT_LOMA, 8, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON1_SOURCE] }),
  ship('us-lcs-26', 'USS Mobile (LCS-26)', POINT_LOMA, 9, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON1_SOURCE] }),
  ship('us-lcs-28', 'USS Savannah (LCS-28)', POINT_LOMA, 10, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON1_SOURCE] }),
  ship('us-lcs-34', 'USS Augusta (LCS-34)', POINT_LOMA, 11, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON1_SOURCE] }),
  ship('us-lcs-36', 'USS Kingsville (LCS-36)', POINT_LOMA, 12, 14, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON1_SOURCE] }),
  ship('us-lcs-38', 'USS Pierre (LCS-38)', POINT_LOMA, 13, 14, {
    radars: INDEPENDENCE_LCS_RADARS,
    weapons: INDEPENDENCE_LCS_WEAPONS,
    sources: [{ label: 'Stars and Stripes — Navy commissions USS Pierre', url: 'https://www.stripes.com/branches/navy/2025-11-15/navy-commissions-uss-pierre-19773603.html' }, LCSRON1_SOURCE],
  }),
];

// -- Third Fleet: Amphibious Ready Groups (Essex, Boxer, Makin Island) --
const essexArgShips: OobDraft[] = [
  ship('us-lhd-2', 'USS Essex (LHD-2)', POINT_LOMA, 0, 2, {
    role: 'Amphibious assault ship · Essex ARG flagship, 15th MEU',
    ...WASP_FIT,
    sources: [{ label: 'USNI News — RIMPAC 2026 kicks off in Hawaii', url: 'https://news.usni.org/2026/06/25/rimpac-2026-kicks-off-in-hawaii' }],
  }),
  ship('us-lpd-23', 'USS Anchorage (LPD-23)', POINT_LOMA, 1, 2, { role: 'Amphibious transport dock · Essex ARG', radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS, sources: [{ label: 'USNI News — RIMPAC 2026 kicks off in Hawaii', url: 'https://news.usni.org/2026/06/25/rimpac-2026-kicks-off-in-hawaii' }] }),
];
const boxerArgShips: OobDraft[] = [
  ship('us-lhd-4', 'USS Boxer (LHD-4)', POINT_LOMA, 0, 3, {
    role: 'Amphibious assault ship · Boxer ARG flagship, 11th MEU',
    ...WASP_FIT,
    sources: [
      { label: 'Stars and Stripes — Boxer ARG / 11th MEU in Hawaii', url: 'https://www.stripes.com/branches/navy/2026-03-31/uss-boxer-11th-meu-hawaii-21240757.html' },
      { label: 'Army Recognition — Boxer ARG sent to Middle East', url: 'https://www.armyrecognition.com/news/navy-news/2026/u-s-navy-sends-uss-boxer-amphibious-ready-group-to-middle-east-as-regional-tensions-rise' },
    ],
  }),
  ship('us-lpd-27', 'USS Portland (LPD-27)', POINT_LOMA, 1, 3, {
    role: 'Amphibious transport dock · Boxer ARG',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'Army Recognition — Boxer ARG sent to Middle East', url: 'https://www.armyrecognition.com/news/navy-news/2026/u-s-navy-sends-uss-boxer-amphibious-ready-group-to-middle-east-as-regional-tensions-rise' }],
  }),
  ship('us-lsd-45', 'USS Comstock (LSD-45)', POINT_LOMA, 2, 3, {
    role: 'Dock landing ship · Boxer ARG',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'Army Recognition — Boxer ARG sent to Middle East', url: 'https://www.armyrecognition.com/news/navy-news/2026/u-s-navy-sends-uss-boxer-amphibious-ready-group-to-middle-east-as-regional-tensions-rise' }],
  }),
];
const makinIslandArgShips: OobDraft[] = [
  ship('us-lhd-8', 'USS Makin Island (LHD-8)', POINT_LOMA, 0, 2, {
    role: 'Amphibious assault ship · Makin Island ARG flagship, 13th MEU',
    ...WASP_FIT,
    sources: [{ label: 'Marines.mil — 13th MEU / PHIBRON 7 training aboard Makin Island', url: 'https://www.marines.mil/News/News-Display/Article/4398446/onboard-uss-makin-island-13th-meu-and-phibron-7-strengthen-navy-marine-corps-in/' }],
  }),
  ship('us-lpd-26', 'USS John P. Murtha (LPD-26)', POINT_LOMA, 1, 2, {
    role: 'Amphibious transport dock · Makin Island ARG',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'Militarynews.com — USS John P. Murtha underway', url: 'https://www.militarynews.com/norfolk-navy-flagship/news/top_stories/amphibious-transport-dock-uss-john-p-murtha-lpd-26-is-underway-in-the-u-s/article_b4756beb-304d-4bba-b9f3-a313f7f96b68.html' }],
  }),
];
const phibron1Ships: OobDraft[] = [
  ship('us-lsd-52', 'USS Pearl Harbor (LSD-52)', POINT_LOMA, 0, 1, {
    role: 'Dock landing ship · Amphibious Squadron 1 (specific ARG pairing not confirmed)',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'Naval Surface Force Pacific — USS Pearl Harbor (LSD-52)', url: 'https://www.surfpac.navy.mil/Ships/USS-Pearl-Harbor-LSD-52/About/' }],
  }),
];

// Santa Barbara was originally placed under Task Force 59 (unmanned &
// innovation); corrected to Task Force 55 during the fleet-wide sourcing
// pass — every source found for the Bahrain MCM-package LCS trio (Santa
// Barbara, Tulsa, Canberra) describes them as replacing the Avenger-class
// MCM ships that served in TF-55, not TF-59.
const TF55_LCS_SOURCE = [
  { label: 'USNI News — First littoral combat ship with MCM mission package arrives in Bahrain', url: 'https://news.usni.org/2025/05/28/first-littoral-combat-ship-with-mcm-mission-package-arrives-in-bahrain' },
  { label: 'Naval News — "Combat ineffective" littoral combat ships are replacing MCM ships in Bahrain', url: 'https://www.navalnews.com/naval-news/2025/09/combat-ineffective-littoral-combat-ships-are-replacing-mcm-ships-in-bahrain/' },
];

// -- Expeditionary Sea Base ships (Lewis B. Puller-class) -----------------
// Unlike the T-AKE/EPF support ships (see undeterminedShips, further
// down), all 4 ESB hulls have a real, sourced command assignment — placed
// under their respective fleets/task forces rather than Undetermined.
const esbLewisBPuller = ship('us-esb-3', 'USS Lewis B. Puller (ESB-3)', BAHRAIN, 0, 1, {
  role: 'Expeditionary sea base · Task Force 51 (Naval Amphibious Force / 5th MEB)',
  ...ESB_FIT,
  sources: [
    { label: 'Wikipedia — USS Lewis B. Puller (ESB-3)', url: 'https://en.wikipedia.org/wiki/USS_Lewis_B._Puller_(ESB-3)' },
    { label: 'Task Force 515 — 5th MEB practices command and control', url: 'https://www.tf515.marines.mil/News/News-Article-Display/Article/3328376/task-force-515th-marine-expeditionary-brigade-practices-command-and-control-fro/' },
  ],
});
const esbHershelWoodyWilliams = ship('us-esb-4', 'USS Hershel "Woody" Williams (ESB-4)', NORFOLK, 0, 1, {
  role: 'Expeditionary sea base · administrative homeport Norfolk since Apr 2025 (returned from ~5 years forward-deployed to Souda Bay, Greece); operationally assigned to Task Force 63',
  ...ESB_FIT,
  sources: [
    { label: 'GlobalSecurity.org — USS Hershel Woody Williams homeport shift', url: 'https://www.globalsecurity.org/military/library/news/2025/04/mil-250410-usn01.htm' },
    { label: 'Seapower Magazine — USS Hershel Woody Williams shifts homeport', url: 'https://seapowermagazine.org/uss-hershel-woody-williams-shifts-homeport-to-greece/' },
  ],
});
const SAIPAN = { lng: 145.75, lat: 15.18 };
const esbMiguelKeith = ship('us-esb-5', 'USS Miguel Keith (ESB-5)', SAIPAN, 0, 2, {
  role: 'Expeditionary sea base · Task Force 76 / Expeditionary Strike Group 7 / PHIBRON 11 · forward-deployed Saipan, Northern Mariana Islands',
  ...ESB_FIT,
  sources: [{ label: 'Navy.mil — CTF 76 embarks USS Miguel Keith to command and control', url: 'https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2918525/commander-task-force-seventy-six-ctf-76-embarks-uss-miguel-keith-to-command-and/' }],
});
const esbJohnLCanley = ship('us-esb-6', 'USS John L. Canley (ESB-6)', SAIPAN, 1, 2, {
  role: 'Expeditionary sea base · Task Force 76 · administrative homeport San Diego, operates forward-deployed from Saipan',
  ...ESB_FIT,
  sources: [{ label: 'DVIDS — CTF 76 / 1st MAW visit USS John L. Canley', url: 'https://www.dvidshub.net/image/8884378/ctf-76-1st-maw-visit-uss-john-l-canley-esb-6' }],
});

const fifthFleetShips: OobDraft[] = [
  ship('us-ddg-103', 'USS Truxtun (DDG-103)', BAHRAIN, 0, 5, { role: 'Guided-missile destroyer', ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-119', 'USS Delbert D. Black (DDG-119)', BAHRAIN, 1, 5, { role: 'Guided-missile destroyer · Task Force 55', ...ARLEIGH_BURKE_FIT }),
  ship('us-lcs-32', 'USS Santa Barbara (LCS-32)', BAHRAIN, 2, 5, { role: 'Littoral combat ship, MCM mission package · Task Force 55', radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: TF55_LCS_SOURCE }),
  ship('us-lcs-16', 'USS Tulsa (LCS-16)', BAHRAIN, 3, 5, { role: 'Littoral combat ship, MCM mission package · Task Force 55', radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: TF55_LCS_SOURCE }),
  ship('us-lcs-30', 'USS Canberra (LCS-30)', BAHRAIN, 4, 5, {
    role: 'Littoral combat ship, MCM mission package · Task Force 55',
    radars: INDEPENDENCE_LCS_RADARS,
    weapons: INDEPENDENCE_LCS_WEAPONS,
    sources: [{ label: 'Wikipedia — USS Canberra (LCS-30)', url: 'https://en.wikipedia.org/wiki/USS_Canberra_(LCS-30)' }, ...TF55_LCS_SOURCE],
  }),
];

const mountWhitney = ship('us-lcc-20', 'USS Mount Whitney (LCC-20)', GAETA, 0, 1, { role: 'Fleet flagship', radars: BLUE_RIDGE_RADARS, weapons: BLUE_RIDGE_WEAPONS });
const desron60Ships: OobDraft[] = [
  ship('us-ddg-51', 'USS Arleigh Burke (DDG-51)', ROTA, 0, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-75', 'USS Donald Cook (DDG-75)', ROTA, 1, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-79', 'USS Oscar Austin (DDG-79)', ROTA, 2, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-80', 'USS Roosevelt (DDG-80)', ROTA, 3, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-84', 'USS Bulkeley (DDG-84)', ROTA, 4, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-117', 'USS Paul Ignatius (DDG-117)', ROTA, 5, 8, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-71', 'USS Ross (DDG-71)', ROTA, 6, 8, { ...ARLEIGH_BURKE_FIT, sources: [{ label: 'Wikipedia — Destroyer Squadron 60', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_60' }] }),
  ship('us-ddg-78', 'USS Porter (DDG-78)', ROTA, 7, 8, { ...ARLEIGH_BURKE_FIT, sources: [{ label: 'Wikipedia — Destroyer Squadron 60', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_60' }] }),
];

// -- Unidentified contacts ------------------------------------------------
// See ContactParametrics / the "contact" OobKind above: these are real
// positions of interest within a fleet's AOR where something is being
// actively tracked but has not been positively identified. Each carries
// only the parametric fields a plausible collection method would actually
// produce — never a full profile — so the IDENTIFY tab has genuine partial
// data to filter against.
const giukContact = contact('us-2f-contact-01', 'Surface Contact GIUK-04', -20.1, 63.4, 'Submerged/surfaced contact, GIUK gap', {
  radarBand: 'I-band (intermittent, surfaced/snorkel)',
  firstDetected: '170614Z',
});
const caribbeanContact = contact('us-4f-contact-01', 'Surface Contact CARIB-11', -74.6, 12.1, 'Low-freeboard contact, eastern Caribbean transit corridor', {
  estimatedLengthM: 18,
  observedFlag: 'None observed',
  firstDetected: '180922Z',
});
const hormuzContact = contact('us-5f-contact-01', 'Surface Contact HORMUZ-02', 56.3, 26.55, 'Small craft shadowing traffic, Strait of Hormuz approaches', {
  estimatedLengthM: 95,
  radarBand: 'X-band',
  lastPortVisited: 'Bandar Abbas, Iran',
  firstDetected: '190147Z',
});
const easternMedContact = contact('us-6f-contact-01', 'Surface Contact EASTMED-07', 35.4, 34.6, 'Combatant-profile contact, eastern Mediterranean approaches to Tartus', {
  estimatedLengthM: 156,
  radarBand: 'E/F-band',
  firstDetected: '160259Z',
});

// -- Second Fleet: Carrier Strike Groups 2, 8, 10 & 12 -------------------
const csg2Ships: OobDraft[] = [
  ship('us-cvn-69', 'USS Dwight D. Eisenhower (CVN-69)', NORFOLK, 0, 1, {
    role: 'Aircraft carrier · CSG-2 flagship',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [{ label: 'Wikipedia — Carrier Strike Group 2', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_2' }],
  }),
];
const CSG8_SOURCE = { label: 'Commander, U.S. 2nd Fleet — Carrier Strike Group 8', url: 'https://www.c2f.usff.navy.mil/csg8/' };
const csg8Ships: OobDraft[] = [
  ship('us-cvn-75', 'USS Harry S. Truman (CVN-75)', NORFOLK, 0, 2, { role: 'Aircraft carrier · CSG-8 flagship', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS, sources: [CSG8_SOURCE] }),
  ship('us-cg-64', 'USS Gettysburg (CG-64)', NORFOLK, 1, 2, {
    role: 'Guided-missile cruiser',
    ...TICONDEROGA_FIT,
    sources: [
      { label: 'USNI News — Gettysburg back in Norfolk after 5 months in SOUTHCOM', url: 'https://news.usni.org/2026/03/24/uss-gettysburg-back-in-norfolk-after-5-months-in-southcom' },
      CSG8_SOURCE,
    ],
  }),
];
const csg10Ships: OobDraft[] = [
  ship('us-cvn-77', 'USS George H.W. Bush (CVN-77)', NORFOLK, 0, 1, {
    role: 'Aircraft carrier · CSG-10 flagship',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [
      { label: 'Wikipedia — Carrier Strike Group 10', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_10' },
      { label: 'Commander, U.S. 2nd Fleet — Carrier Strike Group 10', url: 'https://www.c2f.usff.navy.mil/csg10/' },
    ],
  }),
];
const csg12Ships: OobDraft[] = [
  ship('us-cvn-78', 'USS Gerald R. Ford (CVN-78)', NORFOLK, 0, 1, {
    role: 'Aircraft carrier · CSG-12 flagship',
    ...FORD_FIT,
    sources: [
      { label: 'Wikipedia — Carrier Strike Group 12', url: 'https://en.wikipedia.org/wiki/Carrier_Strike_Group_12' },
      { label: 'Commander, U.S. 2nd Fleet — Carrier Strike Group 12', url: 'https://www.c2f.usff.navy.mil/csg12/' },
    ],
  }),
];

// -- Second Fleet: Destroyer Squadrons 2, 22, 26, 28 + Naval Surface -----
// -- Group Southeast (Mayport, successor to Destroyer Squadron 14) -------
const DESRON2_SOURCE = { label: 'Wikipedia — Destroyer Squadron 2', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_2' };
const desron2Ships: OobDraft[] = [
  ship('us-ddg-55', 'USS Stout (DDG-55)', NORFOLK, 0, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON2_SOURCE] }),
  ship('us-ddg-74', 'USS McFaul (DDG-74)', NORFOLK, 1, 2, { ...ARLEIGH_BURKE_FIT, sources: [DESRON2_SOURCE] }),
];
const DESRON22_SOURCE = { label: 'Wikipedia — Destroyer Squadron 22', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_22' };
const desron22Ships: OobDraft[] = [
  ship('us-ddg-57', 'USS Mitscher (DDG-57)', NORFOLK, 0, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON22_SOURCE] }),
  ship('us-ddg-58', 'USS Laboon (DDG-58)', NORFOLK, 1, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON22_SOURCE] }),
  ship('us-ddg-72', 'USS Mahan (DDG-72)', NORFOLK, 2, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON22_SOURCE] }),
];
const DESRON26_SOURCE = { label: 'Wikipedia — Destroyer Squadron 26', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_26' };
const desron26Ships: OobDraft[] = [
  ship('us-ddg-87', 'USS Mason (DDG-87)', NORFOLK, 0, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON26_SOURCE] }),
  ship('us-ddg-94', 'USS Nitze (DDG-94)', NORFOLK, 1, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON26_SOURCE] }),
  ship('us-ddg-95', 'USS James E. Williams (DDG-95)', NORFOLK, 2, 3, { ...ARLEIGH_BURKE_FIT, sources: [DESRON26_SOURCE] }),
];
const DESRON28_SOURCE = { label: 'Wikipedia — Destroyer Squadron 28', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_28' };
const desron28Ships: OobDraft[] = [
  ship('us-ddg-66', 'USS Gonzalez (DDG-66)', NORFOLK, 0, 5, { ...ARLEIGH_BURKE_FIT, sources: [DESRON28_SOURCE] }),
  ship('us-ddg-67', 'USS Cole (DDG-67)', NORFOLK, 1, 5, { ...ARLEIGH_BURKE_FIT, sources: [DESRON28_SOURCE] }),
  ship('us-ddg-96', 'USS Bainbridge (DDG-96)', NORFOLK, 2, 5, { ...ARLEIGH_BURKE_FIT, sources: [DESRON28_SOURCE] }),
  ship('us-ddg-98', 'USS Forrest Sherman (DDG-98)', NORFOLK, 3, 5, { ...ARLEIGH_BURKE_FIT, sources: [DESRON28_SOURCE] }),
  ship('us-ddg-107', 'USS Gravely (DDG-107)', NORFOLK, 4, 5, { ...ARLEIGH_BURKE_FIT, sources: [DESRON28_SOURCE] }),
];
const NSG_SOUTHEAST_SOURCE = { label: 'Wikipedia — Destroyer Squadron 14 (renamed Naval Surface Group Southeast, 2023)', url: 'https://en.wikipedia.org/wiki/Destroyer_Squadron_14' };
const nsgSoutheastShips: OobDraft[] = [
  ship('us-ddg-64', 'USS Carney (DDG-64)', MAYPORT, 0, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-68', 'USS The Sullivans (DDG-68)', MAYPORT, 1, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-81', 'USS Winston S. Churchill (DDG-81)', MAYPORT, 2, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-82', 'USS Lassen (DDG-82)', MAYPORT, 3, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-99', 'USS Farragut (DDG-99)', MAYPORT, 4, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-109', 'USS Jason Dunham (DDG-109)', MAYPORT, 5, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-116', 'USS Thomas Hudner (DDG-116)', MAYPORT, 6, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
  ship('us-ddg-122', 'USS John Basilone (DDG-122)', MAYPORT, 7, 8, { ...ARLEIGH_BURKE_FIT, sources: [NSG_SOUTHEAST_SOURCE] }),
];

// -- Second Fleet: Submarine Squadrons 2, 4, 6 & 12 -----------------------
const SUBRON2_SOURCE = { label: 'Wikipedia — Submarine Squadron 2', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_2' };
const subron2Ships: OobDraft[] = [
  ship('us-ssn-773', 'USS Cheyenne (SSN-773)', KITTERY, 0, 3, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON2_SOURCE] }),
  ship('us-ssn-784', 'USS North Dakota (SSN-784)', KITTERY, 1, 3, { ...VIRGINIA_FIT, sources: [SUBRON2_SOURCE] }),
  ship('us-ssn-787', 'USS Washington (SSN-787)', KITTERY, 2, 3, { ...VIRGINIA_FIT, sources: [SUBRON2_SOURCE] }),
];
const SUBRON4_SOURCE = { label: 'Wikipedia — Submarine Squadron 4', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_4' };
const subron4Ships: OobDraft[] = [
  ship('us-ssn-774', 'USS Virginia (SSN-774)', GROTON, 0, 9, { ...VIRGINIA_FIT, sources: [SUBRON4_SOURCE] }),
  ship('us-ssn-775', 'USS Texas (SSN-775)', GROTON, 1, 9, { ...VIRGINIA_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssn-781', 'USS California (SSN-781)', GROTON, 2, 9, { ...VIRGINIA_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssn-790', 'USS South Dakota (SSN-790)', GROTON, 3, 9, { ...VIRGINIA_FIT, sources: [SUBRON4_SOURCE] }),
  ship('us-ssn-791', 'USS Delaware (SSN-791)', GROTON, 4, 9, { ...VIRGINIA_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssn-795', 'USS Hyman G. Rickover (SSN-795)', GROTON, 5, 9, { ...VIRGINIA_FIT, sources: [SUBRON4_SOURCE] }),
  ship('us-ssn-797', 'USS Iowa (SSN-797)', GROTON, 6, 9, { ...VIRGINIA_FIT, sources: [SUBRON4_SOURCE] }),
  ship('us-ssn-798', 'USS Massachusetts (SSN-798)', GROTON, 7, 9, {
    role: 'Attack submarine · SUBRON 6’s own Wikipedia page still lists this hull as a pre-commissioning unit awaiting Norfolk homeport, but the master roster shows it already commissioned (28 Mar 2026) and homeported Groton, CT — placed per the more current master-roster source',
    ...VIRGINIA_FIT,
    sources: [WIKI_CURRENT_SHIPS],
  }),
  ship('us-ssn-799', 'USS Idaho (SSN-799)', GROTON, 8, 9, { ...VIRGINIA_FIT, sources: [SUBRON4_SOURCE] }),
];
const SUBRON6_SOURCE = { label: 'Wikipedia — Submarine Squadron 6', url: 'https://en.wikipedia.org/wiki/Submarine_Squadron_6' };
const subron6Ships: OobDraft[] = [
  ship('us-ssn-753', 'USS Albany (SSN-753)', NORFOLK, 0, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-765', 'USS Montpelier (SSN-765)', NORFOLK, 1, 8, { radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-752', 'USS Pasadena (SSN-752)', NORFOLK, 2, 8, { role: 'Attack submarine · decommissioning scheduled 2025', radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-778', 'USS New Hampshire (SSN-778)', NORFOLK, 3, 8, { ...VIRGINIA_FIT, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-779', 'USS New Mexico (SSN-779)', NORFOLK, 4, 8, { ...VIRGINIA_FIT, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-785', 'USS John Warner (SSN-785)', NORFOLK, 5, 8, { ...VIRGINIA_FIT, sources: [SUBRON6_SOURCE] }),
  ship('us-ssn-793', 'USS Oregon (SSN-793)', NORFOLK, 6, 8, { ...VIRGINIA_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssn-796', 'USS New Jersey (SSN-796)', NORFOLK, 7, 8, { ...VIRGINIA_FIT, sources: [SUBRON6_SOURCE] }),
];
const subron12Ships: OobDraft[] = [
  ship('us-ssn-768', 'USS Hartford (SSN-768)', GROTON, 0, 1, {
    radars: LOS_ANGELES_SSN_RADARS,
    weapons: LOS_ANGELES_SSN_WEAPONS,
    sources: [{ label: 'DVIDS — USS Hartford (SSN-768) holds change of command', url: 'https://www.dvidshub.net/news/498725/uss-hartford-ssn-768-holds-change-command-ceremony' }],
  }),
];

// -- Second Fleet: Littoral Combat Ship Squadron Two (Mayport) ----------
const LCSRON2_SOURCE = { label: 'Wikipedia — Naval Station Mayport (Littoral Combat Ship Squadron Two)', url: 'https://en.wikipedia.org/wiki/Naval_Station_Mayport#Littoral_Combat_Ship_Squadron_Two' };
const lcsron2Ships: OobDraft[] = [
  ship('us-lcs-31', 'USS Cleveland (LCS-31)', MAYPORT, 0, 10, { radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS, sources: [LCSRON2_SOURCE] }),
  ship('us-lcs-13', 'USS Wichita (LCS-13)', MAYPORT, 1, 10, {
    role: 'Littoral combat ship · homeport Mayport; periodically chops to Fourth Fleet / JIATF-South for counter-narcotics operations',
    ...FREEDOM_FIT,
    sources: [{ label: 'Wikipedia — USS Wichita (LCS-13)', url: 'https://en.wikipedia.org/wiki/USS_Wichita_(LCS-13)' }],
  }),
  ship('us-lcs-15', 'USS Billings (LCS-15)', MAYPORT, 2, 10, {
    role: 'Littoral combat ship · homeport Mayport; currently deployed to the Central Caribbean Sea under Fourth Fleet (Aug 2026)',
    ...FREEDOM_FIT,
    sources: [
      { label: 'Wikipedia — USS Billings', url: 'https://en.wikipedia.org/wiki/USS_Billings' },
      { label: 'USNI News — Fleet and Marine Tracker (Aug 2026)', url: 'https://news.usni.org/category/fleet-tracker' },
    ],
  }),
  ship('us-lcs-17', 'USS Indianapolis (LCS-17)', MAYPORT, 3, 10, { ...FREEDOM_FIT, sources: [{ label: 'Wikipedia — USS Indianapolis (LCS-17)', url: 'https://en.wikipedia.org/wiki/USS_Indianapolis_(LCS-17)' }] }),
  ship('us-lcs-19', 'USS St. Louis (LCS-19)', MAYPORT, 4, 10, { ...FREEDOM_FIT, sources: [{ label: 'Wikipedia — USS St. Louis (LCS-19)', url: 'https://en.wikipedia.org/wiki/USS_St._Louis_(LCS-19)' }] }),
  ship('us-lcs-21', 'USS Minneapolis–Saint Paul (LCS-21)', MAYPORT, 5, 10, { ...FREEDOM_FIT, sources: [LCSRON2_SOURCE] }),
  ship('us-lcs-23', 'USS Cooperstown (LCS-23)', MAYPORT, 6, 10, { ...FREEDOM_FIT, sources: [LCSRON2_SOURCE] }),
  ship('us-lcs-25', 'USS Marinette (LCS-25)', MAYPORT, 7, 10, { ...FREEDOM_FIT, sources: [LCSRON2_SOURCE] }),
  ship('us-lcs-27', 'USS Nantucket (LCS-27)', MAYPORT, 8, 10, { ...FREEDOM_FIT, sources: [LCSRON2_SOURCE] }),
  ship('us-lcs-29', 'USS Beloit (LCS-29)', MAYPORT, 9, 10, { ...FREEDOM_FIT, sources: [LCSRON2_SOURCE] }),
];

// -- Second Fleet: Amphibious Ready Groups (Wasp, Kearsarge, Bataan, ----
// -- Iwo Jima / PHIBRON 8) -------------------------------------------------
const WASP_ARG_SOURCE = { label: 'Navy.mil — Wasp Amphibious Ready Group departs on deployment', url: 'https://www.navy.mil/Press-Office/Press-Releases/display-pressreleases/Article/2257320/wasp-amphibious-ready-group-departs-on-deployment/' };
const waspArgShips: OobDraft[] = [
  ship('us-lhd-1', 'USS Wasp (LHD-1)', NORFOLK, 0, 3, { role: 'Amphibious assault ship · Wasp ARG flagship', ...WASP_FIT, sources: [WASP_ARG_SOURCE] }),
  ship('us-lpd-21', 'USS New York (LPD-21)', MAYPORT, 1, 3, { role: 'Amphibious transport dock · Wasp ARG', radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS, sources: [WASP_ARG_SOURCE] }),
  ship('us-lsd-51', 'USS Oak Hill (LSD-51)', LITTLE_CREEK, 2, 3, { role: 'Dock landing ship · Wasp ARG', radars: WHIDBEY_ISLAND_RADARS, weapons: WHIDBEY_ISLAND_WEAPONS, sources: [WASP_ARG_SOURCE] }),
];
const kearsargeArgShips: OobDraft[] = [
  ship('us-lhd-3', 'USS Kearsarge (LHD-3)', NORFOLK, 0, 3, {
    role: 'Amphibious assault ship · Kearsarge ARG flagship, 24th MEU · deployed to Fifth Fleet AOR (2026 "Operation Epic Fury")',
    ...WASP_FIT,
    sources: [
      { label: 'GlobalSecurity.org — LHD-3 Mediterranean 2026, Operation Epic Fury', url: 'https://www.globalsecurity.org/military/agency/navy/lhd-3-med26.htm' },
      { label: 'WAVY — Kearsarge / Arlington deploy from Norfolk', url: 'https://www.wavy.com/news/military/navy/4k-sailors-marines-deploying-from-norfolk-on-uss-kearsarge-and-uss-arlington/amp/' },
    ],
  }),
  ship('us-lpd-24', 'USS Arlington (LPD-24)', NORFOLK, 1, 3, {
    role: 'Amphibious transport dock · Kearsarge ARG',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'WAVY — Kearsarge / Arlington deploy from Norfolk', url: 'https://www.wavy.com/news/military/navy/4k-sailors-marines-deploying-from-norfolk-on-uss-kearsarge-and-uss-arlington/amp/' }],
  }),
  ship('us-lsd-44', 'USS Gunston Hall (LSD-44)', LITTLE_CREEK, 2, 3, {
    role: 'Dock landing ship · Kearsarge ARG',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'WAVY — Kearsarge / Arlington deploy from Norfolk', url: 'https://www.wavy.com/news/military/navy/4k-sailors-marines-deploying-from-norfolk-on-uss-kearsarge-and-uss-arlington/amp/' }],
  }),
];
const BATAAN_ARG_SOURCE = { label: 'USNI News — Bataan ARG / 26th MEU deploy', url: 'https://news.usni.org/2023/07/10/bataan-amphibious-ready-group-26-marine-expeditionary-unit-leave-on-deployment' };
const bataanArgShips: OobDraft[] = [
  ship('us-lhd-5', 'USS Bataan (LHD-5)', NORFOLK, 0, 3, { role: 'Amphibious assault ship · Bataan ARG flagship, 26th MEU · current 2026 deployment status unconfirmed (last verified 2023–24)', ...WASP_FIT, sources: [BATAAN_ARG_SOURCE] }),
  ship('us-lpd-19', 'USS Mesa Verde (LPD-19)', NORFOLK, 1, 3, { role: 'Amphibious transport dock · Bataan ARG', radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS, sources: [BATAAN_ARG_SOURCE] }),
  ship('us-lsd-50', 'USS Carter Hall (LSD-50)', LITTLE_CREEK, 2, 3, { role: 'Dock landing ship · Bataan ARG', radars: WHIDBEY_ISLAND_RADARS, weapons: WHIDBEY_ISLAND_WEAPONS, sources: [BATAAN_ARG_SOURCE] }),
];
const PHIBRON8_SOURCE = { label: 'DVIDS — Amphibious Squadron 8 holds change of command', url: 'https://www.dvidshub.net/news/568680/amphibious-squadron-8-holds-change-command' };
const iwoJimaArgShips: OobDraft[] = [
  ship('us-lhd-7', 'USS Iwo Jima (LHD-7)', MAYPORT, 0, 3, { role: 'Amphibious assault ship · Iwo Jima ARG flagship, PHIBRON 8', ...WASP_FIT, sources: [PHIBRON8_SOURCE] }),
  ship('us-lpd-17', 'USS San Antonio (LPD-17)', NORFOLK, 1, 3, { role: 'Amphibious transport dock · Iwo Jima ARG, PHIBRON 8', radars: SAN_ANTONIO_RADARS, weapons: SAN_ANTONIO_WEAPONS, sources: [PHIBRON8_SOURCE] }),
  ship('us-lpd-28', 'USS Fort Lauderdale (LPD-28)', NORFOLK, 2, 3, {
    role: 'Amphibious transport dock · Iwo Jima ARG, PHIBRON 8',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'Navy.mil — USS Fort Lauderdale completes maiden deployment with Iwo Jima ARG', url: 'https://www.navy.mil/Press-Office/News-Stories/display-news/Article/4548058/uss-fort-lauderdale-completes-maiden-deployment-with-iwo-jima-amphibious-ready/' }],
  }),
];

const secondFleet: OobDraft = {
  id: 'us-navy-2f',
  name: 'U.S. Second Fleet',
  role: 'North Atlantic, Caribbean & Arctic approaches · HQ Naval Support Activity Hampton Roads, VA',
  kind: 'fleet',
  children: [
    {
      id: 'us-2f-tf20',
      name: 'Task Force 20 — Battle Force',
      role: 'Carrier Strike Groups 2, 8, 10 & 12',
      kind: 'command',
      children: [
        { id: 'us-2f-tf20-csg2', name: 'Carrier Strike Group Two', kind: 'group', children: csg2Ships },
        { id: 'us-2f-tf20-csg8', name: 'Carrier Strike Group Eight', kind: 'group', children: csg8Ships },
        { id: 'us-2f-tf20-csg10', name: 'Carrier Strike Group Ten', kind: 'group', children: csg10Ships },
        { id: 'us-2f-tf20-csg12', name: 'Carrier Strike Group Twelve', kind: 'group', children: csg12Ships },
      ],
    },
    { id: 'us-2f-tf21', name: 'Task Force 21 — Patrol and Reconnaissance Force', role: 'Maritime patrol aircraft coordination', kind: 'command' },
    {
      id: 'us-2f-tf22',
      name: 'Task Force 22 — Amphibious Force',
      role: 'Wasp, Kearsarge, Bataan & Iwo Jima Amphibious Ready Groups',
      kind: 'command',
      children: [
        { id: 'us-2f-tf22-arg-wasp', name: 'Wasp ARG', kind: 'group', children: waspArgShips },
        { id: 'us-2f-tf22-arg-kearsarge', name: 'Kearsarge ARG', kind: 'group', children: kearsargeArgShips },
        { id: 'us-2f-tf22-arg-bataan', name: 'Bataan ARG', kind: 'group', children: bataanArgShips },
        { id: 'us-2f-tf22-arg-iwojima', name: 'Iwo Jima ARG · PHIBRON 8', kind: 'group', children: iwoJimaArgShips },
      ],
    },
    { id: 'us-2f-tf23', name: 'Task Force 23 — Logistics', role: 'Combat logistics coordination', kind: 'command' },
    {
      id: 'us-2f-tf24',
      name: 'Task Force 24 — Anti-Submarine Warfare',
      role: 'ASW coordination, North Atlantic · Submarine Squadrons 2, 4, 6 & 12',
      kind: 'command',
      children: [
        { id: 'us-2f-tf24-subron2', name: 'Submarine Squadron 2', role: 'Kittery, ME (Portsmouth Naval Shipyard)', kind: 'squadron', children: subron2Ships },
        { id: 'us-2f-tf24-subron4', name: 'Submarine Squadron 4', role: 'Groton, CT', kind: 'squadron', children: subron4Ships },
        { id: 'us-2f-tf24-subron6', name: 'Submarine Squadron 6', role: 'Norfolk, VA', kind: 'squadron', children: subron6Ships },
        { id: 'us-2f-tf24-subron12', name: 'Submarine Squadron 12', role: 'Groton, CT', kind: 'squadron', children: subron12Ships },
      ],
    },
    { id: 'us-2f-tf25', name: 'Task Force 25 — Mine Warfare', role: 'Mine countermeasure coordination', kind: 'command' },
    { id: 'us-2f-tf26', name: 'Task Force 26 — Expeditionary Force', role: 'Expeditionary coordination', kind: 'command' },
    {
      id: 'us-2f-tf27',
      name: 'Task Force 27 — Surface Warfare',
      role: 'Destroyer Squadrons 2, 22, 26 & 28, Naval Surface Group Southeast, Littoral Combat Ship Squadron Two',
      kind: 'command',
      children: [
        { id: 'us-2f-tf27-desron2', name: 'Destroyer Squadron 2', kind: 'squadron', children: desron2Ships },
        { id: 'us-2f-tf27-desron22', name: 'Destroyer Squadron 22', kind: 'squadron', children: desron22Ships },
        { id: 'us-2f-tf27-desron26', name: 'Destroyer Squadron 26', kind: 'squadron', children: desron26Ships },
        { id: 'us-2f-tf27-desron28', name: 'Destroyer Squadron 28', kind: 'squadron', children: desron28Ships },
        { id: 'us-2f-tf27-nsgsoutheast', name: 'Naval Surface Group Southeast', role: 'Mayport, FL — successor to Destroyer Squadron 14', kind: 'squadron', children: nsgSoutheastShips },
        { id: 'us-2f-tf27-lcsron2', name: 'Littoral Combat Ship Squadron Two', role: 'Mayport, FL — Freedom-class, plus one forward Independence-class hull', kind: 'squadron', children: lcsron2Ships },
      ],
    },
    { id: 'us-2f-tf28', name: 'Task Force 28 — Strike Force Training', role: 'Pre-deployment strike group certification', kind: 'command' },
    { id: 'us-2f-tf29', name: 'Combined Task Force 29 — Land Operations', role: 'Land-domain coordination element', kind: 'command' },
    {
      id: 'us-2f-contacts',
      name: 'Contacts of Interest',
      role: 'Tracked but unidentified — see IDENTIFY tab on each contact',
      kind: 'group',
      children: [giukContact],
    },
  ],
};

const thirdFleet: OobDraft = {
  id: 'us-navy-3f',
  name: 'U.S. Third Fleet',
  role: 'Eastern & Northern Pacific, Bering Sea & Arctic sector · HQ Naval Base Point Loma, San Diego, CA',
  kind: 'fleet',
  children: [
    {
      id: 'us-3f-csg',
      name: 'Carrier Strike Groups 1, 3, 9 & 11',
      role: 'Rotating carrier strike group assignments',
      kind: 'group',
      children: [
        { id: 'us-3f-csg1', name: 'Carrier Strike Group One', kind: 'group', children: csg1Ships },
        { id: 'us-3f-csg3', name: 'Carrier Strike Group Three', kind: 'group', children: csg3Ships },
        { id: 'us-3f-csg9', name: 'Carrier Strike Group Nine', kind: 'group', children: csg9Ships },
        { id: 'us-3f-csg11', name: 'Carrier Strike Group Eleven', role: 'Flagship USS Nimitz currently in transit ahead of decommissioning — see ship card for detail', kind: 'group', children: csg11Ships },
      ],
    },
    { id: 'us-3f-esg3', name: 'Expeditionary Strike Group 3', role: 'Amphibious force coordination', kind: 'command' },
    {
      id: 'us-3f-nsg-midpac',
      name: 'Naval Surface Group Mid-Pacific',
      role: 'Surface combatant coordination',
      kind: 'command',
      children: [
        { id: 'us-3f-nsg-midpac-desron1', name: 'Destroyer Squadron 1', kind: 'squadron', children: desron1Ships },
        { id: 'us-3f-nsg-midpac-desron9', name: 'Destroyer Squadron 9', role: 'Naval Station Everett, WA — squadron assignment reported with lower confidence (no dedicated per-hull citation found)', kind: 'squadron', children: desron9Ships },
        { id: 'us-3f-nsg-midpac-desron21', name: 'Destroyer Squadron 21', kind: 'squadron', children: desron21Ships },
        { id: 'us-3f-nsg-midpac-desron23', name: 'Destroyer Squadron 23', kind: 'squadron', children: desron23Ships },
        { id: 'us-3f-nsg-midpac-desron31', name: 'Destroyer Squadron 31', role: 'Pearl Harbor, HI', kind: 'squadron', children: desron31Ships },
      ],
    },
    {
      id: 'us-3f-subforce',
      name: 'Submarine Force U.S. Pacific Fleet — Third Fleet AOR Squadrons',
      role: 'SUBRON 1/7/11 (Pearl Harbor / San Diego) and Development Squadron 5 (Bangor) — distinct from the top-level COMSUBPAC command, which holds the Ohio-class SSBN/SSGN force',
      kind: 'command',
      children: [
        { id: 'us-3f-subron1', name: 'Submarine Squadron 1', role: 'Pearl Harbor, HI', kind: 'squadron', children: subron1Ships },
        { id: 'us-3f-subron7', name: 'Submarine Squadron 7', role: 'Pearl Harbor, HI', kind: 'squadron', children: subron7Ships },
        { id: 'us-3f-subron11', name: 'Submarine Squadron 11', role: 'San Diego, CA', kind: 'squadron', children: subron11Ships },
        { id: 'us-3f-devron5', name: 'Submarine Development Squadron 5', role: 'Bangor, WA — Seawolf-class', kind: 'squadron', children: devron5Ships },
      ],
    },
    { id: 'us-3f-lcsron1', name: 'Littoral Combat Ship Squadron One', role: 'San Diego, CA — Independence-class', kind: 'squadron', children: lcsron1Ships },
    {
      id: 'us-3f-args',
      name: 'Amphibious Ready Groups',
      kind: 'group',
      children: [
        { id: 'us-3f-arg-essex', name: 'Essex ARG', kind: 'group', children: essexArgShips },
        { id: 'us-3f-arg-boxer', name: 'Boxer ARG', kind: 'group', children: boxerArgShips },
        { id: 'us-3f-arg-makinisland', name: 'Makin Island ARG', kind: 'group', children: makinIslandArgShips },
        { id: 'us-3f-phibron1', name: 'Amphibious Squadron 1', kind: 'squadron', children: phibron1Ships },
      ],
    },
    { id: 'us-3f-hsmwing', name: 'Helicopter Maritime Strike Wing Pacific', role: 'MH-60R/S squadron coordination', kind: 'command' },
    { id: 'us-3f-mcmgru3', name: 'Mine Countermeasures Group Three', role: 'Mine warfare coordination', kind: 'command' },
    { id: 'us-3f-eodgru1', name: 'Explosive Ordnance Disposal Group One', role: 'EOD mobile unit coordination', kind: 'command' },
  ],
};

const fourthFleet: OobDraft = {
  id: 'us-navy-4f',
  name: 'U.S. Fourth Fleet',
  role: 'Caribbean, Central & South America · HQ Naval Station Mayport, Jacksonville, FL',
  kind: 'fleet',
  children: [
    { id: 'us-4f-ctf41', name: 'Commander, Task Force 41', role: 'Force-provider HQ — no permanently assigned hulls (re-established 2008)', kind: 'command' },
    {
      id: 'us-4f-contacts',
      name: 'Contacts of Interest',
      role: 'Tracked but unidentified — see IDENTIFY tab on each contact',
      kind: 'group',
      children: [caribbeanContact],
    },
  ],
};

const fifthFleet: OobDraft = {
  id: 'us-navy-5f',
  name: 'U.S. Fifth Fleet',
  role: 'Persian Gulf, Red Sea & Arabian Sea · HQ Naval Support Activity Bahrain, Manama',
  kind: 'fleet',
  children: [
    { id: 'us-5f-tf50', name: 'Task Force 50 — Carrier Strike Group', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-5f-tf51', name: 'Task Force 51 — Amphibious / Expeditionary Strike Group', role: '5th Marine Expeditionary Brigade', kind: 'command', children: [esbLewisBPuller] },
    { id: 'us-5f-tf52', name: 'Task Force 52 — Mine Countermeasures', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-5f-tf53', name: 'Task Force 53 — Logistics', role: 'Combat logistics coordination', kind: 'command' },
    { id: 'us-5f-tf54', name: 'Task Force 54 — Submarines', role: 'Submarine operations coordination', kind: 'command' },
    { id: 'us-5f-tf55', name: 'Task Force 55 — Surface Combatants', role: 'Destroyer Squadron 50 element, plus MCM-package LCS replacing the retired Avenger-class MCM ships', kind: 'command', children: fifthFleetShips },
    { id: 'us-5f-tf56', name: 'Task Force 56 — Navy Expeditionary Combat Command', role: 'Expeditionary/riverine coordination', kind: 'command' },
    { id: 'us-5f-tf57', name: 'Task Force 57 — Maritime Patrol and Reconnaissance', role: 'MPA coordination', kind: 'command' },
    { id: 'us-5f-tf58', name: 'Task Force 58 — Northern Persian Gulf', role: 'Surveillance & escort coordination', kind: 'command' },
    { id: 'us-5f-tf59', name: 'Task Force 59 — Unmanned Systems & Innovation', role: 'Unmanned/AI integration — force-provider HQ, no permanently assigned hulls (see Task Force 55 for this AOR’s LCS assignments)', kind: 'command' },
    {
      id: 'us-5f-contacts',
      name: 'Contacts of Interest',
      role: 'Tracked but unidentified — see IDENTIFY tab on each contact',
      kind: 'group',
      children: [hormuzContact],
    },
  ],
};

const sixthFleet: OobDraft = {
  id: 'us-navy-6f',
  name: 'U.S. Sixth Fleet',
  role: 'Mediterranean, Europe & Africa (Norwegian Sea to Cape of Good Hope) · HQ Naval Support Activity Naples, Italy',
  kind: 'fleet',
  children: [
    mountWhitney,
    { id: 'us-6f-desron60', name: 'Destroyer Squadron 60', role: 'BMD-capable destroyers, forward-deployed · Naval Station Rota, Spain', kind: 'squadron', children: desron60Ships },
    { id: 'us-6f-tf60', name: 'Task Force 60 — Carrier Strike Group', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-6f-tf61', name: 'Task Force 61 — Amphibious Ready Group', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-6f-tf62', name: 'Task Force 62 — Marine Expeditionary Unit', role: 'Landing force coordination', kind: 'command' },
    { id: 'us-6f-tf63', name: 'Task Force 63 — Logistics', role: 'Combat logistics coordination', kind: 'command', children: [esbHershelWoodyWilliams] },
    { id: 'us-6f-tf64', name: 'Task Force 64 — Integrated Air & Missile Defense', role: 'BMD/IAMD coordination', kind: 'command' },
    { id: 'us-6f-tf65', name: 'Task Force 65 — Surface Combatants', role: 'Surface combatant coordination', kind: 'command' },
    { id: 'us-6f-tf66', name: 'Task Force 66 — Innovation', role: 'Unmanned systems integration (est. 2024)', kind: 'command' },
    { id: 'us-6f-tf67', name: 'Task Force 67 — Maritime Patrol and Reconnaissance', role: 'MPA coordination', kind: 'command' },
    { id: 'us-6f-tf68', name: 'Task Force 68 — Navy Expeditionary Combat Command', role: 'Expeditionary/riverine coordination', kind: 'command' },
    { id: 'us-6f-tf69', name: 'Task Force 69 — Submarines', role: 'Submarine operations coordination', kind: 'command' },
    {
      id: 'us-6f-contacts',
      name: 'Contacts of Interest',
      role: 'Tracked but unidentified — see IDENTIFY tab on each contact',
      kind: 'group',
      children: [easternMedContact],
    },
  ],
};

// Tenth Fleet (U.S. Fleet Cyber Command) has no ships — its component
// commands are pure organization nodes here; their real-world locations
// are plotted separately as a map "context layer" (see
// assets/tenthFleetLocations.ts) rather than as OOB map objects, since
// they aren't physical platforms with a track to hold custody of.
const tenthFleet: OobDraft = {
  id: 'us-navy-10f',
  name: 'U.S. Tenth Fleet',
  role: 'Fleet Cyber Command — cyber, EW, information & space operations · HQ Fort Meade, MD',
  kind: 'fleet',
  children: [
    { id: 'us-10f-nnwc', name: 'Naval Network Warfare Command', role: 'Network operations & defense', kind: 'command' },
    { id: 'us-10f-ncdoc', name: 'Navy Cyber Defense Operations Command', role: 'Defensive cyber operations', kind: 'command' },
    { id: 'us-10f-ncwdg', name: 'Navy Cyber Warfare Development Group', role: 'Offensive/defensive cyber tool development', kind: 'command' },
    {
      id: 'us-10f-niocs',
      name: 'Navy Information Operations Commands',
      role: 'Regional cryptologic/IO detachments',
      kind: 'group',
      children: [
        { id: 'us-10f-nioc-norfolk', name: 'NIOC Norfolk', kind: 'unit' },
        { id: 'us-10f-nioc-sandiego', name: 'NIOC San Diego', kind: 'unit' },
        { id: 'us-10f-nioc-pensacola', name: 'NIOC Pensacola', kind: 'unit' },
        { id: 'us-10f-nioc-whidbey', name: 'NIOC Whidbey Island', kind: 'unit' },
        { id: 'us-10f-nioc-colorado', name: 'NIOC Colorado', kind: 'unit' },
      ],
    },
  ],
};

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
    {
      id: 'us-7f-tf74',
      name: 'Task Force 74 — Fleet Submarine Force',
      role: 'Submarine operations planning & coordination',
      kind: 'command',
      children: [{ id: 'us-7f-tf74-subron15', name: 'Submarine Squadron 15', role: 'Forward-deployed attack submarines · Apra Harbor, Guam', kind: 'squadron', children: subron15Ships }],
    },
    { id: 'us-7f-tf75', name: 'Task Force 75 — Navy Expeditionary Forces Command Pacific', role: 'Coastal riverine operations · Camp Covington, Guam', kind: 'command' },
    {
      id: 'us-7f-tf76',
      name: 'Task Force 76 — Amphibious Assault Force',
      role: 'Marine landing support · HQ Fleet Activities Sasebo, Japan',
      kind: 'command',
      children: [
        { id: 'us-7f-tf76-america-arg', name: 'America ARG', kind: 'group', children: tf76Ships },
        { id: 'us-7f-tf76-tripoli-arg', name: 'Tripoli ARG · PHIBRON 11', kind: 'group', children: tripoliArgShips },
        { id: 'us-7f-tf76-esb', name: 'Expeditionary Sea Base Ships', role: 'Forward-deployed from Saipan, Northern Mariana Islands', kind: 'group', children: [esbMiguelKeith, esbJohnLCanley] },
      ],
    },
    { id: 'us-7f-tf77', name: 'Task Force 77 — Mine Warfare Force', role: 'Mine countermeasure, hunter & control ships', kind: 'command' },
    { id: 'us-7f-tf78', name: 'Task Force 78 — Commander Naval Forces Korea', role: 'Administrative liaison · Busan Naval Base / Chinhae', kind: 'command' },
    { id: 'us-7f-tf79', name: 'Task Force 79 — Landing Force Seventh Fleet', role: 'Reinforced MEU drawn from III MEF, Okinawa', kind: 'command' },
    {
      id: 'us-7f-bases',
      name: 'Forward-Deployed Bases',
      kind: 'group',
      children: [
        // lng/lat here reuse the same YOKOSUKA/SASEBO/GUAM station constants
        // already used above to place this fleet's ships — a real anchor
        // point for the knowledge-base's port geo-proximity join
        // (kb/geoMatch.ts), not a separate/invented coordinate.
        { id: 'us-7f-base-yokosuka', name: 'Fleet Activities Yokosuka, Japan', role: 'Houses CSG-5, DESRON 15 & flagship', kind: 'base', lng: YOKOSUKA.lng, lat: YOKOSUKA.lat },
        { id: 'us-7f-base-sasebo', name: 'Fleet Activities Sasebo, Japan', role: 'Houses TF-76 amphibious units', kind: 'base', lng: SASEBO.lng, lat: SASEBO.lat },
        { id: 'us-7f-base-guam', name: 'Naval Base Guam (Apra Harbor)', kind: 'base', lng: GUAM.lng, lat: GUAM.lat, children: guamShips },
      ],
    },
  ],
};

// -- Fifth Air Force (PACAF numbered air force) --------------------------
// Sourced from Wikipedia (Fifth Air Force, 18th Wing, 35th Fighter Wing,
// 374th Airlift Wing) — present-day structure only, and only the flying
// squadrons under each wing's operations group (administrative/support
// groups such as mission support, maintenance, medical and civil engineer
// are omitted, matching the level of detail used for the Navy OOB above,
// which likewise only tracks operational units, not ship departments).
const fifthAirForce: OobDraft = {
  id: 'us-5af',
  name: 'Fifth Air Force',
  role: 'Numbered air force · air component, U.S. Forces Japan · HQ Yokota Air Base, Japan',
  kind: 'numberedAF',
  children: [
    {
      id: 'us-5af-18wg',
      name: '18th Wing',
      role: "Air Force's largest combat wing · Kadena Air Base, Okinawa",
      kind: 'wing',
      children: [
        {
          id: 'us-5af-18wg-og',
          name: '18th Operations Group',
          kind: 'group',
          children: [
            { id: 'us-5af-18wg-44fs', name: '44th Fighter Squadron "Vampire Bats"', role: 'F-15C/D Eagle air superiority', kind: 'squadron' },
            { id: 'us-5af-18wg-67fs', name: '67th Fighter Squadron "Fighting Cocks"', role: 'F-15C/D Eagle air superiority', kind: 'squadron' },
            { id: 'us-5af-18wg-909ars', name: '909th Air Refueling Squadron "Young Tigers"', role: 'KC-135R Stratotanker aerial refueling', kind: 'squadron' },
            { id: 'us-5af-18wg-961aacs', name: '961st Airborne Air Control Squadron "Ronin/Cowboy"', role: 'E-3B/C Sentry airborne early warning & control', kind: 'squadron' },
            { id: 'us-5af-18wg-623acs', name: '623d Air Control Squadron "Lightsword"', role: 'Ground-based air control (JADGE)', kind: 'squadron' },
            { id: 'us-5af-18wg-33rqs', name: '33d Rescue Squadron', role: 'HH-60G Pave Hawk combat search & rescue', kind: 'squadron' },
            { id: 'us-5af-18wg-31rqs', name: '31st Rescue Squadron', role: 'Pararescue', kind: 'squadron' },
            { id: 'us-5af-18wg-18aes', name: '18th Aeromedical Evacuation Squadron', role: 'Medical aircrews', kind: 'squadron' },
          ],
        },
      ],
    },
    {
      id: 'us-5af-35fw',
      name: '35th Fighter Wing',
      role: 'Suppression of enemy air defenses · Misawa Air Base, Japan',
      kind: 'wing',
      children: [
        {
          id: 'us-5af-35fw-og',
          name: '35th Operations Group',
          kind: 'group',
          children: [
            { id: 'us-5af-35fw-13fs', name: '13th Fighter Squadron', role: 'F-16CJ/DJ Fighting Falcon (transitioning to F-35A)', kind: 'squadron' },
            { id: 'us-5af-35fw-14fs', name: '14th Fighter Squadron', role: 'F-16CJ/DJ Fighting Falcon (transitioning to F-35A)', kind: 'squadron' },
          ],
        },
      ],
    },
    {
      id: 'us-5af-374aw',
      name: '374th Airlift Wing',
      role: 'Tactical airlift · Yokota Air Base, Japan',
      kind: 'wing',
      children: [
        {
          id: 'us-5af-374aw-og',
          name: '374th Operations Group',
          kind: 'group',
          children: [
            { id: 'us-5af-374aw-36as', name: '36th Airlift Squadron', role: 'C-130J Super Hercules tactical airlift', kind: 'squadron' },
            { id: 'us-5af-374aw-459as', name: '459th Airlift Squadron', role: 'UH-1N Huey / C-12 utility & light transport', kind: 'squadron' },
            { id: 'us-5af-374aw-319ers', name: '319th Expeditionary Reconnaissance Squadron', role: 'Reconnaissance', kind: 'squadron' },
          ],
        },
      ],
    },
  ],
};

// -- The other active numbered air forces (top-level only) ---------------
// Sourced from Wikipedia (Numbered Air Force) — every NAF currently active
// per that page's status column, at the same level of detail the branch
// summary itself uses (parent major command · role · headquarters). Unlike
// Fifth Air Force above, these are not broken down to wing/squadron level —
// that would need each NAF's own wing structure individually sourced the
// way 5th AF's was, which is future work, not done here. Inactive/disbanded
// NAFs (6th, 14th, 17th Expeditionary, 23rd, 24th, 25th) are omitted.
const firstAirForce: OobDraft = {
  id: 'us-1af',
  name: 'First Air Force',
  role: 'Air Forces Northern · Air Combat Command · NORAD/NORTHCOM air defense component · HQ Tyndall AFB, Florida',
  kind: 'numberedAF',
};
const secondAirForce: OobDraft = {
  id: 'us-2af',
  name: 'Second Air Force',
  role: 'Air Education and Training Command · oversees all USAF non-flying technical training · HQ Keesler AFB, Mississippi',
  kind: 'numberedAF',
};
const thirdAirForce: OobDraft = {
  id: 'us-3af',
  name: 'Third Air Force',
  role: 'Air Forces Europe · USAFE-AFAFRICA · supports EUCOM and AFRICOM · HQ Ramstein Air Base, Germany',
  kind: 'numberedAF',
};
const fourthAirForce: OobDraft = {
  id: 'us-4af',
  name: 'Fourth Air Force',
  role: 'Air Force Reserve Command · reserve airlift/mobility numbered air force · HQ March Air Reserve Base, California',
  kind: 'numberedAF',
};
const seventhAirForce: OobDraft = {
  id: 'us-7af',
  name: 'Seventh Air Force',
  role: 'Air Forces Korea · Pacific Air Forces · air component supporting U.S. Forces Korea · HQ Osan Air Base, South Korea',
  kind: 'numberedAF',
};
const eighthAirForce: OobDraft = {
  id: 'us-8af',
  name: 'Eighth Air Force',
  role: 'Air Forces Strategic · Air Force Global Strike Command · responsible for all bomber wings · HQ Barksdale AFB, Louisiana',
  kind: 'numberedAF',
};
const ninthAirForce: OobDraft = {
  id: 'us-9af',
  name: 'Ninth Air Force',
  role: 'Air Forces Central · Air Combat Command · USCENTCOM air component · HQ Shaw AFB, South Carolina',
  kind: 'numberedAF',
};
const tenthAirForce: OobDraft = {
  id: 'us-10af',
  name: 'Tenth Air Force',
  role: 'Air Force Reserve Command · reserve combat/fighter and training numbered air force · HQ NAS JRB Fort Worth, Texas',
  kind: 'numberedAF',
};
const eleventhAirForce: OobDraft = {
  id: 'us-11af',
  name: 'Eleventh Air Force',
  role: 'Pacific Air Forces · Alaskan NORAD Region / Alaskan Command air component · HQ Joint Base Elmendorf-Richardson, Alaska',
  kind: 'numberedAF',
};
const twelfthAirForce: OobDraft = {
  id: 'us-12af',
  name: 'Twelfth Air Force',
  role: 'Air Forces Southern · Air Combat Command · USSOUTHCOM air component · HQ Davis-Monthan AFB, Arizona',
  kind: 'numberedAF',
};
const thirteenthAirForce: OobDraft = {
  id: 'us-13af',
  name: 'Thirteenth Air Force (Expeditionary)',
  role: 'Pacific Air Forces · provisional expeditionary numbered air force, reactivated 2012 · HQ Joint Base Pearl Harbor-Hickam, Hawaii',
  kind: 'numberedAF',
};
const fifteenthAirForce: OobDraft = {
  id: 'us-15af',
  name: 'Fifteenth Air Force',
  role: 'Air Combat Command · combat air forces generation, reactivated 2020 consolidating former 9th/12th AF stateside wings · HQ Shaw AFB, South Carolina',
  kind: 'numberedAF',
};
const sixteenthAirForce: OobDraft = {
  id: 'us-16af',
  name: 'Sixteenth Air Force',
  role: 'Air Forces Cyber · Air Combat Command · supports U.S. Cyber Command, ISR and information warfare (formed 2019 from 24th/25th AF) · HQ Joint Base San Antonio-Lackland, Texas',
  kind: 'numberedAF',
};
const eighteenthAirForce: OobDraft = {
  id: 'us-18af',
  name: 'Eighteenth Air Force',
  role: 'Air Forces Transportation · Air Mobility Command · USTRANSCOM air mobility component · HQ Scott AFB, Illinois',
  kind: 'numberedAF',
};
const nineteenthAirForce: OobDraft = {
  id: 'us-19af',
  name: 'Nineteenth Air Force',
  role: 'Air Education and Training Command · oversees USAF flying training · HQ Joint Base San Antonio-Randolph, Texas',
  kind: 'numberedAF',
};
const twentiethAirForce: OobDraft = {
  id: 'us-20af',
  name: 'Twentieth Air Force',
  role: 'Air Forces Strategic · Air Force Global Strike Command · oversees all ICBM wings · HQ F.E. Warren AFB, Wyoming',
  kind: 'numberedAF',
};
const twentyFirstAirForce: OobDraft = {
  id: 'us-21af',
  name: 'Twenty-First Air Force',
  role: 'Air Mobility Command · airlift operations, reactivated September 2025 · HQ Joint Base McGuire-Dix-Lakehurst, New Jersey',
  kind: 'numberedAF',
};
const twentySecondAirForce: OobDraft = {
  id: 'us-22af',
  name: 'Twenty-Second Air Force',
  role: 'Air Force Reserve Command · reserve airlift/mobility numbered air force · HQ Dobbins Air Reserve Base, Georgia',
  kind: 'numberedAF',
};

// -- PLA Navy (China) hull classes ---------------------------------------
// A small illustrative sample, not exhaustive PLAN order of battle — same
// "representative sample" discipline this file already applies to e.g. the
// numbered Air Forces above. Added so the knowledge-base similarity search
// (kb/similarity.ts) has real cross-country data to compare against US
// Navy hulls; sourced from each class's own Wikipedia page the same way
// every other RadarSystem/WeaponSystem block in this file is. Organized
// under the post-2016 PLA theater-command structure rather than the older
// North/East/South Sea Fleet naming.
const TYPE_052D_RADARS: RadarSystem[] = [
  { name: 'Type 346B (Dragon Eye)', type: '3D multi-function phased-array', rangeNm: 250 },
  { name: 'Type 364 (Seagull-C)', type: 'surface-search', rangeNm: 65 },
];
const TYPE_052D_WEAPONS: WeaponSystem[] = [
  { name: 'HHQ-9B', type: 'surface-to-air missile', rangeNm: 108 },
  { name: 'YJ-18', type: 'anti-ship / land-attack cruise missile', rangeNm: 290 },
  { name: 'H/PJ-45A 130mm gun', type: 'naval gun', rangeNm: 18 },
  { name: 'Type 730 CIWS', type: 'close-in weapon system', rangeNm: 1.6 },
];
const TYPE_052D_FIT = { class: 'Type 052D (Luyang III-class) destroyer', lengthM: 157, displacementT: 7500, radars: TYPE_052D_RADARS, weapons: TYPE_052D_WEAPONS };

const TYPE_055_RADARS: RadarSystem[] = [
  { name: 'Type 346B(V)2', type: '3D multi-function phased-array', rangeNm: 280 },
  { name: 'Type 517M', type: '2D air-search', rangeNm: 220 },
];
const TYPE_055_WEAPONS: WeaponSystem[] = [
  { name: 'HHQ-9B', type: 'surface-to-air missile', rangeNm: 108 },
  { name: 'YJ-18', type: 'anti-ship / land-attack cruise missile', rangeNm: 290 },
  { name: 'CJ-10', type: 'land-attack cruise missile', rangeNm: 810 },
  { name: 'HQ-10', type: 'short-range surface-to-air missile', rangeNm: 5.4 },
  { name: 'H/PJ-38 130mm gun', type: 'naval gun', rangeNm: 18 },
];
const TYPE_055_FIT = { class: 'Type 055 (Renhai-class) cruiser', lengthM: 180, displacementT: 13000, radars: TYPE_055_RADARS, weapons: TYPE_055_WEAPONS };

const TYPE_054A_RADARS: RadarSystem[] = [
  { name: 'Type 382 (Seagull-S)', type: '3D air-search', rangeNm: 100 },
  { name: 'Type 344 fire-control', type: 'fire-control / surface-search', rangeNm: 35 },
];
const TYPE_054A_WEAPONS: WeaponSystem[] = [
  { name: 'HHQ-16', type: 'surface-to-air missile', rangeNm: 40 },
  { name: 'YJ-83', type: 'anti-ship missile', rangeNm: 110 },
  { name: 'H/PJ-26 76mm gun', type: 'naval gun', rangeNm: 10.8 },
  { name: 'Type 730 CIWS', type: 'close-in weapon system', rangeNm: 1.6 },
  { name: 'Yu-7 torpedo', type: 'anti-submarine torpedo', rangeNm: 7.6 },
];
const TYPE_054A_FIT = { class: 'Type 054A (Jiangkai II-class) frigate', lengthM: 134, displacementT: 4053, radars: TYPE_054A_RADARS, weapons: TYPE_054A_WEAPONS };

const QINGDAO = { lng: 120.38, lat: 36.07 };
const ZHANJIANG = { lng: 110.4, lat: 21.21 };

const QINGDAO_COUNT = 5;
const type052dShips: OobDraft[] = [
  ship('cn-ddg-172', 'PLANS Kunming (172)', QINGDAO, 0, QINGDAO_COUNT, { role: 'Guided-missile destroyer', ...TYPE_052D_FIT }),
  ship('cn-ddg-173', 'PLANS Changsha (173)', QINGDAO, 1, QINGDAO_COUNT, { role: 'Guided-missile destroyer', ...TYPE_052D_FIT }),
  ship('cn-ddg-174', 'PLANS Hefei (174)', QINGDAO, 2, QINGDAO_COUNT, { role: 'Guided-missile destroyer', ...TYPE_052D_FIT }),
];
const type055Ships: OobDraft[] = [
  ship('cn-cg-101', 'PLANS Nanchang (101)', QINGDAO, 3, QINGDAO_COUNT, { role: 'Guided-missile cruiser', ...TYPE_055_FIT }),
  ship('cn-cg-102', 'PLANS Lhasa (102)', QINGDAO, 4, QINGDAO_COUNT, { role: 'Guided-missile cruiser', ...TYPE_055_FIT }),
];
const ZHANJIANG_COUNT = 3;
const type054aShips: OobDraft[] = [
  ship('cn-ffg-546', 'PLANS Yancheng (546)', ZHANJIANG, 0, ZHANJIANG_COUNT, { role: 'Guided-missile frigate', ...TYPE_054A_FIT }),
  ship('cn-ffg-568', 'PLANS Hengyang (568)', ZHANJIANG, 1, ZHANJIANG_COUNT, { role: 'Guided-missile frigate', ...TYPE_054A_FIT }),
  ship('cn-ffg-598', 'PLANS Rizhao (598)', ZHANJIANG, 2, ZHANJIANG_COUNT, { role: 'Guided-missile frigate', ...TYPE_054A_FIT }),
];

const plaNavy: OobDraft = {
  id: 'cn-navy',
  name: "People's Liberation Army Navy",
  role: 'Zhōngguó Rénmín Jiěfàngjūn Hǎijūn',
  kind: 'branch',
  children: [
    {
      id: 'cn-navy-northern',
      name: 'PLAN Northern Theater Command Navy',
      role: 'Yellow Sea / North China Sea · HQ Qingdao, Shandong',
      kind: 'fleet',
      children: [
        { id: 'cn-navy-northern-052d', name: 'Type 052D Destroyer Squadron', kind: 'squadron', children: type052dShips },
        { id: 'cn-navy-northern-055', name: 'Type 055 Cruiser Squadron', kind: 'squadron', children: type055Ships },
      ],
    },
    {
      id: 'cn-navy-southern',
      name: 'PLAN Southern Theater Command Navy',
      role: 'South China Sea · HQ Zhanjiang, Guangdong',
      kind: 'fleet',
      children: [{ id: 'cn-navy-southern-054a', name: 'Type 054A Frigate Squadron', kind: 'squadron', children: type054aShips }],
    },
  ],
};

// -- Ohio-class SSBN/SSGN — Submarine Groups 9 & 10 -----------------------
// Sourced to Commander, Submarine Force U.S. Pacific Fleet (COMSUBPAC) and
// Commander, Submarine Force U.S. Atlantic Fleet (COMSUBLANT) respectively
// — NOT to a numbered fleet. Every source checked for this (each group's
// own official Navy page) describes the reporting chain as COMSUBPAC/
// COMSUBLANT only; nothing ties Submarine Group 9/10 to Third/Second Fleet
// specifically, unlike the general-purpose submarine squadrons above
// (which the AOR-inference already used for the rest of this file
// reasonably applies to). Per that distinction, these are modeled as their
// own top-level commands under US Navy — peers to the numbered fleets —
// rather than nested under one, so the tree doesn't assert a link the
// sourcing doesn't support.
const SUBGRU9_SOURCE = { label: 'Commander, Submarine Group Nine — About', url: 'https://www.csp.navy.mil/csg9/About-COMSUBGRU-NINE/' };
const subgru9Ships: OobDraft[] = [
  ship('us-ssgn-726', 'USS Ohio (SSGN-726)', BANGOR, 0, 10, { ...OHIO_SSGN_FIT, sources: [SUBGRU9_SOURCE] }),
  ship('us-ssgn-727', 'USS Michigan (SSGN-727)', BANGOR, 1, 10, { ...OHIO_SSGN_FIT, sources: [SUBGRU9_SOURCE] }),
  ship('us-ssbn-730', 'USS Henry M. Jackson (SSBN-730)', BANGOR, 2, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-731', 'USS Alabama (SSBN-731)', BANGOR, 3, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-733', 'USS Nevada (SSBN-733)', BANGOR, 4, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-735', 'USS Pennsylvania (SSBN-735)', BANGOR, 5, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-737', 'USS Kentucky (SSBN-737)', BANGOR, 6, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-739', 'USS Nebraska (SSBN-739)', BANGOR, 7, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-741', 'USS Maine (SSBN-741)', BANGOR, 8, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
  ship('us-ssbn-743', 'USS Louisiana (SSBN-743)', BANGOR, 9, 10, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS, SUBGRU9_SOURCE] }),
];
const SUBGRU10_SOURCE = { label: 'Commander, Submarine Group Ten — About Us', url: 'https://www.sublant.usff.navy.mil/CSG10/About-Us/' };
const subgru10Ships: OobDraft[] = [
  ship('us-ssgn-728', 'USS Florida (SSGN-728)', KINGS_BAY, 0, 8, { ...OHIO_SSGN_FIT, sources: [{ label: 'USNI News — Sub base Kings Bay keeping current Ohio subs ready', url: 'https://news.usni.org/2020/08/03/sub-base-kings-bay-keeping-current-ohio-subs-ready-prepping-for-incoming-columbia-class' }, SUBGRU10_SOURCE] }),
  ship('us-ssgn-729', 'USS Georgia (SSGN-729)', KINGS_BAY, 1, 8, { ...OHIO_SSGN_FIT, sources: [SUBGRU10_SOURCE] }),
  ship('us-ssbn-732', 'USS Alaska (SSBN-732)', KINGS_BAY, 2, 8, { ...OHIO_SSBN_FIT, sources: [{ label: 'Wikipedia — USS Alaska (SSBN-732)', url: 'https://en.wikipedia.org/wiki/USS_Alaska_(SSBN-732)' }] }),
  ship('us-ssbn-734', 'USS Tennessee (SSBN-734)', KINGS_BAY, 3, 8, { ...OHIO_SSBN_FIT, sources: [{ label: 'Wikipedia — USS Tennessee (SSBN-734)', url: 'https://en.wikipedia.org/wiki/USS_Tennessee_(SSBN-734)' }] }),
  ship('us-ssbn-736', 'USS West Virginia (SSBN-736)', KINGS_BAY, 4, 8, { ...OHIO_SSBN_FIT, sources: [{ label: 'Wikipedia — USS West Virginia (SSBN-736)', url: 'https://en.wikipedia.org/wiki/USS_West_Virginia_(SSBN-736)' }] }),
  ship('us-ssbn-738', 'USS Maryland (SSBN-738)', KINGS_BAY, 5, 8, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssbn-740', 'USS Rhode Island (SSBN-740)', KINGS_BAY, 6, 8, { ...OHIO_SSBN_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ssbn-742', 'USS Wyoming (SSBN-742)', KINGS_BAY, 7, 8, { ...OHIO_SSBN_FIT, sources: [{ label: 'Wikipedia — USS Wyoming (SSBN-742)', url: 'https://en.wikipedia.org/wiki/USS_Wyoming_(SSBN-742)' }] }),
];
const submarineForcePacific: OobDraft = {
  id: 'us-navy-comsubpac',
  name: 'Submarine Force U.S. Pacific Fleet (COMSUBPAC)',
  role: 'Ohio-class ballistic/guided-missile submarine force · Submarine Group 9, Naval Base Kitsap–Bangor, WA',
  kind: 'command',
  children: [{ id: 'us-navy-comsubpac-subgru9', name: 'Submarine Group 9', kind: 'group', children: subgru9Ships }],
};
const submarineForceAtlantic: OobDraft = {
  id: 'us-navy-comsublant',
  name: 'Submarine Force U.S. Atlantic Fleet (COMSUBLANT)',
  role: 'Ohio-class ballistic/guided-missile submarine force · Submarine Group 10, Naval Submarine Base Kings Bay, GA',
  kind: 'command',
  children: [{ id: 'us-navy-comsublant-subgru10', name: 'Submarine Group 10', kind: 'group', children: subgru10Ships }],
};

// Ships confirmed as currently commissioned (per the master roster at
// https://en.wikipedia.org/wiki/List_of_current_ships_of_the_United_States_Navy)
// but whose current squadron/task-force assignment couldn't be verified
// from available sources — parked here rather than guessed at, per this
// file's "don't guess" rule. Each still carries a `sources` entry citing
// what WAS confirmed (the hull's existence/class) even though command
// assignment itself is unresolved.
const UNDET_COUNT = 49;
const undeterminedShips: OobDraft[] = [
  // Destroyers (Arleigh Burke-class unless noted) — homeport known but
  // DESRON/squadron assignment not confirmed by any source found.
  ship('us-ddg-54', 'USS Curtis Wilbur (DDG-54)', POINT_LOMA, 0, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-61', 'USS Ramage (DDG-61)', NORFOLK, 1, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-62', 'USS Fitzgerald (DDG-62)', POINT_LOMA, 2, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-92', 'USS Momsen (DDG-92)', POINT_LOMA, 3, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-106', 'USS Stockdale (DDG-106)', POINT_LOMA, 4, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-111', 'USS Spruance (DDG-111)', POINT_LOMA, 5, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-118', 'USS Daniel Inouye (DDG-118)', PEARL_HARBOR, 6, UNDET_COUNT, { role: 'Guided-missile destroyer · likely Destroyer Squadron 31, not confirmed', ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-120', 'USS Carl M. Levin (DDG-120)', PEARL_HARBOR, 7, UNDET_COUNT, { role: 'Guided-missile destroyer · likely Destroyer Squadron 31, not confirmed', ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-121', 'USS Frank E. Petersen Jr. (DDG-121)', PEARL_HARBOR, 8, UNDET_COUNT, { role: 'Guided-missile destroyer · likely Destroyer Squadron 31, not confirmed', ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-123', 'USS Lenah Sutcliffe Higbee (DDG-123)', POINT_LOMA, 9, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-124', 'USS Harvey C. Barnum Jr. (DDG-124)', NORFOLK, 10, UNDET_COUNT, { role: 'Guided-missile destroyer · commissioned Apr 2026', ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-125', 'USS Jack H. Lucas (DDG-125)', POINT_LOMA, 11, UNDET_COUNT, { ...ARLEIGH_BURKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-1000', 'USS Zumwalt (DDG-1000)', POINT_LOMA, 12, UNDET_COUNT, { ...ZUMWALT_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-ddg-1001', 'USS Michael Monsoor (DDG-1001)', POINT_LOMA, 13, UNDET_COUNT, { ...ZUMWALT_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  // Cruisers (Ticonderoga-class)
  ship('us-cg-59', 'USS Princeton (CG-59)', POINT_LOMA, 14, UNDET_COUNT, {
    role: 'Guided-missile cruiser · historically CSG-1’s cruiser through Aug 2025, since reassigned; as of Aug 2026 reported "operating independently," no current CSG confirmed',
    ...TICONDEROGA_FIT,
    sources: [{ label: 'DVIDS — USS Princeton returns to San Diego after 9-month deployment', url: 'https://www.dvidshub.net/news/545459/uss-princeton-returns-san-diego-after-9-month-deployment' }],
  }),
  ship('us-cg-65', 'USS Chosin (CG-65)', POINT_LOMA, 15, UNDET_COUNT, { role: 'Guided-missile cruiser · decommissioning scheduled FY2027', ...TICONDEROGA_FIT, sources: [{ label: 'Wikipedia — USS Chosin (CG-65)', url: 'https://en.wikipedia.org/wiki/USS_Chosin_(CG-65)' }] }),
  ship('us-cg-70', 'USS Lake Erie (CG-70)', POINT_LOMA, 16, UNDET_COUNT, {
    role: 'Guided-missile cruiser · conflicting sourcing on CSG assignment (CSG-11 vs. independent Caribbean/SOUTHCOM operations, Sep–Dec 2025); decommissioning scheduled 30 Sep 2026',
    ...TICONDEROGA_FIT,
    sources: [{ label: 'Wikipedia — USS Lake Erie (CG-70)', url: 'https://en.wikipedia.org/wiki/USS_Lake_Erie_(CG-70)' }],
  }),
  // Aircraft carriers, mid-overhaul with no current CSG assignment
  ship('us-cvn-74', 'USS John C. Stennis (CVN-74)', NORFOLK, 17, UNDET_COUNT, {
    role: 'Aircraft carrier · in RCOH (refueling complex overhaul) at Newport News since 2021, expected completion ~Oct 2026; future homeport Bremerton, WA; CSG-3 flagship role transferred to USS Abraham Lincoln during overhaul',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [{ label: 'National Security Journal — Stennis 5.5 years trapped in port', url: 'https://nationalsecurityjournal.org/5-5-years-trapped-in-port-a-u-s-navy-nuclear-aircraft-carrier-has-been-under-repair-for-years/' }],
  }),
  ship('us-cvn-76', 'USS Ronald Reagan (CVN-76)', BREMERTON, 18, UNDET_COUNT, {
    role: 'Aircraft carrier · completing a 17-month DPIA overhaul at Puget Sound Naval Shipyard, sea trials pending; full fleet return expected early 2027; no CSG reassignment announced',
    radars: NIMITZ_RADARS,
    weapons: NIMITZ_WEAPONS,
    sources: [{ label: 'Forbes — USS Ronald Reagan nearing return to service', url: 'https://www.forbes.com/sites/petersuciu/2026/08/11/uss-ronald-reagan-nearing-return-to-service-as-navy-faces-carrier-shortage/' }],
  }),
  // Amphibious ships — ARG/PHIBRON pairing not confirmed for the current cycle
  ship('us-lpd-25', 'USS Somerset (LPD-25)', POINT_LOMA, 19, UNDET_COUNT, {
    role: 'Amphibious transport dock · 2025 pairing was Boxer ARG w/ Harpers Ferry, but the Jun 2026 Boxer ARG roster shows Portland/Comstock instead — current pairing unconfirmed',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'CPF — USS Somerset returns home after Indo-Pacific deployment', url: 'https://www.cpf.navy.mil/Newsroom/News/Article/3872644/uss-somerset-lpd-25-returns-home-after-indo-pacific-deployment/' }],
  }),
  ship('us-lpd-29', 'USS Richard M. McCool Jr. (LPD-29)', NORFOLK, 20, UNDET_COUNT, {
    role: 'Amphibious transport dock · homeport corrected to Norfolk, VA (master roster lists San Diego, but Navy.mil/DVIDS/Seapower all confirm Norfolk since commissioning, Sep 2024); no ARG/PHIBRON assignment found',
    radars: SAN_ANTONIO_RADARS,
    weapons: SAN_ANTONIO_WEAPONS,
    sources: [{ label: 'Navy.mil — USS Richard M. McCool, Jr. commissions', url: 'https://www.navy.mil/Press-Office/News-Stories/Article/3898726/uss-richard-m-mccool-jr-commissions/' }],
  }),
  ship('us-lsd-46', 'USS Tortuga (LSD-46)', LITTLE_CREEK, 21, UNDET_COUNT, {
    role: 'Dock landing ship · returned to sea Mar 2026 after a 10-year SLEP layup; ARG assignment not yet established',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'Army Recognition — USS Tortuga returns to sea', url: 'https://www.armyrecognition.com/news/navy-news/2026/us-navys-uss-tortuga-landing-ship-returns-to-sea-after-10-years-for-us-marines-operations' }],
  }),
  ship('us-lsd-42', 'USS Germantown (LSD-42)', POINT_LOMA, 22, UNDET_COUNT, {
    role: 'Dock landing ship · homeport corrected to San Diego, CA (master roster lists Sasebo, Japan, stale since a 2021 shift); scheduled for inactivation 29 Sep 2026; no ARG assignment found',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'Wikipedia — USS Germantown (LSD-42)', url: 'https://en.wikipedia.org/wiki/USS_Germantown_(LSD-42)' }],
  }),
  ship('us-lsd-49', 'USS Harpers Ferry (LSD-49)', POINT_LOMA, 23, UNDET_COUNT, {
    role: 'Dock landing ship · 2025 pairing was Boxer ARG w/ Somerset; current 2026 ARG unconfirmed',
    radars: WHIDBEY_ISLAND_RADARS,
    weapons: WHIDBEY_ISLAND_WEAPONS,
    sources: [{ label: 'CPF — USS Somerset returns home after Indo-Pacific deployment', url: 'https://www.cpf.navy.mil/Newsroom/News/Article/3872644/uss-somerset-lpd-25-returns-home-after-indo-pacific-deployment/' }],
  }),
  // Lewis and Clark-class dry cargo/ammunition ships (T-AKE, MSC-crewed
  // USNS) — every source checked describes MSC tasking as dynamic and not
  // publicly tracked the way commissioned combat-ship assignments are; two
  // hulls had a stale/dated partial fleet reference (2023, historical),
  // not a current standing assignment, so all 14 are placed here rather
  // than asserting a command relationship that isn't actually current.
  ship('us-take-1', 'USNS Lewis and Clark (T-AKE-1)', NORFOLK, 24, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [{ label: 'Wikipedia — USNS Lewis and Clark (T-AKE-1)', url: 'https://en.wikipedia.org/wiki/USNS_Lewis_and_Clark_(T-AKE-1)' }] }),
  ship('us-take-2', 'USNS Sacagawea (T-AKE-2)', NORFOLK, 25, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [{ label: 'Wikipedia — USNS Sacagawea (T-AKE-2)', url: 'https://en.wikipedia.org/wiki/USNS_Sacagawea_(T-AKE-2)' }] }),
  ship('us-take-3', 'USNS Alan Shepard (T-AKE-3)', BAHRAIN, 26, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed · Fifth Fleet AOR as of 2023 (dated, not confirmed current)', ...TAKE_FIT, sources: [{ label: 'Wikipedia — USNS Alan Shepard', url: 'https://en.wikipedia.org/wiki/USNS_Alan_Shepard' }] }),
  ship('us-take-4', 'USNS Richard E. Byrd (T-AKE-4)', PEARL_HARBOR, 27, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed · Pacific Fleet, operates Far East/Indian Ocean', ...TAKE_FIT, sources: [{ label: 'Wikipedia — USNS Richard E. Byrd', url: 'https://en.wikipedia.org/wiki/USNS_Richard_E._Byrd' }] }),
  ship('us-take-5', 'USNS Robert E. Peary (T-AKE-5)', NORFOLK, 28, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [{ label: 'GlobalSecurity.org — USNS Robert E. Peary', url: 'https://www.globalsecurity.org/military/library/news/2010/02/mil-100227-nns04.htm' }] }),
  ship('us-take-6', 'USNS Amelia Earhart (T-AKE-6)', NORFOLK, 29, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-7', 'USNS Carl Brashear (T-AKE-7)', NORFOLK, 30, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-8', 'USNS Wally Schirra (T-AKE-8)', NORFOLK, 31, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-9', 'USNS Matthew Perry (T-AKE-9)', NORFOLK, 32, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-10', 'USNS Charles Drew (T-AKE-10)', NORFOLK, 33, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-11', 'USNS Washington Chambers (T-AKE-11)', NORFOLK, 34, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-12', 'USNS William McLean (T-AKE-12)', NORFOLK, 35, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-13', 'USNS Medgar Evers (T-AKE-13)', NORFOLK, 36, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-take-14', 'USNS Cesar Chavez (T-AKE-14)', NORFOLK, 37, UNDET_COUNT, { role: 'Dry cargo/ammunition ship, MSC-crewed', ...TAKE_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  // Spearhead-class expeditionary fast transports (EPF, MSC-crewed USNS) —
  // same dynamic-MSC-tasking rationale as the T-AKEs above.
  ship('us-epf-5', 'USNS Trenton (T-EPF-5)', NORFOLK, 38, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [{ label: 'Wikipedia — Spearhead-class expeditionary fast transport', url: 'https://en.wikipedia.org/wiki/Spearhead-class_expeditionary_fast_transport' }] }),
  ship('us-epf-6', 'USNS Brunswick (T-EPF-6)', NORFOLK, 39, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-7', 'USNS Carson City (T-EPF-7)', NORFOLK, 40, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-8', 'USNS Yuma (T-EPF-8)', POINT_LOMA, 41, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-9', 'USNS City of Bismarck (T-EPF-9)', POINT_LOMA, 42, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-10', 'USNS Burlington (T-EPF-10)', NORFOLK, 43, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-11', 'USNS Puerto Rico (T-EPF-11)', NORFOLK, 44, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-12', 'USNS Newport (T-EPF-12)', NORFOLK, 45, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-13', 'USNS Apalachicola (T-EPF-13)', NORFOLK, 46, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-14', 'USNS Cody (T-EPF-14)', POINT_LOMA, 47, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
  ship('us-epf-15', 'USNS Point Loma (T-EPF-15)', POINT_LOMA, 48, UNDET_COUNT, { role: 'Expeditionary fast transport, MSC-crewed', ...EPF_FIT, sources: [WIKI_CURRENT_SHIPS] }),
];
const undeterminedCommand: OobDraft = {
  id: 'us-navy-undetermined',
  name: 'Undetermined Command',
  role: 'Commissioned hulls whose current squadron/task-force assignment could not be verified from available sources',
  kind: 'group',
  children: undeterminedShips,
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
    id: 'cn',
    name: 'China',
    kind: 'country',
    children: [plaNavy],
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
          secondFleet,
          thirdFleet,
          fourthFleet,
          fifthFleet,
          sixthFleet,
          seventhFleet,
          tenthFleet,
          submarineForcePacific,
          submarineForceAtlantic,
          undeterminedCommand,
        ],
      },
      {
        id: 'us-af',
        name: 'US Air Force',
        kind: 'branch',
        children: [
          firstAirForce,
          secondAirForce,
          thirdAirForce,
          fourthAirForce,
          fifthAirForce,
          seventhAirForce,
          eighthAirForce,
          ninthAirForce,
          tenthAirForce,
          eleventhAirForce,
          twelfthAirForce,
          thirteenthAirForce,
          fifteenthAirForce,
          sixteenthAirForce,
          eighteenthAirForce,
          nineteenthAirForce,
          twentiethAirForce,
          twentyFirstAirForce,
          twentySecondAirForce,
        ],
      },
    ],
  },
];

export const OOB_TREE: OobNode[] = finalize(RAW_TREE);

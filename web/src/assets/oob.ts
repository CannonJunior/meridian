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
  opts: { role?: string; status?: ObjectStatus; class?: string; lengthM?: number; displacementT?: number; radars?: RadarSystem[]; weapons?: WeaponSystem[] } = {},
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

// -- Yokosuka-based hulls: flagship, CSG-5, DESRON 15 (14 total) --------
const YOKOSUKA_COUNT = 14;
const blueRidge = ship('us-7f-flagship', 'USS Blue Ridge (LCC-19)', YOKOSUKA, 0, YOKOSUKA_COUNT, { role: 'Fleet flagship', radars: BLUE_RIDGE_RADARS, weapons: BLUE_RIDGE_WEAPONS });
const csg5Ships: OobDraft[] = [
  ship('us-cvn-73', 'USS George Washington (CVN-73)', YOKOSUKA, 1, YOKOSUKA_COUNT, { role: 'Aircraft carrier · CSG-5 flagship', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS }),
  ship('us-cg-62', 'USS Robert Smalls (CG-62)', YOKOSUKA, 2, YOKOSUKA_COUNT, { role: 'Guided-missile cruiser', ...TICONDEROGA_FIT }),
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

// -- Guam-based hulls: submarine tenders + attack submarine (3 total) ----
const GUAM_COUNT = 3;
const guamShips: OobDraft[] = [
  ship('us-as-39', 'USS Emory S. Land (AS-39)', GUAM, 0, GUAM_COUNT, { role: 'Submarine tender', radars: EMORY_LAND_AS_RADARS, weapons: EMORY_LAND_AS_WEAPONS }),
  ship('us-as-40', 'USS Frank Cable (AS-40)', GUAM, 1, GUAM_COUNT, { role: 'Submarine tender', radars: EMORY_LAND_AS_RADARS, weapons: EMORY_LAND_AS_WEAPONS }),
  ship('us-ssn-722', 'USS Key West (SSN-722)', GUAM, 2, GUAM_COUNT, { role: 'Attack submarine', status: 'OBSCURED', radars: LOS_ANGELES_SSN_RADARS, weapons: LOS_ANGELES_SSN_WEAPONS }),
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

const thirdFleetShips: OobDraft[] = [
  ship('us-cvn-70', 'USS Carl Vinson (CVN-70)', POINT_LOMA, 0, 1, { role: 'Aircraft carrier · one of several San Diego-homeported carriers rotating through Pacific Fleet strike groups (not permanently Third Fleet)', radars: NIMITZ_RADARS, weapons: NIMITZ_WEAPONS }),
];

const fifthFleetShips: OobDraft[] = [
  ship('us-ddg-103', 'USS Truxtun (DDG-103)', BAHRAIN, 0, 3, { role: 'Guided-missile destroyer', ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-119', 'USS Delbert D. Black (DDG-119)', BAHRAIN, 1, 3, { role: 'Guided-missile destroyer · Task Force 55', ...ARLEIGH_BURKE_FIT }),
  ship('us-lcs-32', 'USS Santa Barbara (LCS-32)', BAHRAIN, 2, 3, { role: 'Littoral combat ship · Task Force 59 (unmanned & innovation)', radars: INDEPENDENCE_LCS_RADARS, weapons: INDEPENDENCE_LCS_WEAPONS }),
];

const mountWhitney = ship('us-lcc-20', 'USS Mount Whitney (LCC-20)', GAETA, 0, 1, { role: 'Fleet flagship', radars: BLUE_RIDGE_RADARS, weapons: BLUE_RIDGE_WEAPONS });
const desron60Ships: OobDraft[] = [
  ship('us-ddg-51', 'USS Arleigh Burke (DDG-51)', ROTA, 0, 6, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-75', 'USS Donald Cook (DDG-75)', ROTA, 1, 6, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-79', 'USS Oscar Austin (DDG-79)', ROTA, 2, 6, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-80', 'USS Roosevelt (DDG-80)', ROTA, 3, 6, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-84', 'USS Bulkeley (DDG-84)', ROTA, 4, 6, { ...ARLEIGH_BURKE_FIT }),
  ship('us-ddg-117', 'USS Paul Ignatius (DDG-117)', ROTA, 5, 6, { ...ARLEIGH_BURKE_FIT }),
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

const secondFleet: OobDraft = {
  id: 'us-navy-2f',
  name: 'U.S. Second Fleet',
  role: 'North Atlantic, Caribbean & Arctic approaches · HQ Naval Support Activity Hampton Roads, VA',
  kind: 'fleet',
  children: [
    { id: 'us-2f-tf20', name: 'Task Force 20 — Battle Force', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-2f-tf21', name: 'Task Force 21 — Patrol and Reconnaissance Force', role: 'Maritime patrol aircraft coordination', kind: 'command' },
    { id: 'us-2f-tf22', name: 'Task Force 22 — Amphibious Force', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-2f-tf23', name: 'Task Force 23 — Logistics', role: 'Combat logistics coordination', kind: 'command' },
    { id: 'us-2f-tf24', name: 'Task Force 24 — Anti-Submarine Warfare', role: 'ASW coordination, North Atlantic', kind: 'command' },
    { id: 'us-2f-tf25', name: 'Task Force 25 — Mine Warfare', role: 'Mine countermeasure coordination', kind: 'command' },
    { id: 'us-2f-tf26', name: 'Task Force 26 — Expeditionary Force', role: 'Expeditionary coordination', kind: 'command' },
    { id: 'us-2f-tf27', name: 'Task Force 27 — Surface Warfare', role: 'Surface combatant coordination', kind: 'command' },
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
    { id: 'us-3f-csg', name: 'Carrier Strike Groups 1, 3, 9, 11 & 15', role: 'Rotating carrier strike group assignments', kind: 'group', children: thirdFleetShips },
    { id: 'us-3f-esg3', name: 'Expeditionary Strike Group 3', role: 'Amphibious force coordination', kind: 'command' },
    { id: 'us-3f-nsg-midpac', name: 'Naval Surface Group Mid-Pacific', role: 'Surface combatant coordination', kind: 'command' },
    { id: 'us-3f-lcsron1', name: 'Littoral Combat Ship Squadron One', role: 'LCS force-provider HQ', kind: 'squadron' },
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
    { id: 'us-5f-tf51', name: 'Task Force 51 — Amphibious / Expeditionary Strike Group', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-5f-tf52', name: 'Task Force 52 — Mine Countermeasures', role: 'Force-provider HQ — no permanently assigned hulls', kind: 'command' },
    { id: 'us-5f-tf53', name: 'Task Force 53 — Logistics', role: 'Combat logistics coordination', kind: 'command' },
    { id: 'us-5f-tf54', name: 'Task Force 54 — Submarines', role: 'Submarine operations coordination', kind: 'command' },
    { id: 'us-5f-tf55', name: 'Task Force 55 — Surface Combatants', role: 'Destroyer Squadron 50 element', kind: 'command', children: [fifthFleetShips[0], fifthFleetShips[1]] },
    { id: 'us-5f-tf56', name: 'Task Force 56 — Navy Expeditionary Combat Command', role: 'Expeditionary/riverine coordination', kind: 'command' },
    { id: 'us-5f-tf57', name: 'Task Force 57 — Maritime Patrol and Reconnaissance', role: 'MPA coordination', kind: 'command' },
    { id: 'us-5f-tf58', name: 'Task Force 58 — Northern Persian Gulf', role: 'Surveillance & escort coordination', kind: 'command' },
    { id: 'us-5f-tf59', name: 'Task Force 59 — Unmanned Systems & Innovation', role: 'Unmanned/AI integration', kind: 'command', children: [fifthFleetShips[2]] },
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
    { id: 'us-6f-tf63', name: 'Task Force 63 — Logistics', role: 'Combat logistics coordination', kind: 'command' },
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

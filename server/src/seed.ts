import type { AtoDay, Effector, FriendlyUnit, LogEntry, Nai, Sensor, Sortie, State, Target } from './types.js';

// Transcribed verbatim from design_handoff_meridian_fires_c2/Meridian Fires C2.dc.html
// (constructor of `class Component extends DCLogic`, lines ~744-807) — with
// the original abstract 0-100 x/y grid coordinates replaced by real WGS84
// lng/lat, computed by applying the old grid's linear mapping onto the AO
// bounding box (mapProjection.ts's former AO_BOUNDS/toLngLat) exactly once,
// so the opening picture looks the same as it always has, but every
// coordinate from here on is real and everything downstream (distance,
// bearing, MGRS, GeoServer) can treat it as such.

export const SEED_SENSORS: Sensor[] = [
  { id: 'HAWK01', callsign: 'HAWK-01', platform: 'MQ-9A REAPER', intType: 'EO/IR · SAR', status: 'ON STATION', tasking: 'NAI-3 · VIPER', endur: 78, lng: -5.78, lat: 36.13, cov: 'cone', covDir: 120, altFt: 25000 },
  { id: 'GLOBE7', callsign: 'GLOBE-7', platform: 'RQ-4 GLOBAL HAWK', intType: 'WAS · GMTI', status: 'ON STATION', tasking: 'NAI-1 · WIDE', endur: 64, lng: -5.492, lat: 36.18, cov: 'wide', altFt: 55000 },
  { id: 'SENTRY3', callsign: 'SENTRY-3', platform: 'E-3G SENTRY', intType: 'AEW RADAR', status: 'ON STATION', tasking: 'AIR PICTURE', endur: 52, lng: -5.348, lat: 35.94, cov: 'area', altFt: 31000 },
  { id: 'ORACLE', callsign: 'ORACLE', platform: 'GEOINT SAT', intType: 'EO / OVERHEAD', status: 'TASKED', tasking: 'NAI-2 · ANVIL', endur: 90, lng: -5.636, lat: 36.0, cov: 'none', altFt: null },
  { id: 'PROWLER', callsign: 'PROWLER-2', platform: 'RC-135V RIVET', intType: 'ELINT / SIGINT', status: 'ON STATION', tasking: 'EMITTER GEO', endur: 71, lng: -5.888, lat: 35.9, cov: 'none', altFt: 33000 },
  { id: 'GREY', callsign: 'GREYHOUND', platform: 'AN/TPS-80 G/ATOR', intType: 'GROUND MTI', status: 'DEGRADED', tasking: '— FAULT —', endur: 33, lng: -5.924, lat: 35.81, cov: 'none', altFt: null },
];

export const SEED_UNITS: FriendlyUnit[] = [
  { id: 'CSG1', callsign: 'CSG-1', platform: 'CARRIER STRIKE GROUP', type: 'NAVAL TASK FORCE', role: 'SEA CONTROL / STRIKE', status: 'ON STATION', lng: -5.942, lat: 35.82, weapon: 'CVW · 44 AC · 3 ESCORTS', endur: 88, effId: null },
  { id: 'ARLEIGHU', callsign: 'ARLEIGH', platform: 'DDG-113 ARLEIGH BURKE', type: 'GUIDED-MISSILE DESTROYER', role: 'STRIKE / AAW / BMD', status: 'ON STATION', lng: -5.888, lat: 35.85, weapon: 'TLAM Blk V ×8 · SM-6', endur: 80, effId: 'ARLEIGH' },
  { id: 'CAP3', callsign: 'CAP-3', platform: 'F-15EX ×2', type: 'COMBAT AIR PATROL', role: 'OCA / DCA', status: 'AIRBORNE', lng: -5.42, lat: 35.81, weapon: 'AIM-120D ×6 · AIM-9X', endur: 55, effId: null },
];

export const SEED_NAIS: Nai[] = [
  { id: 'NAI-1', desc: 'Coastal AShM belt', pir: 'PIR-1', color: '#ffab38', lngMin: -5.555, latMin: 36.11, lngMax: -5.285, latMax: 36.21 },
  { id: 'NAI-2', desc: 'TBM dispersal area', pir: 'PIR-1', color: '#ff5a47', lngMin: -5.708, latMin: 35.94, lngMax: -5.51, latMax: 36.05 },
  { id: 'NAI-3', desc: 'IADS / SAM ring', pir: 'PIR-2', color: '#ffd23f', lngMin: -5.87, latMin: 36.06, lngMax: -5.654, latMax: 36.16 },
];

export const SEED_EFFECTORS: Effector[] = [
  { id: 'HORNET21', callsign: 'HORNET-21', platform: 'F/A-18E', weapon: 'AGM-88G HARM ×2', status: 'AIRBORNE', tot: 5, rng: 80, suits: ['SAM', 'RADAR', 'EMIT'], stealth: false, kinetic: true, altFt: 28000 },
  { id: 'VENOM1', callsign: 'VENOM-1', platform: 'F-35A', weapon: 'AGM-158 JASSM-ER ×2', status: 'AIRBORNE', tot: 7, rng: 500, suits: ['SAM', 'C2', 'TEL', 'RADAR'], stealth: true, kinetic: true, altFt: 32000 },
  { id: 'ARLEIGH', callsign: 'ARLEIGH', platform: 'DDG-113', weapon: 'TLAM Blk V ×8', status: 'ON STATION', tot: 16, rng: 900, suits: ['C2', 'SAM', 'TEL', 'SHIP'], stealth: false, kinetic: true, altFt: null },
  { id: 'STEELRAIN', callsign: 'STEEL-RAIN', platform: 'M142 HIMARS', weapon: 'PrSM ×2', status: 'GROUND ALERT', tot: 9, rng: 270, suits: ['SHIP', 'SAM', 'TEL', 'C2'], stealth: false, kinetic: true, altFt: null },
  { id: 'REAPER04', callsign: 'REAPER-04', platform: 'MQ-9A', weapon: 'AGM-114R ×4', status: 'AIRBORNE', tot: 4, rng: 8, suits: ['BOAT', 'TROOP', 'UAS', 'RADAR'], stealth: false, kinetic: true, altFt: 22000 },
  { id: 'WIDOW3', callsign: 'WIDOW-3', platform: 'EA-18G', weapon: 'NON-KINETIC JAM', status: 'AIRBORNE', tot: 3, rng: 60, suits: ['RADAR', 'EMIT', 'UAS'], stealth: false, kinetic: false, altFt: 27000 },
];

const mk = (
  o: Omit<Target, 'effector' | 'engagedAt' | 'bda' | 'course' | 'speed' | 'nsl' | 'altFt' | 'vsFtMin'> &
    Partial<Pick<Target, 'effector' | 'engagedAt' | 'bda' | 'course' | 'speed' | 'nsl' | 'altFt' | 'vsFtMin'>>,
): Target => ({
  course: 0,
  speed: 0,
  effector: null,
  engagedAt: null,
  bda: null,
  nsl: false,
  altFt: null,
  vsFtMin: null,
  ...o,
});

export const SEED_TARGETS: Target[] = [
  mk({ id: 'T2202', name: 'ANVIL', type: 'SS-26 ISKANDER TEL', cat: 'TEL', aff: 'HOS', threat: 'CRIT', stage: 3, pri: 1, conf: 91, trkQ: 88, lng: -5.672, lat: 36.02, course: 84, speed: 18, elev: '+412 M', custody: 'ORACLE', decay: 9, sidc: 'SHGPUCVRT-----', method: 'STEALTH STANDOFF', cde: 'CDE-2', appr: { tea: true, jag: true, pid: true, strike: true }, status: 'CLEARED HOT' }),
  mk({ id: 'T2201', name: 'VIPER', type: 'SA-21 GROWLER SAM', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 1, pri: 2, conf: 96, trkQ: 94, lng: -5.816, lat: 36.14, elev: '+88 M', custody: 'HAWK01', decay: 6, sidc: 'SHGPUCDAS-----', method: 'HARM SUPPRESS', cde: 'CDE-1', appr: { tea: false, jag: true, pid: true, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2205', name: 'BASTION', type: 'YJ-12 AShM BTY', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 1, pri: 3, conf: 84, trkQ: 79, lng: -5.474, lat: 36.19, elev: '+24 M', custody: 'GLOBE7', decay: 14, sidc: 'SHGPUCDM------', method: 'STANDOFF', cde: 'CDE-2', appr: { tea: false, jag: true, pid: false, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2208', name: 'WARDEN', type: 'IADS C2 BUNKER', cat: 'C2', aff: 'HOS', threat: 'HIGH', stage: 2, pri: 4, conf: 88, trkQ: 90, lng: -5.744, lat: 35.93, elev: '-6 M', custody: 'PROWLER', decay: 11, sidc: 'SHGPUUSC------', method: 'PENETRATOR', cde: 'CDE-3', appr: { tea: false, jag: true, pid: true, strike: true }, status: 'IN COORD' }),
  mk({ id: 'T2203', name: 'REEF', type: 'TYPE-052D DDG', cat: 'SHIP', aff: 'HOS', threat: 'HIGH', stage: 2, pri: 5, conf: 82, trkQ: 76, lng: -5.33, lat: 36.05, course: 215, speed: 22, elev: 'SURFACE', custody: 'GLOBE7', decay: 19, sidc: 'SHSPCLDD------', method: 'AShM SALVO', cde: 'CDE-1', appr: { tea: false, jag: true, pid: true, strike: false }, status: 'IN COORD' }),
  mk({ id: 'T2209', name: 'TANGENT', type: 'SA-22 GREYHOUND', cat: 'SAM', aff: 'HOS', threat: 'MED', stage: 1, pri: 6, conf: 74, trkQ: 68, lng: -5.618, lat: 36.1, course: 300, speed: 14, elev: '+102 M', custody: 'HAWK01', decay: 22, sidc: 'SHGPUCDAS-----', method: 'HARM SUPPRESS', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2206', name: 'EMBER', type: 'YLC-8B EW RADAR', cat: 'RADAR', aff: 'HOS', threat: 'MED', stage: 0, pri: 7, conf: 71, trkQ: 61, lng: -5.852, lat: 36.0, elev: '+140 M', custody: 'PROWLER', decay: 28, sidc: 'SHGPUCRRD-----', method: 'NON-KINETIC', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2207', name: 'GHOST', type: 'TYPE-022 FAC ×3', cat: 'BOAT', aff: 'HOS', threat: 'MED', stage: 0, pri: 8, conf: 69, trkQ: 64, lng: -5.402, lat: 35.98, course: 190, speed: 34, elev: 'SURFACE', custody: 'GLOBE7', decay: 17, sidc: 'SHSPXM--------', method: 'STRAFE / HELLFIRE', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2204', name: 'KITE', type: 'WJ-700 RECON UAS', cat: 'UAS', aff: 'UNK', threat: 'MED', stage: 0, pri: 9, conf: 58, trkQ: 55, lng: -5.546, lat: 36.13, course: 140, speed: 96, elev: '+5,800 M', custody: 'SENTRY3', decay: 8, sidc: 'SUAPMFQ-------', method: '—', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED', altFt: 19000, vsFtMin: 0 }),
  mk({ id: 'T2211', name: 'OUTPOST', type: 'MECH INF COY', cat: 'TROOP', aff: 'HOS', threat: 'LOW', stage: 0, pri: 10, conf: 63, trkQ: 58, lng: -5.78, lat: 35.86, elev: '+60 M', custody: 'GREY', decay: 41, sidc: 'SHGPUCI-------', method: 'AREA / GMLRS', cde: 'CDE-3', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2212', name: 'HALO', type: 'UNK SIGINT EMITTER', cat: 'EMIT', aff: 'UNK', threat: 'LOW', stage: 0, pri: 11, conf: 44, trkQ: 38, lng: -5.888, lat: 36.06, elev: '—', custody: 'PROWLER', decay: 52, sidc: 'SUPP----------', method: '—', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'UNRESOLVED' }),
  mk({ id: 'T2210', name: 'DRIFT', type: 'M/V CARGO (CIV)', cat: 'SHIP', aff: 'NEU', threat: 'LOW', stage: 0, pri: null, conf: 97, trkQ: 92, lng: -5.51, lat: 35.91, course: 95, speed: 12, elev: 'SURFACE', custody: 'GLOBE7', decay: 7, nsl: true, sidc: 'SNSPXMTU------', method: 'NO-STRIKE', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'NO-STRIKE' }),
  mk({ id: 'T2198', name: 'FORGE', type: 'HQ-9 SAM SITE', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 4, pri: null, conf: 99, trkQ: 0, lng: -5.708, lat: 36.18, elev: '+96 M', custody: '—', decay: 120, sidc: 'SHGPUCDAS-----', method: 'JASSM ×2', cde: 'CDE-2', effector: 'VENOM1', bda: 'DESTROYED · 2 SECONDARIES', appr: { tea: true, jag: true, pid: true, strike: true }, status: 'NEUTRALIZED' }),
];

export const SEED_LOG: LogEntry[] = [
  { t: 0, tag: 'BDA', text: 'FORGE — strike assessed DESTROYED, 2 secondaries. Re-attack not required.', tag2: 'bda' },
  { t: 0, tag: 'PAIR', text: 'ANVIL paired to VENOM-1 (F-35A) JASSM-ER. TOT 7 min.', tag2: 'pair' },
  { t: 0, tag: 'WARN', text: 'DRIFT (M/V cargo) entered NSZ — no-strike flag asserted.', tag2: 'warn' },
  { t: 0, tag: 'TRK', text: 'REEF custody handed GLOBE-7 → SENTRY-3 cross-cue.', tag2: 'trk' },
  { t: 0, tag: 'DET', text: 'New track T2212 HALO — unresolved SIGINT emitter, PROWLER-2.', tag2: 'det' },
  { t: 0, tag: 'SYS', text: 'ORACLE overhead pass window opens T-06:00 for NAI-2.', tag2: 'sys' },
  { t: 0, tag: 'TRK', text: 'KITE (UAS) inbound 140°/96kt — SENTRY-3 maintains custody.', tag2: 'trk' },
  { t: 0, tag: 'DET', text: 'VIPER classified SA-21 GROWLER, conf 96%, HAWK-01 EO/IR.', tag2: 'det' },
];

// Phase A fixtures for the "Rolling Air Picture" plan — one AO's worth of
// packages spanning D-1 (assessing) through D+2 (planning), across the
// full ATO's mission-type spread, not just strike/SEAD. Cross-references
// existing SEED_TARGETS/SEED_EFFECTORS/SEED_SENSORS ids where a real
// platform or DMPI already exists in this fixture set, rather than
// inventing parallel data.
//
// Timestamps are computed relative to *server startup*, not hardcoded —
// per the design brief's resolved RT-01 finding, a Sortie's clock is real
// UTC time, never Meridian's abstract sim tick. That does mean these
// fixtures only look like "today" until the DB that seeded them is reset
// (resetToSeed()) — acceptable for a Phase A fixture; Phase B's timeline
// strip is what actually needs to reason about elapsed real time, not
// this seed data staying evergreen indefinitely.
//
// originAirfield/recoveryAirfield are real ICAO codes (Phase C) for
// airfields this AO's `airfields` GeoServer layer actually carries an
// `icao` property for: LXGB (Royal Air Force Gibraltar), LEMO (Base Aérea
// de Morón), LERT (Aeropuerto de la Base Naval de Rota) — see
// web/src/airfieldIcaoIndex.ts for the resolver.
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED_EPOCH = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
function atoTime(offsetDays: number, hh: number, mm: number): string {
  return new Date(SEED_EPOCH + offsetDays * DAY_MS + hh * 3_600_000 + mm * 60_000).toISOString();
}
function atoDayLabel(offsetDays: number): AtoDay {
  return (offsetDays === 0 ? 'D0' : offsetDays > 0 ? `D+${offsetDays}` : `D${offsetDays}`) as AtoDay;
}

export const SEED_SORTIES: Sortie[] = [
  // D-1 — assessing. Struck FORGE (T2198), which SEED_TARGETS still
  // carries as NEUTRALIZED/stage 4 with a free-text bda written before
  // Phase F existed ('DESTROYED · 2 SECONDARIES'). Deliberately left
  // divergent from this sortie's own, later, more careful assessment
  // below (PDA confirms the hit, but FDA is INCONCLUSIVE — the aimpoint
  // was struck but functional loss isn't confirmed) rather than patched
  // to match: reconciling Target.bda's free-text field with a sortie's
  // structured ladder was explicitly out of Phase F's scope (see the
  // design brief's §III.6), and a unit-level "still reads NEUTRALIZED"
  // status lagging a more careful follow-up assessment is realistic, not
  // a bug to hide.
  {
    id: 'BRAVO-01', packageId: 'BRAVO', callsign: 'VIPER-19', platform: 'F-35A', linkedPlatformId: null,
    missionType: 'STRIKE', originAirfield: 'LXGB', recoveryAirfield: 'LXGB',
    targetIds: ['T2198'], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(-1, 6, 10), totWindowEnd: atoTime(-1, 6, 25), status: 'COMPLETE', atoDay: atoDayLabel(-1),
    bda: { T2198: { pda: 'ASSESSED', fda: 'INCONCLUSIVE', tsa: 'PENDING', reattackRecommended: true, note: 'Aimpoint hit confirmed (PDA). Radar van intact in follow-up imagery — TEL functional status unconfirmed. Reattack recommended next ATO cycle.' } },
  },

  // D0 — execution. Package ALPHA: SEAD + strike + non-kinetic jamming
  // escort + tanker support + AEW, all in the same package, tasked
  // against the two live HOS tracks already staged for strike (VIPER,
  // ANVIL) in SEED_TARGETS.
  {
    id: 'ALPHA-01', packageId: 'ALPHA', callsign: 'HORNET-21', platform: 'F/A-18E', linkedPlatformId: 'HORNET21',
    missionType: 'SEAD', originAirfield: 'LEMO', recoveryAirfield: 'LEMO',
    targetIds: ['T2201'], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 8, 47), totWindowEnd: atoTime(0, 9, 2), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  {
    id: 'ALPHA-02', packageId: 'ALPHA', callsign: 'VENOM-1', platform: 'F-35A', linkedPlatformId: 'VENOM1',
    missionType: 'STRIKE', originAirfield: 'LXGB', recoveryAirfield: 'LXGB',
    targetIds: ['T2202'], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 9, 2), totWindowEnd: atoTime(0, 9, 17), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  {
    id: 'ALPHA-03', packageId: 'ALPHA', callsign: 'WIDOW-3', platform: 'EA-18G', linkedPlatformId: 'WIDOW3',
    missionType: 'SEAD', originAirfield: 'LEMO', recoveryAirfield: 'LEMO',
    targetIds: [], supportedSortieIds: ['ALPHA-01', 'ALPHA-02'], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 8, 40), totWindowEnd: atoTime(0, 9, 25), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  {
    id: 'ALPHA-04', packageId: 'ALPHA', callsign: 'TEXACO-3', platform: 'KC-135R', linkedPlatformId: null,
    missionType: 'AAR', originAirfield: 'LERT', recoveryAirfield: 'LERT',
    targetIds: [], supportedSortieIds: ['ALPHA-01', 'ALPHA-02', 'ALPHA-03'], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 8, 15), totWindowEnd: atoTime(0, 10, 15), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  {
    id: 'ALPHA-05', packageId: 'ALPHA', callsign: 'SENTRY-3', platform: 'E-3G SENTRY', linkedPlatformId: 'SENTRY3',
    missionType: 'AEW', originAirfield: 'LEMO', recoveryAirfield: 'LEMO',
    targetIds: [], supportedSortieIds: ['ALPHA-01', 'ALPHA-02', 'ALPHA-03'], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 7, 30), totWindowEnd: atoTime(0, 11, 30), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  // D0 — independent (unpackaged) ISR and CSAR lines running alongside
  // package ALPHA rather than inside it.
  {
    id: 'ISR-D0-1', packageId: null, callsign: 'HAWK-01', platform: 'MQ-9A REAPER', linkedPlatformId: 'HAWK01',
    missionType: 'ISR', originAirfield: 'LXGB', recoveryAirfield: 'LXGB',
    targetIds: [], supportedSortieIds: [], collectionRequirementIds: ['CPCL-03'],
    totWindowStart: atoTime(0, 4, 0), totWindowEnd: atoTime(0, 14, 0), status: 'AIRBORNE', atoDay: atoDayLabel(0),
    bda: null,
  },
  {
    id: 'CSAR-D0-1', packageId: null, callsign: 'PEDRO-1', platform: 'HH-60W', linkedPlatformId: null,
    missionType: 'CSAR', originAirfield: 'LERT', recoveryAirfield: 'LERT',
    targetIds: [], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(0, 6, 0), totWindowEnd: atoTime(0, 18, 0), status: 'FRAGGED', atoDay: atoDayLabel(0),
    bda: null,
  },

  // D+1 — in production. Fragged, not yet airborne.
  {
    id: 'ISR-D1-1', packageId: null, callsign: 'SENTRY-06', platform: 'E-3G SENTRY', linkedPlatformId: null,
    missionType: 'ISR', originAirfield: 'LEMO', recoveryAirfield: 'LEMO',
    targetIds: [], supportedSortieIds: [], collectionRequirementIds: ['CPCL-04'],
    totWindowStart: atoTime(1, 11, 30), totWindowEnd: atoTime(1, 19, 30), status: 'FRAGGED', atoDay: atoDayLabel(1),
    bda: null,
  },
  {
    id: 'AIRLIFT-D1-1', packageId: null, callsign: 'REACH-210', platform: 'C-17A', linkedPlatformId: null,
    missionType: 'AIRLIFT', originAirfield: 'LERT', recoveryAirfield: 'LXGB',
    targetIds: [], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(1, 4, 0), totWindowEnd: atoTime(1, 5, 10), status: 'FRAGGED', atoDay: atoDayLabel(1),
    bda: null,
  },

  // D+2 — in planning (MAAP shell, not yet a hardened ATO line). Tentative
  // strike against BASTION (T2205), still only stage 1 / not yet cleared
  // in SEED_TARGETS — consistent with the target not having cleared
  // approvals this far out.
  {
    id: 'CHARLIE-01', packageId: 'CHARLIE', callsign: 'VIPER-20', platform: 'F-35A', linkedPlatformId: null,
    missionType: 'STRIKE', originAirfield: 'LXGB', recoveryAirfield: 'LXGB',
    targetIds: ['T2205'], supportedSortieIds: [], collectionRequirementIds: [],
    totWindowStart: atoTime(2, 9, 0), totWindowEnd: atoTime(2, 9, 15), status: 'FRAGGED', atoDay: atoDayLabel(2),
    bda: null,
  },
];

// Phase D — a real historical track for the one sortie in SEED_SORTIES
// that's actually COMPLETE (BRAVO-01/VIPER-19), seeded into
// entity_track_history under the 'history-air-tracks' layer_id
// (historyQuery.ts) so Phase C's flight-line rendering has real data to
// source an executed leg from instead of its straight-line approximation.
// Every other sortie (AIRBORNE or FRAGGED) has no history yet, correctly —
// it hasn't happened. Seven points, LXGB (RAF Gibraltar) out to FORGE
// (T2198's real coordinates) and back, centered on BRAVO-01's own TOT
// window rather than a second, independently-chosen time range, so the
// two stay consistent by construction.
export interface HistoryFixturePoint {
  eventId: string;
  entityId: string;
  entityKind: string;
  layerId: string;
  affiliation: string;
  speedKn: number;
  eventTime: string;
  lng: number;
  lat: number;
  attrs: Record<string, unknown>;
}

const LXGB = { lng: -5.349512196179749, lat: 36.15121 };
const FORGE_TARGET = { lng: -5.708, lat: 36.18 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const legPoint = (t: number) => ({ lng: lerp(LXGB.lng, FORGE_TARGET.lng, t), lat: lerp(LXGB.lat, FORGE_TARGET.lat, t) });

export const SEED_AIR_TRACK_HISTORY: HistoryFixturePoint[] = [
  { eventId: '20000000-0000-4000-8000-000000000001', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 180, eventTime: atoTime(-1, 5, 58), ...LXGB, attrs: { sortieId: 'BRAVO-01', altFt: 200, phase: 'departure' } },
  { eventId: '20000000-0000-4000-8000-000000000002', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 420, eventTime: atoTime(-1, 6, 2), ...legPoint(0.25), attrs: { sortieId: 'BRAVO-01', altFt: 22000, phase: 'ingress' } },
  { eventId: '20000000-0000-4000-8000-000000000003', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 480, eventTime: atoTime(-1, 6, 6), ...legPoint(0.6), attrs: { sortieId: 'BRAVO-01', altFt: 28000, phase: 'ingress' } },
  { eventId: '20000000-0000-4000-8000-000000000004', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 350, eventTime: atoTime(-1, 6, 10), ...FORGE_TARGET, attrs: { sortieId: 'BRAVO-01', altFt: 500, phase: 'tot' } },
  { eventId: '20000000-0000-4000-8000-000000000005', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 480, eventTime: atoTime(-1, 6, 14), ...legPoint(0.6), attrs: { sortieId: 'BRAVO-01', altFt: 28000, phase: 'egress' } },
  { eventId: '20000000-0000-4000-8000-000000000006', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 420, eventTime: atoTime(-1, 6, 18), ...legPoint(0.25), attrs: { sortieId: 'BRAVO-01', altFt: 22000, phase: 'egress' } },
  { eventId: '20000000-0000-4000-8000-000000000007', entityId: 'VIPER-19', entityKind: 'aircraft', layerId: 'history-air-tracks', affiliation: 'FRD', speedKn: 160, eventTime: atoTime(-1, 6, 22), ...LXGB, attrs: { sortieId: 'BRAVO-01', altFt: 200, phase: 'recovery' } },
];

export function freshState(): State {
  return {
    t: 0,
    selectedId: 'T2202',
    view: 'MAP',
    roeIdx: 1,
    targets: SEED_TARGETS.map((t) => ({ ...t, appr: { ...t.appr } })),
    sensors: SEED_SENSORS.map((s) => ({ ...s })),
    effectors: SEED_EFFECTORS.map((e) => ({ ...e })),
    units: SEED_UNITS.map((u) => ({ ...u })),
    nais: SEED_NAIS.map((n) => ({ ...n })),
    log: SEED_LOG.map((l) => ({ ...l })),
    sorties: SEED_SORTIES.map((so) => ({ ...so, bda: so.bda ? { ...so.bda } : null })),
  };
}

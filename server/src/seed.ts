import type { Effector, FriendlyUnit, LogEntry, Nai, Sensor, State, Target } from './types.js';

// Transcribed verbatim from design_handoff_meridian_fires_c2/Meridian Fires C2.dc.html
// (constructor of `class Component extends DCLogic`, lines ~744-807).

export const SEED_SENSORS: Sensor[] = [
  { id: 'HAWK01', callsign: 'HAWK-01', platform: 'MQ-9A REAPER', intType: 'EO/IR · SAR', status: 'ON STATION', tasking: 'NAI-3 · VIPER', endur: 78, x: 30, y: 24, cov: 'cone', covDir: 120 },
  { id: 'GLOBE7', callsign: 'GLOBE-7', platform: 'RQ-4 GLOBAL HAWK', intType: 'WAS · GMTI', status: 'ON STATION', tasking: 'NAI-1 · WIDE', endur: 64, x: 62, y: 14, cov: 'wide' },
  { id: 'SENTRY3', callsign: 'SENTRY-3', platform: 'E-3G SENTRY', intType: 'AEW RADAR', status: 'ON STATION', tasking: 'AIR PICTURE', endur: 52, x: 78, y: 62, cov: 'area' },
  { id: 'ORACLE', callsign: 'ORACLE', platform: 'GEOINT SAT', intType: 'EO / OVERHEAD', status: 'TASKED', tasking: 'NAI-2 · ANVIL', endur: 90, x: 46, y: 50, cov: 'none' },
  { id: 'PROWLER', callsign: 'PROWLER-2', platform: 'RC-135V RIVET', intType: 'ELINT / SIGINT', status: 'ON STATION', tasking: 'EMITTER GEO', endur: 71, x: 18, y: 70, cov: 'none' },
  { id: 'GREY', callsign: 'GREYHOUND', platform: 'AN/TPS-80 G/ATOR', intType: 'GROUND MTI', status: 'DEGRADED', tasking: '— FAULT —', endur: 33, x: 14, y: 88, cov: 'none' },
];

export const SEED_UNITS: FriendlyUnit[] = [
  { id: 'CSG1', callsign: 'CSG-1', platform: 'CARRIER STRIKE GROUP', type: 'NAVAL TASK FORCE', role: 'SEA CONTROL / STRIKE', status: 'ON STATION', x: 12, y: 86, weapon: 'CVW · 44 AC · 3 ESCORTS', endur: 88, effId: null },
  { id: 'ARLEIGHU', callsign: 'ARLEIGH', platform: 'DDG-113 ARLEIGH BURKE', type: 'GUIDED-MISSILE DESTROYER', role: 'STRIKE / AAW / BMD', status: 'ON STATION', x: 18, y: 80, weapon: 'TLAM Blk V ×8 · SM-6', endur: 80, effId: 'ARLEIGH' },
  { id: 'CAP3', callsign: 'CAP-3', platform: 'F-15EX ×2', type: 'COMBAT AIR PATROL', role: 'OCA / DCA', status: 'AIRBORNE', x: 70, y: 88, weapon: 'AIM-120D ×6 · AIM-9X', endur: 55, effId: null },
];

export const SEED_NAIS: Nai[] = [
  { id: 'NAI-1', desc: 'Coastal AShM belt', pir: 'PIR-1', color: '#ffab38', x: 55, y: 8, w: 30, h: 20 },
  { id: 'NAI-2', desc: 'TBM dispersal area', pir: 'PIR-1', color: '#ff5a47', x: 38, y: 40, w: 22, h: 22 },
  { id: 'NAI-3', desc: 'IADS / SAM ring', pir: 'PIR-2', color: '#ffd23f', x: 20, y: 18, w: 24, h: 20 },
];

export const SEED_EFFECTORS: Effector[] = [
  { id: 'HORNET21', callsign: 'HORNET-21', platform: 'F/A-18E', weapon: 'AGM-88G HARM ×2', status: 'AIRBORNE', tot: 5, rng: 80, suits: ['SAM', 'RADAR', 'EMIT'], stealth: false, kinetic: true },
  { id: 'VENOM1', callsign: 'VENOM-1', platform: 'F-35A', weapon: 'AGM-158 JASSM-ER ×2', status: 'AIRBORNE', tot: 7, rng: 500, suits: ['SAM', 'C2', 'TEL', 'RADAR'], stealth: true, kinetic: true },
  { id: 'ARLEIGH', callsign: 'ARLEIGH', platform: 'DDG-113', weapon: 'TLAM Blk V ×8', status: 'ON STATION', tot: 16, rng: 900, suits: ['C2', 'SAM', 'TEL', 'SHIP'], stealth: false, kinetic: true },
  { id: 'STEELRAIN', callsign: 'STEEL-RAIN', platform: 'M142 HIMARS', weapon: 'PrSM ×2', status: 'GROUND ALERT', tot: 9, rng: 270, suits: ['SHIP', 'SAM', 'TEL', 'C2'], stealth: false, kinetic: true },
  { id: 'REAPER04', callsign: 'REAPER-04', platform: 'MQ-9A', weapon: 'AGM-114R ×4', status: 'AIRBORNE', tot: 4, rng: 8, suits: ['BOAT', 'TROOP', 'UAS', 'RADAR'], stealth: false, kinetic: true },
  { id: 'WIDOW3', callsign: 'WIDOW-3', platform: 'EA-18G', weapon: 'NON-KINETIC JAM', status: 'AIRBORNE', tot: 3, rng: 60, suits: ['RADAR', 'EMIT', 'UAS'], stealth: false, kinetic: false },
];

const mk = (o: Omit<Target, 'effector' | 'engagedAt' | 'bda' | 'course' | 'speed' | 'nsl'> & Partial<Pick<Target, 'effector' | 'engagedAt' | 'bda' | 'course' | 'speed' | 'nsl'>>): Target => ({
  course: 0,
  speed: 0,
  effector: null,
  engagedAt: null,
  bda: null,
  nsl: false,
  ...o,
});

export const SEED_TARGETS: Target[] = [
  mk({ id: 'T2202', name: 'ANVIL', type: 'SS-26 ISKANDER TEL', cat: 'TEL', aff: 'HOS', threat: 'CRIT', stage: 3, pri: 1, conf: 91, trkQ: 88, x: 42, y: 46, course: 84, speed: 18, elev: '+412 M', custody: 'ORACLE', decay: 9, sidc: 'SHGPUCVRT-----', method: 'STEALTH STANDOFF', cde: 'CDE-2', appr: { tea: true, jag: true, pid: true, strike: true }, status: 'CLEARED HOT' }),
  mk({ id: 'T2201', name: 'VIPER', type: 'SA-21 GROWLER SAM', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 1, pri: 2, conf: 96, trkQ: 94, x: 26, y: 22, elev: '+88 M', custody: 'HAWK01', decay: 6, sidc: 'SHGPUCDAS-----', method: 'HARM SUPPRESS', cde: 'CDE-1', appr: { tea: false, jag: true, pid: true, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2205', name: 'BASTION', type: 'YJ-12 AShM BTY', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 1, pri: 3, conf: 84, trkQ: 79, x: 64, y: 12, elev: '+24 M', custody: 'GLOBE7', decay: 14, sidc: 'SHGPUCDM------', method: 'STANDOFF', cde: 'CDE-2', appr: { tea: false, jag: true, pid: false, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2208', name: 'WARDEN', type: 'IADS C2 BUNKER', cat: 'C2', aff: 'HOS', threat: 'HIGH', stage: 2, pri: 4, conf: 88, trkQ: 90, x: 34, y: 64, elev: '-6 M', custody: 'PROWLER', decay: 11, sidc: 'SHGPUUSC------', method: 'PENETRATOR', cde: 'CDE-3', appr: { tea: false, jag: true, pid: true, strike: true }, status: 'IN COORD' }),
  mk({ id: 'T2203', name: 'REEF', type: 'TYPE-052D DDG', cat: 'SHIP', aff: 'HOS', threat: 'HIGH', stage: 2, pri: 5, conf: 82, trkQ: 76, x: 80, y: 40, course: 215, speed: 22, elev: 'SURFACE', custody: 'GLOBE7', decay: 19, sidc: 'SHSPCLDD------', method: 'AShM SALVO', cde: 'CDE-1', appr: { tea: false, jag: true, pid: true, strike: false }, status: 'IN COORD' }),
  mk({ id: 'T2209', name: 'TANGENT', type: 'SA-22 GREYHOUND', cat: 'SAM', aff: 'HOS', threat: 'MED', stage: 1, pri: 6, conf: 74, trkQ: 68, x: 48, y: 30, course: 300, speed: 14, elev: '+102 M', custody: 'HAWK01', decay: 22, sidc: 'SHGPUCDAS-----', method: 'HARM SUPPRESS', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'TRACKING' }),
  mk({ id: 'T2206', name: 'EMBER', type: 'YLC-8B EW RADAR', cat: 'RADAR', aff: 'HOS', threat: 'MED', stage: 0, pri: 7, conf: 71, trkQ: 61, x: 22, y: 50, elev: '+140 M', custody: 'PROWLER', decay: 28, sidc: 'SHGPUCRRD-----', method: 'NON-KINETIC', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2207', name: 'GHOST', type: 'TYPE-022 FAC ×3', cat: 'BOAT', aff: 'HOS', threat: 'MED', stage: 0, pri: 8, conf: 69, trkQ: 64, x: 72, y: 54, course: 190, speed: 34, elev: 'SURFACE', custody: 'GLOBE7', decay: 17, sidc: 'SHSPXM--------', method: 'STRAFE / HELLFIRE', cde: 'CDE-1', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2204', name: 'KITE', type: 'WJ-700 RECON UAS', cat: 'UAS', aff: 'UNK', threat: 'MED', stage: 0, pri: 9, conf: 58, trkQ: 55, x: 56, y: 24, course: 140, speed: 96, elev: '+5,800 M', custody: 'SENTRY3', decay: 8, sidc: 'SUAPMFQ-------', method: '—', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2211', name: 'OUTPOST', type: 'MECH INF COY', cat: 'TROOP', aff: 'HOS', threat: 'LOW', stage: 0, pri: 10, conf: 63, trkQ: 58, x: 30, y: 78, elev: '+60 M', custody: 'GREY', decay: 41, sidc: 'SHGPUCI-------', method: 'AREA / GMLRS', cde: 'CDE-3', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'IDENTIFIED' }),
  mk({ id: 'T2212', name: 'HALO', type: 'UNK SIGINT EMITTER', cat: 'EMIT', aff: 'UNK', threat: 'LOW', stage: 0, pri: 11, conf: 44, trkQ: 38, x: 18, y: 38, elev: '—', custody: 'PROWLER', decay: 52, sidc: 'SUPP----------', method: '—', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'UNRESOLVED' }),
  mk({ id: 'T2210', name: 'DRIFT', type: 'M/V CARGO (CIV)', cat: 'SHIP', aff: 'NEU', threat: 'LOW', stage: 0, pri: null, conf: 97, trkQ: 92, x: 60, y: 68, course: 95, speed: 12, elev: 'SURFACE', custody: 'GLOBE7', decay: 7, nsl: true, sidc: 'SNSPXMTU------', method: 'NO-STRIKE', cde: '—', appr: { tea: false, jag: false, pid: false, strike: false }, status: 'NO-STRIKE' }),
  mk({ id: 'T2198', name: 'FORGE', type: 'HQ-9 SAM SITE', cat: 'SAM', aff: 'HOS', threat: 'HIGH', stage: 4, pri: null, conf: 99, trkQ: 0, x: 38, y: 14, elev: '+96 M', custody: '—', decay: 120, sidc: 'SHGPUCDAS-----', method: 'JASSM ×2', cde: 'CDE-2', effector: 'VENOM1', bda: 'DESTROYED · 2 SECONDARIES', appr: { tea: true, jag: true, pid: true, strike: true }, status: 'NEUTRALIZED' }),
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
  };
}

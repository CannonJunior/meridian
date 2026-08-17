import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshState } from './seed.js';
import type { Approvals, Effector, FriendlyUnit, LogEntry, Nai, Sensor, State, Target, View } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'meridian.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  t INTEGER NOT NULL,
  selectedId TEXT NOT NULL,
  view TEXT NOT NULL,
  roeIdx INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  cat TEXT NOT NULL,
  aff TEXT NOT NULL,
  threat TEXT,
  stage INTEGER NOT NULL,
  pri INTEGER,
  conf INTEGER NOT NULL,
  trkQ INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  course REAL NOT NULL,
  speed REAL NOT NULL,
  elev TEXT NOT NULL,
  custody TEXT NOT NULL,
  decay INTEGER NOT NULL,
  sidc TEXT NOT NULL,
  effector TEXT,
  method TEXT NOT NULL,
  cde TEXT NOT NULL,
  nsl INTEGER NOT NULL,
  appr_pid INTEGER NOT NULL,
  appr_jag INTEGER NOT NULL,
  appr_strike INTEGER NOT NULL,
  appr_tea INTEGER NOT NULL,
  status TEXT NOT NULL,
  bda TEXT,
  engagedAt INTEGER
);

CREATE TABLE IF NOT EXISTS sensors (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  intType TEXT NOT NULL,
  status TEXT NOT NULL,
  tasking TEXT NOT NULL,
  endur INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  cov TEXT NOT NULL,
  covDir REAL
);

CREATE TABLE IF NOT EXISTS effectors (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  weapon TEXT NOT NULL,
  status TEXT NOT NULL,
  tot INTEGER NOT NULL,
  rng INTEGER NOT NULL,
  suits TEXT NOT NULL,
  stealth INTEGER NOT NULL,
  kinetic INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  weapon TEXT NOT NULL,
  endur INTEGER NOT NULL,
  effId TEXT
);

CREATE TABLE IF NOT EXISTS nais (
  id TEXT PRIMARY KEY,
  desc TEXT NOT NULL,
  pir TEXT NOT NULL,
  color TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  tag TEXT NOT NULL,
  text TEXT NOT NULL,
  tag2 TEXT NOT NULL
);
`);

function rowToTarget(r: any): Target {
  return {
    id: r.id, name: r.name, type: r.type, cat: r.cat, aff: r.aff, threat: r.threat,
    stage: r.stage, pri: r.pri, conf: r.conf, trkQ: r.trkQ, x: r.x, y: r.y,
    course: r.course, speed: r.speed, elev: r.elev, custody: r.custody, decay: r.decay,
    sidc: r.sidc, effector: r.effector, method: r.method, cde: r.cde, nsl: !!r.nsl,
    appr: { pid: !!r.appr_pid, jag: !!r.appr_jag, strike: !!r.appr_strike, tea: !!r.appr_tea } as Approvals,
    status: r.status, bda: r.bda, engagedAt: r.engagedAt,
  };
}
function rowToSensor(r: any): Sensor {
  return { id: r.id, callsign: r.callsign, platform: r.platform, intType: r.intType, status: r.status, tasking: r.tasking, endur: r.endur, x: r.x, y: r.y, cov: r.cov, covDir: r.covDir ?? undefined };
}
function rowToEffector(r: any): Effector {
  return { id: r.id, callsign: r.callsign, platform: r.platform, weapon: r.weapon, status: r.status, tot: r.tot, rng: r.rng, suits: JSON.parse(r.suits), stealth: !!r.stealth, kinetic: !!r.kinetic };
}
function rowToUnit(r: any): FriendlyUnit {
  return { id: r.id, callsign: r.callsign, platform: r.platform, type: r.type, role: r.role, status: r.status, x: r.x, y: r.y, weapon: r.weapon, endur: r.endur, effId: r.effId };
}
function rowToNai(r: any): Nai {
  return { id: r.id, desc: r.desc, pir: r.pir, color: r.color, x: r.x, y: r.y, w: r.w, h: r.h };
}
function rowToLog(r: any): LogEntry {
  return { t: r.t, tag: r.tag, text: r.text, tag2: r.tag2 };
}

const insertTarget = db.prepare(`
  INSERT INTO targets (id,name,type,cat,aff,threat,stage,pri,conf,trkQ,x,y,course,speed,elev,custody,decay,sidc,effector,method,cde,nsl,appr_pid,appr_jag,appr_strike,appr_tea,status,bda,engagedAt)
  VALUES (@id,@name,@type,@cat,@aff,@threat,@stage,@pri,@conf,@trkQ,@x,@y,@course,@speed,@elev,@custody,@decay,@sidc,@effector,@method,@cde,@nsl,@appr_pid,@appr_jag,@appr_strike,@appr_tea,@status,@bda,@engagedAt)
`);
const insertSensor = db.prepare(`INSERT INTO sensors (id,callsign,platform,intType,status,tasking,endur,x,y,cov,covDir) VALUES (@id,@callsign,@platform,@intType,@status,@tasking,@endur,@x,@y,@cov,@covDir)`);
const insertEffector = db.prepare(`INSERT INTO effectors (id,callsign,platform,weapon,status,tot,rng,suits,stealth,kinetic) VALUES (@id,@callsign,@platform,@weapon,@status,@tot,@rng,@suits,@stealth,@kinetic)`);
const insertUnit = db.prepare(`INSERT INTO units (id,callsign,platform,type,role,status,x,y,weapon,endur,effId) VALUES (@id,@callsign,@platform,@type,@role,@status,@x,@y,@weapon,@endur,@effId)`);
const insertNai = db.prepare(`INSERT INTO nais (id,desc,pir,color,x,y,w,h) VALUES (@id,@desc,@pir,@color,@x,@y,@w,@h)`);
const insertLog = db.prepare(`INSERT INTO log (t,tag,text,tag2) VALUES (@t,@tag,@text,@tag2)`);

function seedFresh() {
  const s = freshState();
  const tx = db.transaction(() => {
    db.exec('DELETE FROM targets; DELETE FROM sensors; DELETE FROM effectors; DELETE FROM units; DELETE FROM nais; DELETE FROM log; DELETE FROM meta;');
    for (const t of s.targets) insertTarget.run({ ...t, threat: t.threat ?? null, pri: t.pri ?? null, effector: t.effector ?? null, bda: t.bda ?? null, engagedAt: t.engagedAt ?? null, nsl: t.nsl ? 1 : 0, appr_pid: t.appr.pid ? 1 : 0, appr_jag: t.appr.jag ? 1 : 0, appr_strike: t.appr.strike ? 1 : 0, appr_tea: t.appr.tea ? 1 : 0 });
    for (const sn of s.sensors) insertSensor.run({ ...sn, covDir: sn.covDir ?? null });
    for (const e of s.effectors) insertEffector.run({ ...e, suits: JSON.stringify(e.suits), stealth: e.stealth ? 1 : 0, kinetic: e.kinetic ? 1 : 0 });
    for (const u of s.units) insertUnit.run({ ...u, effId: u.effId ?? null });
    for (const n of s.nais) insertNai.run(n);
    for (const l of s.log.slice().reverse()) insertLog.run(l); // reverse so autoincrement seq matches chronological order (log[] is newest-first)
    db.prepare('INSERT INTO meta (id,t,selectedId,view,roeIdx) VALUES (1,@t,@selectedId,@view,@roeIdx)').run({ t: s.t, selectedId: s.selectedId, view: s.view, roeIdx: s.roeIdx });
  });
  tx();
}

const metaRow = db.prepare('SELECT * FROM meta WHERE id = 1').get();
if (!metaRow) {
  seedFresh();
}

export function loadState(): State {
  const meta = db.prepare('SELECT * FROM meta WHERE id = 1').get() as any;
  return {
    t: meta.t,
    selectedId: meta.selectedId,
    view: meta.view as View,
    roeIdx: meta.roeIdx,
    targets: (db.prepare('SELECT * FROM targets').all() as any[]).map(rowToTarget),
    sensors: (db.prepare('SELECT * FROM sensors').all() as any[]).map(rowToSensor),
    effectors: (db.prepare('SELECT * FROM effectors').all() as any[]).map(rowToEffector),
    units: (db.prepare('SELECT * FROM units').all() as any[]).map(rowToUnit),
    nais: (db.prepare('SELECT * FROM nais').all() as any[]).map(rowToNai),
    log: (db.prepare('SELECT * FROM log ORDER BY seq DESC LIMIT 60').all() as any[]).map(rowToLog),
  };
}

const updateTarget = db.prepare(`
  UPDATE targets SET stage=@stage, pri=@pri, conf=@conf, trkQ=@trkQ, x=@x, y=@y, course=@course, speed=@speed,
    custody=@custody, decay=@decay, effector=@effector, nsl=@nsl,
    appr_pid=@appr_pid, appr_jag=@appr_jag, appr_strike=@appr_strike, appr_tea=@appr_tea,
    status=@status, bda=@bda, engagedAt=@engagedAt
  WHERE id=@id
`);
const updateSensor = db.prepare(`UPDATE sensors SET status=@status, tasking=@tasking WHERE id=@id`);
const trimLog = db.prepare(`DELETE FROM log WHERE seq NOT IN (SELECT seq FROM log ORDER BY seq DESC LIMIT 60)`);
const updateMeta = db.prepare(`UPDATE meta SET t=@t, selectedId=@selectedId, view=@view, roeIdx=@roeIdx WHERE id=1`);

export const persistTick = db.transaction((state: State) => {
  for (const t of state.targets) {
    updateTarget.run({ ...t, effector: t.effector ?? null, bda: t.bda ?? null, engagedAt: t.engagedAt ?? null, nsl: t.nsl ? 1 : 0, appr_pid: t.appr.pid ? 1 : 0, appr_jag: t.appr.jag ? 1 : 0, appr_strike: t.appr.strike ? 1 : 0, appr_tea: t.appr.tea ? 1 : 0 });
  }
  for (const s of state.sensors) updateSensor.run({ id: s.id, status: s.status, tasking: s.tasking });
  if (state.log.length) {
    // only the newest entries can have been added since last persist; insert any not yet stored
    const known = new Set((db.prepare('SELECT t, text FROM log ORDER BY seq DESC LIMIT 60').all() as any[]).map((r) => r.t + '|' + r.text));
    for (const l of state.log.slice().reverse()) {
      if (!known.has(l.t + '|' + l.text)) insertLog.run(l);
    }
    trimLog.run();
  }
  updateMeta.run(state);
});

export function resetToSeed() {
  seedFresh();
}

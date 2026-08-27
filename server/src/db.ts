import pg from 'pg';
import { freshState, SEED_AIR_TRACK_HISTORY } from './seed.js';
import type { Approvals, Effector, FriendlyUnit, LogEntry, Nai, Sensor, Sortie, State, Target, View } from './types.js';

// Backed by the same PostGIS instance geoserver/docker-compose.yml's
// `postgis` service runs and GeoServer's own `ports_pg` datastore already
// points at — see geoserver/postgis-init/80-live-entities.sql for the
// table DDL (targets/sensors/effectors/friendly_units/nais/log/meta),
// which is provisioned there rather than here so it follows the exact same
// numbered-seed-file pattern as every reference layer (ports, airfields,
// eez, ...). This module assumes that schema already exists; if it
// doesn't, `docker compose -f geoserver/docker-compose.yml up -d` (and, on
// an already-initialized volume, manually applying 80-live-entities.sql)
// is the fix — the same prerequisite every other layer already has.
//
// Unlike better-sqlite3, node-postgres is Promise-based throughout, which
// is why loadState/persistTick/resetToSeed are all async here where their
// sqlite predecessors were synchronous. Live in-memory state and the
// WebSocket broadcast (store.ts's `update`) are NOT gated on these
// Promises resolving — persistence happens in the background so DB
// latency never delays a tick reaching connected clients. See store.ts.
export const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? process.env.POSTGIS_PORT ?? 5555),
  database: process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? 'meridian',
  user: process.env.PGUSER ?? process.env.POSTGRES_USER ?? 'meridian',
  password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'meridian',
});

function rowToTarget(r: any): Target {
  return {
    id: r.id, name: r.name, type: r.type, cat: r.cat, aff: r.aff, threat: r.threat,
    stage: r.stage, pri: r.pri, conf: r.conf, trkQ: r.trkq, lng: Number(r.lng), lat: Number(r.lat),
    course: r.course, speed: r.speed, elev: r.elev, custody: r.custody, decay: r.decay,
    sidc: r.sidc, effector: r.effector, method: r.method, cde: r.cde, nsl: r.nsl,
    appr: { pid: r.appr_pid, jag: r.appr_jag, strike: r.appr_strike, tea: r.appr_tea } as Approvals,
    status: r.status, bda: r.bda, engagedAt: r.engagedat,
    altFt: r.altft == null ? null : Number(r.altft), vsFtMin: r.vsftmin == null ? null : Number(r.vsftmin),
  };
}
function rowToSensor(r: any): Sensor {
  return { id: r.id, callsign: r.callsign, platform: r.platform, intType: r.inttype, status: r.status, tasking: r.tasking, endur: r.endur, lng: Number(r.lng), lat: Number(r.lat), cov: r.cov, covDir: r.covdir ?? undefined, altFt: r.altft == null ? null : Number(r.altft) };
}
function rowToEffector(r: any): Effector {
  return { id: r.id, callsign: r.callsign, platform: r.platform, weapon: r.weapon, status: r.status, tot: r.tot, rng: r.rng, suits: r.suits, stealth: r.stealth, kinetic: r.kinetic, altFt: r.altft == null ? null : Number(r.altft) };
}
function rowToUnit(r: any): FriendlyUnit {
  return { id: r.id, callsign: r.callsign, platform: r.platform, type: r.type, role: r.role, status: r.status, lng: Number(r.lng), lat: Number(r.lat), weapon: r.weapon, endur: r.endur, effId: r.effid };
}
function rowToNai(r: any): Nai {
  return { id: r.id, desc: r.description, pir: r.pir, color: r.color, lngMin: Number(r.lng_min), latMin: Number(r.lat_min), lngMax: Number(r.lng_max), latMax: Number(r.lat_max) };
}
function rowToLog(r: any): LogEntry {
  return { t: r.t, tag: r.tag, text: r.text, tag2: r.tag2 };
}
// totWindowStart/End come back from node-postgres as JS Date objects
// (its default TIMESTAMPTZ parsing) — re-serialized to ISO 8601 strings
// here so Sortie's field type (string, per the design brief's RT-01
// resolution) holds all the way from Postgres to the client, not just in
// the seed fixtures.
function rowToSortie(r: any): Sortie {
  return {
    id: r.id, packageId: r.packageid, callsign: r.callsign, platform: r.platform,
    linkedPlatformId: r.linkedplatformid, missionType: r.missiontype,
    originAirfield: r.originairfield, recoveryAirfield: r.recoveryairfield,
    targetIds: r.targetids, supportedSortieIds: r.supportedsortieids, collectionRequirementIds: r.collectionrequirementids,
    totWindowStart: r.totwindowstart.toISOString(), totWindowEnd: r.totwindowend.toISOString(),
    status: r.status, atoDay: r.atoday, bda: r.bda,
  };
}

async function seedFresh(): Promise<void> {
  const s = freshState();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM targets; DELETE FROM sensors; DELETE FROM effectors; DELETE FROM friendly_units; DELETE FROM nais; DELETE FROM log; DELETE FROM meta; DELETE FROM sorties;');
    for (const t of s.targets) {
      await client.query(
        `INSERT INTO targets (id,name,type,cat,aff,threat,stage,pri,conf,trkQ,geom,course,speed,elev,custody,decay,sidc,effector,method,cde,nsl,appr_pid,appr_jag,appr_strike,appr_tea,status,bda,engagedAt,altFt,vsFtMin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ST_SetSRID(ST_MakePoint($11,$12),4326),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
        [t.id, t.name, t.type, t.cat, t.aff, t.threat, t.stage, t.pri, t.conf, t.trkQ, t.lng, t.lat, t.course, t.speed, t.elev, t.custody, t.decay, t.sidc, t.effector, t.method, t.cde, t.nsl, t.appr.pid, t.appr.jag, t.appr.strike, t.appr.tea, t.status, t.bda, t.engagedAt, t.altFt, t.vsFtMin],
      );
    }
    for (const sn of s.sensors) {
      await client.query(
        `INSERT INTO sensors (id,callsign,platform,intType,status,tasking,endur,geom,cov,covDir,altFt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326),$10,$11,$12)`,
        [sn.id, sn.callsign, sn.platform, sn.intType, sn.status, sn.tasking, sn.endur, sn.lng, sn.lat, sn.cov, sn.covDir ?? null, sn.altFt],
      );
    }
    for (const e of s.effectors) {
      await client.query(
        `INSERT INTO effectors (id,callsign,platform,weapon,status,tot,rng,suits,stealth,kinetic,altFt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [e.id, e.callsign, e.platform, e.weapon, e.status, e.tot, e.rng, JSON.stringify(e.suits), e.stealth, e.kinetic, e.altFt],
      );
    }
    for (const u of s.units) {
      await client.query(
        `INSERT INTO friendly_units (id,callsign,platform,type,role,status,geom,weapon,endur,effId)
         VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326),$9,$10,$11)`,
        [u.id, u.callsign, u.platform, u.type, u.role, u.status, u.lng, u.lat, u.weapon, u.endur, u.effId],
      );
    }
    for (const n of s.nais) {
      await client.query(
        `INSERT INTO nais (id,description,pir,color,geom) VALUES ($1,$2,$3,$4,ST_MakeEnvelope($5,$6,$7,$8,4326))`,
        [n.id, n.desc, n.pir, n.color, n.lngMin, n.latMin, n.lngMax, n.latMax],
      );
    }
    // reverse so seq (autoincrement) matches chronological order — s.log is newest-first
    for (const l of s.log.slice().reverse()) {
      await client.query(`INSERT INTO log (t,tag,text,tag2) VALUES ($1,$2,$3,$4)`, [l.t, l.tag, l.text, l.tag2]);
    }
    for (const so of s.sorties) {
      await client.query(
        `INSERT INTO sorties (id,packageId,callsign,platform,linkedPlatformId,missionType,originAirfield,recoveryAirfield,targetIds,supportedSortieIds,collectionRequirementIds,totWindowStart,totWindowEnd,status,atoDay,bda)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          so.id, so.packageId, so.callsign, so.platform, so.linkedPlatformId, so.missionType,
          so.originAirfield, so.recoveryAirfield, JSON.stringify(so.targetIds), JSON.stringify(so.supportedSortieIds),
          JSON.stringify(so.collectionRequirementIds), so.totWindowStart, so.totWindowEnd, so.status, so.atoDay,
          so.bda ? JSON.stringify(so.bda) : null,
        ],
      );
    }
    // Phase D — entity_track_history lives in a different table than every
    // other seed-fresh write above (it's the timelapse capability's store,
    // not a live-entity one — see geoserver/postgis-init/100-history.sql),
    // but SEED_AIR_TRACK_HISTORY's timestamps are only meaningful relative
    // to the Sortie fixtures seeded just above, so it's seeded in the same
    // transaction rather than a separate postgis-init file. Scoped to this
    // one layer_id so a re-seed never touches 101-history-fixtures.sql's
    // vessel-track rows or anything a real Kafka pipeline later writes
    // under a different layer_id.
    await client.query(`DELETE FROM entity_track_history WHERE layer_id = 'history-air-tracks'`);
    for (const p of SEED_AIR_TRACK_HISTORY) {
      await client.query(
        `INSERT INTO entity_track_history (event_id,entity_id,entity_kind,layer_id,affiliation,speed_kn,event_time,geom,attrs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326),$10)
         ON CONFLICT (event_id) DO NOTHING`,
        [p.eventId, p.entityId, p.entityKind, p.layerId, p.affiliation, p.speedKn, p.eventTime, p.lng, p.lat, JSON.stringify(p.attrs)],
      );
    }
    await client.query(`INSERT INTO meta (id,t,selectedId,view,roeIdx) VALUES (1,$1,$2,$3,$4)`, [s.t, s.selectedId, s.view, s.roeIdx]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function loadState(): Promise<State> {
  const meta = (await pool.query('SELECT * FROM meta WHERE id = 1')).rows[0];
  if (!meta) {
    await seedFresh();
    return loadState();
  }
  const [targets, sensors, effectors, units, nais, log, sorties] = await Promise.all([
    pool.query('SELECT id,name,type,cat,aff,threat,stage,pri,conf,trkQ,ST_X(geom) AS lng,ST_Y(geom) AS lat,course,speed,elev,custody,decay,sidc,effector,method,cde,nsl,appr_pid,appr_jag,appr_strike,appr_tea,status,bda,engagedAt,altFt,vsFtMin FROM targets'),
    pool.query('SELECT id,callsign,platform,intType,status,tasking,endur,ST_X(geom) AS lng,ST_Y(geom) AS lat,cov,covDir,altFt FROM sensors'),
    pool.query('SELECT id,callsign,platform,weapon,status,tot,rng,suits,stealth,kinetic,altFt FROM effectors'),
    pool.query('SELECT id,callsign,platform,type,role,status,ST_X(geom) AS lng,ST_Y(geom) AS lat,weapon,endur,effId FROM friendly_units'),
    pool.query('SELECT id,description,pir,color,ST_XMin(geom) AS lng_min,ST_YMin(geom) AS lat_min,ST_XMax(geom) AS lng_max,ST_YMax(geom) AS lat_max FROM nais'),
    pool.query('SELECT t,tag,text,tag2 FROM log ORDER BY seq DESC LIMIT 60'),
    pool.query(
      'SELECT id,packageId,callsign,platform,linkedPlatformId,missionType,originAirfield,recoveryAirfield,targetIds,supportedSortieIds,collectionRequirementIds,totWindowStart,totWindowEnd,status,atoDay,bda FROM sorties',
    ),
  ]);
  return {
    t: meta.t,
    selectedId: meta.selectedid,
    view: meta.view as View,
    roeIdx: meta.roeidx,
    targets: targets.rows.map(rowToTarget),
    sensors: sensors.rows.map(rowToSensor),
    effectors: effectors.rows.map(rowToEffector),
    units: units.rows.map(rowToUnit),
    nais: nais.rows.map(rowToNai),
    log: log.rows.map(rowToLog),
    sorties: sorties.rows.map(rowToSortie),
  };
}

// Single-row fetches for server/src/liveSync.ts's LISTEN/NOTIFY handler —
// re-reads the current committed row for whatever id a trigger notified
// about, rather than trusting the (deliberately minimal) NOTIFY payload.
// Same column lists as loadState()'s bulk queries, just WHERE-scoped.
export async function fetchTargetById(id: string): Promise<Target | null> {
  const r = (await pool.query('SELECT id,name,type,cat,aff,threat,stage,pri,conf,trkQ,ST_X(geom) AS lng,ST_Y(geom) AS lat,course,speed,elev,custody,decay,sidc,effector,method,cde,nsl,appr_pid,appr_jag,appr_strike,appr_tea,status,bda,engagedAt,altFt,vsFtMin FROM targets WHERE id=$1', [id])).rows[0];
  return r ? rowToTarget(r) : null;
}
export async function fetchSensorById(id: string): Promise<Sensor | null> {
  const r = (await pool.query('SELECT id,callsign,platform,intType,status,tasking,endur,ST_X(geom) AS lng,ST_Y(geom) AS lat,cov,covDir,altFt FROM sensors WHERE id=$1', [id])).rows[0];
  return r ? rowToSensor(r) : null;
}
export async function fetchUnitById(id: string): Promise<FriendlyUnit | null> {
  const r = (await pool.query('SELECT id,callsign,platform,type,role,status,ST_X(geom) AS lng,ST_Y(geom) AS lat,weapon,endur,effId FROM friendly_units WHERE id=$1', [id])).rows[0];
  return r ? rowToUnit(r) : null;
}
export async function fetchNaiById(id: string): Promise<Nai | null> {
  const r = (await pool.query('SELECT id,description,pir,color,ST_XMin(geom) AS lng_min,ST_YMin(geom) AS lat_min,ST_XMax(geom) AS lng_max,ST_YMax(geom) AS lat_max FROM nais WHERE id=$1', [id])).rows[0];
  return r ? rowToNai(r) : null;
}

// Log entries are only ever prepended (never mutated), so the entries added
// since the last persist are exactly the leading run of `next` that doesn't
// reach back into `prev` — no need to round-trip the DB to find them.
function newLogEntries(next: LogEntry[], prev: LogEntry[]): LogEntry[] {
  if (next === prev) return [];
  const boundary = prev[0];
  const out: LogEntry[] = [];
  for (const l of next) {
    if (l === boundary) break;
    out.push(l);
  }
  return out;
}

export async function persistTick(state: State, prev: State): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Every action/tick handler that touches targets returns the same
    // target reference for entries it didn't change (see actions.ts /
    // sim.ts), so a per-index reference check finds exactly the rows that
    // actually changed without needing a deep comparison.
    if (state.targets !== prev.targets) {
      for (let i = 0; i < state.targets.length; i++) {
        const t = state.targets[i];
        if (t === prev.targets[i]) continue;
        await client.query(
          `UPDATE targets SET stage=$1,pri=$2,conf=$3,trkQ=$4,geom=ST_SetSRID(ST_MakePoint($5,$6),4326),course=$7,speed=$8,
             custody=$9,decay=$10,effector=$11,nsl=$12,appr_pid=$13,appr_jag=$14,appr_strike=$15,appr_tea=$16,
             status=$17,bda=$18,engagedAt=$19,altFt=$20,vsFtMin=$21 WHERE id=$22`,
          [t.stage, t.pri, t.conf, t.trkQ, t.lng, t.lat, t.course, t.speed, t.custody, t.decay, t.effector, t.nsl, t.appr.pid, t.appr.jag, t.appr.strike, t.appr.tea, t.status, t.bda, t.engagedAt, t.altFt, t.vsFtMin, t.id],
        );
      }
    }
    // Sensors only change on a retask action (sim ticks never touch them),
    // and retaskSensor (actions.ts) returns the same reference for every
    // sensor it didn't touch, same as targets above — so this was
    // rewriting every sensor row on any single retask, not just the one
    // that changed, unlike the per-index check targets already got.
    if (state.sensors !== prev.sensors) {
      for (let i = 0; i < state.sensors.length; i++) {
        const s = state.sensors[i];
        if (s === prev.sensors[i]) continue;
        await client.query(`UPDATE sensors SET status=$1, tasking=$2 WHERE id=$3`, [s.status, s.tasking, s.id]);
      }
    }
    if (state.log !== prev.log) {
      const fresh = newLogEntries(state.log, prev.log);
      for (const l of fresh.slice().reverse()) {
        await client.query(`INSERT INTO log (t,tag,text,tag2) VALUES ($1,$2,$3,$4)`, [l.t, l.tag, l.text, l.tag2]);
      }
      if (fresh.length) await client.query(`DELETE FROM log WHERE seq NOT IN (SELECT seq FROM log ORDER BY seq DESC LIMIT 60)`);
    }
    await client.query(`UPDATE meta SET t=$1, selectedId=$2, view=$3, roeIdx=$4 WHERE id=1`, [state.t, state.selectedId, state.view, state.roeIdx]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function resetToSeed(): Promise<void> {
  await seedFresh();
}

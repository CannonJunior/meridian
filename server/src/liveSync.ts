import pg from 'pg';
import { fetchNaiById, fetchSensorById, fetchTargetById, fetchUnitById, pgConnectionConfig } from './db.js';
import { update } from './store.js';
import type { FriendlyUnit, Nai, Sensor, Target } from './types.js';

// The other half of "stream data from GeoServer": Phase 1/2 made GeoServer
// a live *read* mirror of the tactical picture (WFS against the same
// PostGIS tables the sim writes to); this makes it two-way. A Postgres
// trigger on each live-entity table (geoserver/postgis-init/
// 90-live-entities-triggers.sql) fires pg_notify on every INSERT/UPDATE/
// DELETE — including ones made through GeoServer's WFS-T (confirmed
// working against this workspace's default WFS service level, no
// GeoServer config needed) by a client other than this server. This
// module holds the dedicated LISTEN connection (a pool connection can't be
// used for LISTEN — it needs to stay open and un-recycled) and merges
// whatever changed back into the live in-memory state, so it reaches
// connected Meridian clients over the same WebSocket broadcast the sim
// tick already uses.
//
// The NOTIFY payload is deliberately minimal (table + operation + id, not
// the full row) — the handler always re-reads the current committed row
// rather than trusting a payload that could be stale by the time it's
// processed. That re-read also does double duty as a cheap loop-breaker:
// merging triggers persistTick to write the row straight back
// (unchanged), which re-fires the trigger, which re-reads and finds no
// actual difference — update()'s existing reference-equality check
// no-ops on the echo, so the loop is self-terminating after one harmless
// extra round-trip rather than needing an explicit "who wrote this" flag.
const CHANNEL = 'meridian_live_change';

interface ChangePayload {
  table: 'targets' | 'sensors' | 'friendly_units' | 'nais';
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
}

function mergeById<T extends { id: string }>(list: T[], id: string, fresh: T | null): T[] | null {
  const idx = list.findIndex((x) => x.id === id);
  if (!fresh) {
    // Row is gone (a real DELETE, or it was removed again before this
    // handler's re-read ran) — drop it if we still have it.
    return idx === -1 ? null : list.filter((x) => x.id !== id);
  }
  if (idx === -1) {
    // Wasn't in memory yet — an external INSERT.
    return [...list, fresh];
  }
  if (JSON.stringify(list[idx]) === JSON.stringify(fresh)) return null; // no real change (our own write echoing back)
  const next = list.slice();
  next[idx] = fresh;
  return next;
}

async function handleChange(change: ChangePayload): Promise<void> {
  if (change.table === 'targets') {
    const fresh = change.op === 'DELETE' ? null : await fetchTargetById(change.id);
    update((s) => {
      const targets = mergeById<Target>(s.targets, change.id, fresh);
      return targets ? { ...s, targets } : s;
    });
  } else if (change.table === 'sensors') {
    const fresh = change.op === 'DELETE' ? null : await fetchSensorById(change.id);
    update((s) => {
      const sensors = mergeById<Sensor>(s.sensors, change.id, fresh);
      return sensors ? { ...s, sensors } : s;
    });
  } else if (change.table === 'friendly_units') {
    const fresh = change.op === 'DELETE' ? null : await fetchUnitById(change.id);
    update((s) => {
      const units = mergeById<FriendlyUnit>(s.units, change.id, fresh);
      return units ? { ...s, units } : s;
    });
  } else if (change.table === 'nais') {
    const fresh = change.op === 'DELETE' ? null : await fetchNaiById(change.id);
    update((s) => {
      const nais = mergeById<Nai>(s.nais, change.id, fresh);
      return nais ? { ...s, nais } : s;
    });
  }
}

const RECONNECT_DELAY_MS = 3000;

// Module-level so stopLiveSync() (below) can tear down whatever connection
// is currently live, and so the error handler below can tell an
// intentional stop apart from an unexpected drop and skip its own
// reconnect in that case.
let currentClient: pg.Client | null = null;
let stopped = false;

export function startLiveSync(): void {
  stopped = false;
  const client = new pg.Client(pgConnectionConfig());
  currentClient = client;

  client.on('notification', (msg) => {
    if (!msg.payload) return;
    let change: ChangePayload;
    try {
      change = JSON.parse(msg.payload);
    } catch (err) {
      console.error('[meridian] live-sync: unparseable NOTIFY payload:', msg.payload, err);
      return;
    }
    handleChange(change).catch((err) => console.error('[meridian] live-sync: failed to apply change:', change, err));
  });

  // A dropped LISTEN connection is silent otherwise — nothing else
  // notices, since the app keeps working fine off the WebSocket/sim tick
  // alone. Reconnect so external WFS-T edits keep flowing rather than
  // quietly stop being picked up after, say, a Postgres restart. Not on an
  // intentional stopLiveSync() — that call already expects (and caused)
  // this event.
  client.on('error', (err) => {
    if (stopped) return;
    console.error('[meridian] live-sync connection error, reconnecting in %dms:', RECONNECT_DELAY_MS, err);
    client.end().catch(() => {});
    setTimeout(startLiveSync, RECONNECT_DELAY_MS);
  });

  client
    .connect()
    .then(() => client.query(`LISTEN ${CHANNEL}`))
    .then(() => console.log(`[meridian] live-sync listening on Postgres channel "${CHANNEL}"`))
    .catch((err) => {
      if (stopped) return;
      console.error('[meridian] live-sync failed to connect, retrying in %dms:', RECONNECT_DELAY_MS, err);
      setTimeout(startLiveSync, RECONNECT_DELAY_MS);
    });
}

// Written for the elected-leader HA design (SERVER_HA_ENABLED) — a replica
// that loses leadership would need to stop applying external WFS-T edits
// itself (it's no longer the one process whose store.ts state is
// authoritative) rather than racing the new leader's own liveSync
// connection. NOT YET CALLED anywhere: leaderElection.ts isn't wired into
// index.ts, so nothing currently invokes this — see that file's header for
// what's still missing.
export async function stopLiveSync(): Promise<void> {
  stopped = true;
  if (currentClient) {
    await currentClient.end().catch(() => {});
    currentClient = null;
  }
}

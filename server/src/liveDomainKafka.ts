// Live Domain Tracks — the Kafka half of the domain-segmented live picture
// (see web/src/components/LayerManager.tsx's per-domain checkboxes and
// geoserver/postgis-init/110-live-domain-tracks.sql). Unlike
// kafkaHistoryConsumer.ts, this module owns both ends of its own pipeline:
// a producer that republishes the current live targets/sensors/
// friendly_units — classified into AIR/SEA/GROUND/SPACE by domain.ts — onto
// four topics whenever that data changes, and a consumer that upserts those
// messages into the four live_*_tracks PostGIS tables GeoServer reads.
//
// Both run inside this same server process because the producer's *source*
// is this process's own in-memory live state (subscribe(), the same hook
// ws.ts's WebSocket broadcast uses) — there's no separate synthetic
// simulator to run as an independent container the way
// kafka/producer/src/produce.ts's historical data has; this is the app's
// actual live picture, not a stand-in for one.
//
// Deliberately NOT a two-way sync like liveSync.ts — these four tables are
// a read-only-over-WFS projection (this consumer is the only writer,
// enforced at the database role level exactly like entity_track_history,
// see 110-live-domain-tracks.sql), not an editable mirror. targets/sensors/
// friendly_units (80-live-entities.sql) remain the one place a WFS-T edit
// can flow back into the live picture.
//
// Opt-in via KAFKA_LIVE_DOMAINS_ENABLED, same convention as
// KAFKA_HISTORY_ENABLED (see index.ts) — `npm run dev` keeps working
// unmodified with neither Kafka feature's stack up.
import { Kafka, Partitioners, CompressionTypes, logLevel } from 'kafkajs';
import type { Consumer, Producer } from 'kafkajs';
import './zstdCodec.js';
import { pool } from './db.js';
import { getState, subscribe } from './store.js';
import { DOMAINS, domainForSensor, domainForTarget, domainForUnit } from './domain.js';
import type { Domain, FriendlyUnit, Sensor, State, Target } from './types.js';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9094';
const GROUP_ID = 'meridian-live-domain-ingest';
const RECONNECT_DELAY_MS = 5000;

function topicFor(domain: Domain): string {
  return `meridian.live.${domain.toLowerCase()}.v1`;
}

const TABLE_FOR: Record<Domain, string> = {
  AIR: 'live_air_tracks',
  SEA: 'live_sea_tracks',
  GROUND: 'live_ground_tracks',
  SPACE: 'live_space_tracks',
};

interface DomainMessage {
  entity_id: string;
  entity_kind: 'target' | 'sensor' | 'unit';
  name: string;
  affiliation: string | null;
  geom: { type: 'Point'; coordinates: [number, number] };
  updated_at: string;
  attrs: Record<string, unknown>;
}

// --- producer --------------------------------------------------------------

function targetMessage(t: Target, updatedAt: string): DomainMessage {
  return {
    entity_id: t.id,
    entity_kind: 'target',
    name: t.name,
    affiliation: t.aff,
    geom: { type: 'Point', coordinates: [t.lng, t.lat] },
    updated_at: updatedAt,
    attrs: { cat: t.cat, status: t.status },
  };
}
function sensorMessage(s: Sensor, updatedAt: string): DomainMessage {
  return {
    entity_id: s.id,
    entity_kind: 'sensor',
    name: s.callsign,
    affiliation: null,
    geom: { type: 'Point', coordinates: [s.lng, s.lat] },
    updated_at: updatedAt,
    attrs: { platform: s.platform, status: s.status },
  };
}
function unitMessage(u: FriendlyUnit, updatedAt: string): DomainMessage {
  return {
    entity_id: u.id,
    entity_kind: 'unit',
    name: u.callsign,
    affiliation: 'FRD',
    geom: { type: 'Point', coordinates: [u.lng, u.lat] },
    updated_at: updatedAt,
    attrs: { platform: u.platform, status: u.status },
  };
}

function messagesByDomain(state: State): Map<Domain, DomainMessage[]> {
  const updatedAt = new Date().toISOString();
  const byDomain = new Map<Domain, DomainMessage[]>(DOMAINS.map((d) => [d, []]));
  for (const t of state.targets) byDomain.get(domainForTarget(t))!.push(targetMessage(t, updatedAt));
  for (const s of state.sensors) byDomain.get(domainForSensor(s))!.push(sensorMessage(s, updatedAt));
  for (const u of state.units) byDomain.get(domainForUnit(u))!.push(unitMessage(u, updatedAt));
  return byDomain;
}

let producer: Producer | null = null;

// entity_id -> the last DomainMessage actually published for it, so
// publishSnapshot can skip entities whose published fields haven't changed.
// sim.ts's per-tick jitter (decay/trkQ) touches fields that never make it
// into a DomainMessage at all — only name/affiliation/position/attrs do —
// so a stationary target's message is identical tick over tick even though
// `targets` gets a new array (and per-target object) reference every time.
// A moving target's position legitimately changes most ticks and keeps
// publishing as before; this only cuts the redundant Kafka produce/consume/
// DB-upsert cycle for entities where nothing actually changed.
const lastPublished = new Map<string, DomainMessage>();

function messageContentEqual(a: DomainMessage, b: DomainMessage): boolean {
  if (a.name !== b.name || a.affiliation !== b.affiliation) return false;
  if (a.geom.coordinates[0] !== b.geom.coordinates[0] || a.geom.coordinates[1] !== b.geom.coordinates[1]) return false;
  const aKeys = Object.keys(a.attrs);
  const bKeys = Object.keys(b.attrs);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a.attrs[k] === b.attrs[k]);
}

function publishSnapshot(state: State): void {
  if (!producer) return;
  const byDomain = messagesByDomain(state);
  const liveIds = new Set<string>();
  for (const domain of DOMAINS) {
    const all = byDomain.get(domain)!;
    const changed: DomainMessage[] = [];
    for (const m of all) {
      liveIds.add(m.entity_id);
      const prev = lastPublished.get(m.entity_id);
      if (prev && messageContentEqual(prev, m)) continue;
      changed.push(m);
      lastPublished.set(m.entity_id, m);
    }
    if (changed.length === 0) continue;
    producer
      .send({ topic: topicFor(domain), compression: CompressionTypes.ZSTD, messages: changed.map((m) => ({ key: m.entity_id, value: JSON.stringify(m) })) })
      .catch((err) => console.error(`[meridian] live-domain producer: publish to ${topicFor(domain)} failed:`, err));
  }
  // Drop tracking for any entity_id no longer present in state, so a
  // removed entity doesn't hold a slot in this map forever.
  for (const id of lastPublished.keys()) {
    if (!liveIds.has(id)) lastPublished.delete(id);
  }
}

export function startLiveDomainProducer(): void {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'meridian-server-live-domain-producer', logLevel: logLevel.WARN });
  producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  producer
    .connect()
    .then(() => {
      console.log(`[meridian] live-domain producer connected to ${KAFKA_BROKER}`);
      publishSnapshot(getState()); // an initial snapshot, not just the next change
      // sim.ts's per-tick target jitter (decay/trkQ) means `targets` changes
      // reference most ticks, so this still fires close to once a second in
      // practice — but publishSnapshot's own per-entity diff against
      // lastPublished now filters that down to only entities whose
      // published fields (position/name/affiliation/attrs) actually
      // changed, rather than republishing every entity on every tick.
      subscribe((next, prev) => {
        if (next.targets !== prev.targets || next.sensors !== prev.sensors || next.units !== prev.units) {
          publishSnapshot(next);
        }
      });
    })
    .catch((err) => console.error('[meridian] live-domain producer failed to connect:', err));
}

// --- consumer ----------------------------------------------------------------

function isValidDomainMessage(raw: unknown): raw is DomainMessage {
  if (raw == null || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const geom = r.geom as { type?: unknown; coordinates?: unknown } | undefined;
  return (
    typeof r.entity_id === 'string' &&
    typeof r.entity_kind === 'string' &&
    typeof r.name === 'string' &&
    typeof r.updated_at === 'string' &&
    !Number.isNaN(Date.parse(r.updated_at)) &&
    geom != null &&
    geom.type === 'Point' &&
    Array.isArray(geom.coordinates) &&
    geom.coordinates.length === 2 &&
    typeof geom.coordinates[0] === 'number' &&
    typeof geom.coordinates[1] === 'number' &&
    (r.affiliation == null || typeof r.affiliation === 'string')
  );
}

// `table` is always one of the four fixed literals in TABLE_FOR, never
// derived from message content, so interpolating it into the query string
// carries no injection risk despite not being a bound parameter.
//
// Written as a multi-row VALUES(...),(...) INSERT (chunked to
// UPSERT_CHUNK_SIZE rows/statement — 8 params/row keeps a 500-row chunk to
// 4000 params, well under Postgres's 65535 limit) rather than one
// round-trip per row, mirroring kafkaHistoryConsumer.ts's insertBatch.
// Unlike that DO NOTHING insert, ON CONFLICT ... DO UPDATE errors
// ("ON CONFLICT DO UPDATE command cannot affect row a second time") if the
// same entity_id appears twice within one INSERT statement — and it can,
// since publishSnapshot (above) republishes on every targets/sensors/units
// change, close to once/sec per its own comment, so a single fetched batch
// can contain several messages for the same entity. Deduping
// to the latest message per entity_id before chunking sidesteps that error
// and reproduces the same end state the old sequential per-row loop
// produced (last message for an entity_id wins).
const UPSERT_CHUNK_SIZE = 500;
const UPSERT_COLS = 8;

async function upsertBatch(table: string, messages: DomainMessage[]): Promise<void> {
  if (!messages.length) return;
  const latestByEntity = new Map<string, DomainMessage>();
  for (const m of messages) latestByEntity.set(m.entity_id, m);
  const deduped = [...latestByEntity.values()];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < deduped.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + UPSERT_CHUNK_SIZE);
      const values: unknown[] = [];
      const rows = chunk.map((m, idx) => {
        const b = idx * UPSERT_COLS;
        values.push(m.entity_id, m.entity_kind, m.name, m.affiliation, m.geom.coordinates[0], m.geom.coordinates[1], m.updated_at, JSON.stringify(m.attrs ?? {}));
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},ST_SetSRID(ST_MakePoint($${b + 5},$${b + 6}),4326),$${b + 7},$${b + 8})`;
      });
      await client.query(
        `INSERT INTO ${table} (entity_id, entity_kind, name, affiliation, geom, updated_at, attrs)
         VALUES ${rows.join(',')}
         ON CONFLICT (entity_id) DO UPDATE SET
           entity_kind = EXCLUDED.entity_kind, name = EXCLUDED.name, affiliation = EXCLUDED.affiliation,
           geom = EXCLUDED.geom, updated_at = EXCLUDED.updated_at, attrs = EXCLUDED.attrs`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

let restarting = false;

export function startLiveDomainConsumer(): void {
  runConsumer().catch((err) => {
    if (restarting) return;
    console.error('[meridian] live-domain consumer failed, retrying in %dms:', RECONNECT_DELAY_MS, err);
    scheduleRestart();
  });
}

function scheduleRestart(): void {
  if (restarting) return;
  restarting = true;
  setTimeout(() => {
    restarting = false;
    startLiveDomainConsumer();
  }, RECONNECT_DELAY_MS);
}

async function runConsumer(): Promise<void> {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'meridian-server-live-domain-consumer', logLevel: logLevel.NOTHING });
  const consumer: Consumer = kafka.consumer({ groupId: GROUP_ID });

  // Mirrors kafkaHistoryConsumer.ts's CRASH handling — kafkajs exhausts its
  // own retry budget on a sustained broker outage and emits CRASH rather
  // than retrying forever.
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    console.error('[meridian] live-domain consumer crashed, reconnecting in %dms:', RECONNECT_DELAY_MS, payload.error);
    consumer
      .disconnect()
      .catch(() => {})
      .finally(scheduleRestart);
  });

  await consumer.connect();
  const topics = DOMAINS.map(topicFor);
  await consumer.subscribe({ topics, fromBeginning: false });
  console.log(`[meridian] live-domain consumer subscribed to ${topics.join(', ')} on ${KAFKA_BROKER}`);

  await consumer.run({
    // autoCommit: false, offsets committed explicitly after insertBatch
    // commits — the exact fix kafkaHistoryConsumer.ts's header comment
    // documents for a bug caught during that pipeline's own Phase 1
    // verification (commitOffsetsIfNecessary() silently no-ops once
    // autoCommit is disabled).
    autoCommit: false,
    eachBatch: async ({ batch, heartbeat, isRunning, isStale }) => {
      const domain = DOMAINS.find((d) => topicFor(d) === batch.topic);
      const table = domain ? TABLE_FOR[domain] : null;
      const messages: DomainMessage[] = [];
      let lastOffset: string | null = null;

      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break;
        lastOffset = message.offset;

        let parsed: unknown;
        try {
          parsed = JSON.parse(message.value?.toString() ?? '');
        } catch (err) {
          console.error(`[meridian] live-domain consumer: unparseable message on ${batch.topic} at offset ${message.offset}, skipping:`, err);
          continue;
        }
        if (!table || !isValidDomainMessage(parsed)) {
          console.error(`[meridian] live-domain consumer: malformed message shape on ${batch.topic} at offset ${message.offset}, skipping:`, parsed);
          continue;
        }

        messages.push(parsed);
        await heartbeat();
      }

      if (messages.length && table) {
        await upsertBatch(table, messages);
      }

      if (lastOffset != null) {
        await consumer.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(lastOffset) + 1n).toString() }]);
      }
    },
  });
}

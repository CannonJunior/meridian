// Timelapse capability, Phase 1 (R2/R3: "the system subscribes ... streamed
// into GeoServer, where it is stored"). Consumes meridian.telemetry.history.v1
// (see kafka/README.md) and batches messages into entity_track_history —
// the same table GeoServer's history_ro_pg datastore reads (see
// geoserver/README.md's "Entity Track History" section). The two-way shape
// mirrors server/src/liveSync.ts's role for the live tactical picture:
// an external write stream absorbed into this app's own storage. Unlike
// liveSync.ts, this is one-way (Kafka -> Postgres only, nothing publishes
// back onto the topic) and the destination table is read-only over WFS-T
// (see provision.sh) precisely so this consumer is the only writer.
//
// Offsets are committed only after a batch's INSERTs commit — at-least-once
// delivery, made safe by ON CONFLICT (event_id) DO NOTHING (event_id is
// always a fresh UUID per publish, see kafka/producer/src/produce.ts's
// header comment, so a genuine duplicate here only ever means "this exact
// Kafka message was redelivered," never "the producer generated an
// equivalent new event"). A malformed message is logged and skipped
// individually — it does not drop the rest of its batch, and its offset is
// still resolved (there's nothing to persist for it, so nothing to protect
// by holding the offset back).
import { Kafka, logLevel } from 'kafkajs';
import type { Admin, Consumer } from 'kafkajs';
import { pool } from './db.js';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9094';
const TOPIC = process.env.KAFKA_HISTORY_TOPIC ?? 'meridian.telemetry.history.v1';
const GROUP_ID = 'meridian-history-ingest';
const RECONNECT_DELAY_MS = 5000;
const LAG_LOG_INTERVAL_MS = 30_000;

interface HistoryEvent {
  event_id: string;
  entity_id: string;
  entity_kind: string;
  layer_id: string;
  event_time: string;
  geom: { type: 'Point'; coordinates: [number, number] };
  affiliation?: string | null;
  speed_kn?: number | null;
  attrs?: Record<string, unknown>;
}

function isValidHistoryEvent(raw: unknown): raw is HistoryEvent {
  if (raw == null || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const geom = r.geom as { type?: unknown; coordinates?: unknown } | undefined;
  return (
    typeof r.event_id === 'string' &&
    typeof r.entity_id === 'string' &&
    typeof r.entity_kind === 'string' &&
    typeof r.layer_id === 'string' &&
    typeof r.event_time === 'string' &&
    !Number.isNaN(Date.parse(r.event_time)) &&
    geom != null &&
    geom.type === 'Point' &&
    Array.isArray(geom.coordinates) &&
    geom.coordinates.length === 2 &&
    typeof geom.coordinates[0] === 'number' &&
    typeof geom.coordinates[1] === 'number' &&
    (r.affiliation == null || typeof r.affiliation === 'string') &&
    (r.speed_kn == null || typeof r.speed_kn === 'number')
  );
}

// One transaction per batch, mirroring db.ts's seedFresh()/persistTick()
// idiom (BEGIN, per-row statements, COMMIT/ROLLBACK). A true multi-row
// VALUES(...),(...) insert would cut round-trips further but isn't needed
// at Phase 1's data volumes — noted as a Phase 5 perf candidate if ingest
// throughput ever becomes the bottleneck, not a correctness concern now.
async function insertBatch(events: HistoryEvent[]): Promise<void> {
  if (!events.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of events) {
      await client.query(
        `INSERT INTO entity_track_history (event_id, entity_id, entity_kind, layer_id, affiliation, speed_kn, event_time, geom, attrs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326),$10)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          e.event_id,
          e.entity_id,
          e.entity_kind,
          e.layer_id,
          e.affiliation ?? null,
          e.speed_kn ?? null,
          e.event_time,
          e.geom.coordinates[0],
          e.geom.coordinates[1],
          JSON.stringify(e.attrs ?? {}),
        ],
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

export function startKafkaHistoryConsumer(): void {
  runConsumer().catch((err) => {
    if (restarting) return;
    console.error('[meridian] history-consumer failed, retrying in %dms:', RECONNECT_DELAY_MS, err);
    scheduleRestart();
  });
}

function scheduleRestart(): void {
  if (restarting) return;
  restarting = true;
  setTimeout(() => {
    restarting = false;
    startKafkaHistoryConsumer();
  }, RECONNECT_DELAY_MS);
}

async function runConsumer(): Promise<void> {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'meridian-server', logLevel: logLevel.NOTHING });
  const consumer: Consumer = kafka.consumer({ groupId: GROUP_ID });
  // Set once the admin client / lag-check interval further below are
  // actually created — the CRASH handler below can fire either before or
  // after that point, so both are torn down defensively (null-checked)
  // rather than assumed to exist.
  let admin: Admin | null = null;
  let lagInterval: ReturnType<typeof setInterval> | null = null;

  // kafkajs exhausts its own internal retry budget on a sustained broker
  // outage and then emits CRASH rather than retrying forever — this is
  // what makes a broker restart (Phase 1's gate) something the consumer
  // needs to explicitly recover from, not something kafkajs papers over
  // silently. Mirrors liveSync.ts's "log and reconnect after a delay"
  // shape for its own dropped Postgres LISTEN connection.
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    console.error('[meridian] history-consumer crashed, reconnecting in %dms:', RECONNECT_DELAY_MS, payload.error);
    // Tear down this run's admin client + lag-check interval before
    // scheduling a restart — runConsumer() creates fresh ones on the next
    // attempt, and without this both leaked: one extra open admin
    // connection and one extra 30s-polling interval per crash/restart
    // cycle, compounding for as long as the broker stays flaky.
    if (lagInterval) clearInterval(lagInterval);
    consumer
      .disconnect()
      .catch(() => {})
      .finally(() => {
        (admin ? admin.disconnect().catch(() => {}) : Promise.resolve()).finally(scheduleRestart);
      });
  });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  console.log(`[meridian] history-consumer subscribed to "${TOPIC}" on ${KAFKA_BROKER}`);

  await consumer.run({
    autoCommit: false,
    // autoCommit: false disables kafkajs's own time/threshold-based commit
    // schedule — which also makes commitOffsetsIfNecessary() a no-op (it
    // only ever fires when autoCommit's own conditions say it's due, and
    // those conditions are switched off). Caught live during Phase 1
    // verification: offsets sat uncommitted indefinitely (visible via
    // `kafka-consumer-groups.sh --describe`, CURRENT-OFFSET stuck at "-")
    // even after 1000+ rows were successfully inserted, because
    // commitOffsetsIfNecessary() was silently doing nothing. Fixed by
    // committing explicitly via consumer.commitOffsets(...) instead, once
    // per batch, only after insertBatch has actually committed to Postgres.
    eachBatch: async ({ batch, heartbeat, isRunning, isStale }) => {
      const events: HistoryEvent[] = [];
      let lastOffset: string | null = null;

      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break;
        lastOffset = message.offset;

        let parsed: unknown;
        try {
          parsed = JSON.parse(message.value?.toString() ?? '');
        } catch (err) {
          console.error(`[meridian] history-consumer: unparseable message at offset ${message.offset}, skipping:`, err);
          continue;
        }
        if (!isValidHistoryEvent(parsed)) {
          console.error(`[meridian] history-consumer: malformed event shape at offset ${message.offset}, skipping:`, parsed);
          continue;
        }

        events.push(parsed);
        await heartbeat();
      }

      // If insertBatch throws, execution never reaches the commit below and
      // this eachBatch invocation throws in turn — kafkajs redelivers the
      // same batch on retry (nothing was committed), and ON CONFLICT DO
      // NOTHING makes reprocessing already-inserted rows from that batch a
      // no-op. This is the "offsets committed only after the DB commit"
      // guarantee, enforced by control flow, not just described in a comment.
      if (events.length) {
        await insertBatch(events);
      }

      if (lastOffset != null) {
        await consumer.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(lastOffset) + 1n).toString() }]);
      }
    },
  });

  admin = kafka.admin();
  await admin.connect();
  lagInterval = setInterval(async () => {
    try {
      const topicOffsets = await admin.fetchTopicOffsets(TOPIC);
      const groupOffsets = await admin.fetchOffsets({ groupId: GROUP_ID, topics: [TOPIC] });
      const groupByPartition = new Map(groupOffsets[0]?.partitions.map((p) => [p.partition, p.offset]) ?? []);
      let totalLag = 0;
      for (const { partition, offset: high } of topicOffsets) {
        const committed = Number(groupByPartition.get(partition) ?? '0');
        totalLag += Math.max(0, Number(high) - committed);
      }
      if (totalLag > 0) {
        console.log(`[meridian] history-consumer lag: ${totalLag} message(s) behind across ${topicOffsets.length} partitions`);
      }
    } catch (err) {
      console.error('[meridian] history-consumer: lag check failed:', err);
    }
  }, LAG_LOG_INTERVAL_MS);
}

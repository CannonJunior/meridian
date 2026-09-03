// Timelapse capability, Phase 1 — the simulated historical data store (see
// kafka/README.md). Generates plausible synthetic entity tracks and
// publishes one JSON event per entity per tick onto
// meridian.telemetry.history.v1, backfilling a window of history at
// accelerated speed before settling into real-time (1:1) publishing so the
// "live edge" of history keeps growing indefinitely.
//
// event_id is ALWAYS a fresh crypto.randomUUID() at publish time — never
// derived from SEED, entity_id, or event_time. This is a deliberate fix for
// a bug caught during planning review: an earlier draft derived event_id
// deterministically from content, which meant restarting this container
// with the same SEED (a natural thing to do for a "reproducible" demo
// dataset) regenerated the same event_ids as a prior run, and the
// consumer's ON CONFLICT (event_id) DO NOTHING — correct and necessary for
// crash-replay idempotency — silently swallowed the entire "fresh" re-run:
// zero rows inserted, zero errors. SEED only drives the deterministic PRNG
// below (entity start positions/courses/speeds/names), so re-running with
// the same SEED reproduces the same *scenario*, as new, uniquely-id'd rows
// each time — not byte-identical rows. If you need byte-identical output
// across runs (e.g. a golden-file test), truncate entity_track_history
// first rather than relying on event_id collisions to dedupe for you.
import { randomUUID } from 'node:crypto';
import { Kafka, Partitioners, CompressionTypes, logLevel } from 'kafkajs';
import './zstdCodec.js';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'kafka:9092';
const TOPIC = process.env.KAFKA_HISTORY_TOPIC ?? 'meridian.telemetry.history.v1';
const LAYER_ID = process.env.HISTORY_LAYER_ID ?? 'history-vessel-tracks';
const SEED = Number(process.env.SEED ?? 42);
const ENTITY_COUNT = Number(process.env.ENTITY_COUNT ?? 6);
const BACKFILL_HOURS = Number(process.env.BACKFILL_HOURS ?? 6);
const TICK_SECONDS = Number(process.env.TICK_SECONDS ?? 300); // simulated seconds of event_time per published point
const BACKFILL_COMPRESSION = Number(process.env.BACKFILL_COMPRESSION ?? 300); // wall-clock speedup while catching up to "now"

// Mirrors server/src/aoBounds.ts — kept as an independent copy since this
// producer isn't part of either the server/ or web/ TypeScript project
// (same rationale aoBounds.ts's own header comment gives for its own
// duplication relative to web/src/mapProjection.ts).
const AO_BOUNDS = { west: -6.05, east: -5.15, south: 35.75, north: 36.25 };

// --- deterministic PRNG (mulberry32) so a given SEED always generates the
// same entity scenario --------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randRange = (min: number, max: number) => min + rand() * (max - min);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length) % arr.length];

// --- geodesic step, same formula as server/src/helpers.ts's destinationPoint,
// duplicated for the same "independent project, no shared package" reason
// as AO_BOUNDS above --------------------------------------------------
const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
function destinationPoint(lng: number, lat: number, bearingDeg: number, distanceNm: number): { lng: number; lat: number } {
  const dr = distanceNm / EARTH_RADIUS_NM;
  const br = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(dr) + Math.cos(phi1) * Math.sin(dr) * Math.cos(br));
  const lambda2 = lambda1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(phi1), Math.cos(dr) - Math.sin(phi1) * Math.sin(phi2));
  return { lng: toDeg(lambda2), lat: toDeg(phi2) };
}

type EntityKind = 'vessel' | 'aircraft' | 'sensor_track';
type Affiliation = 'NEU' | 'HOS' | 'FRD';

interface SimEntity {
  entityId: string;
  entityKind: EntityKind;
  name: string;
  affiliation: Affiliation;
  lng: number;
  lat: number;
  course: number;
  speedKn: number;
}

const VESSEL_NAMES = ['KESTREL', 'OSPREY', 'LINNET', 'TERCEL', 'MERLIN', 'HARRIER', 'PEREGRINE', 'GOSHAWK'];
const AFFILIATIONS: Affiliation[] = ['NEU', 'NEU', 'NEU', 'HOS', 'FRD'];

function makeEntities(count: number): SimEntity[] {
  const entities: SimEntity[] = [];
  for (let i = 0; i < count; i++) {
    // Roughly 2 in 3 vessels, the rest split between an aircraft and a
    // sensor track — enough kind diversity to exercise entityKind
    // filtering without every entity being the same shape.
    const kind: EntityKind = i % 3 === 2 ? (i % 6 === 2 ? 'aircraft' : 'sensor_track') : 'vessel';
    entities.push({
      entityId: `SIM-${kind.toUpperCase()}-${String(i).padStart(3, '0')}`,
      entityKind: kind,
      name: kind === 'vessel' ? `MV ${pick(VESSEL_NAMES)}` : kind === 'aircraft' ? `REACH${Math.floor(randRange(10, 99))}` : `MQ-9 TRACK ${i}`,
      affiliation: pick(AFFILIATIONS),
      lng: randRange(AO_BOUNDS.west + 0.05, AO_BOUNDS.east - 0.05),
      lat: randRange(AO_BOUNDS.south + 0.05, AO_BOUNDS.north - 0.05),
      course: randRange(0, 360),
      speedKn: kind === 'aircraft' ? randRange(180, 260) : kind === 'vessel' ? randRange(8, 22) : 0,
    });
  }
  return entities;
}

function stepEntity(e: SimEntity, tickSeconds: number): void {
  if (e.speedKn <= 0) return; // sensor_track entities in this sim are stationary
  const distanceNm = (e.speedKn * tickSeconds) / 3600;
  const dest = destinationPoint(e.lng, e.lat, e.course, distanceNm);
  const margin = 0.02;
  const hitWest = dest.lng <= AO_BOUNDS.west + margin;
  const hitEast = dest.lng >= AO_BOUNDS.east - margin;
  const hitSouth = dest.lat <= AO_BOUNDS.south + margin;
  const hitNorth = dest.lat >= AO_BOUNDS.north - margin;
  e.lng = Math.min(AO_BOUNDS.east - margin, Math.max(AO_BOUNDS.west + margin, dest.lng));
  e.lat = Math.min(AO_BOUNDS.north - margin, Math.max(AO_BOUNDS.south + margin, dest.lat));
  // Bounce off whichever edge(s) were hit — hold a static course forever
  // would otherwise pin every entity to a corner within a few hours of
  // simulated backfill time.
  if (hitWest || hitEast) e.course = (360 - e.course) % 360;
  if (hitSouth || hitNorth) e.course = (540 - e.course) % 360;
}

function buildEvent(e: SimEntity, eventTime: Date) {
  return {
    event_id: randomUUID(),
    entity_id: e.entityId,
    entity_kind: e.entityKind,
    layer_id: LAYER_ID,
    event_time: eventTime.toISOString(),
    geom: { type: 'Point' as const, coordinates: [Number(e.lng.toFixed(5)), Number(e.lat.toFixed(5))] },
    affiliation: e.affiliation,
    speed_kn: e.speedKn > 0 ? Number(e.speedKn.toFixed(1)) : null,
    attrs: { name: e.name, course: Number(e.course.toFixed(1)) },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function main() {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'history-sim-producer', logLevel: logLevel.WARN });
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await producer.connect();
  console.log(`[history-sim] connected to ${KAFKA_BROKER}, publishing to "${TOPIC}"`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[history-sim] shutting down...');
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const entities = makeEntities(ENTITY_COUNT);
  console.log(`[history-sim] seed=${SEED} entities=${entities.length} backfillHours=${BACKFILL_HOURS} tickSeconds=${TICK_SECONDS} compression=${BACKFILL_COMPRESSION}x`);

  let simulatedTime = new Date(Date.now() - BACKFILL_HOURS * 3600 * 1000);
  let tickCount = 0;
  let publishedCount = 0;

  while (!shuttingDown) {
    const backfilling = simulatedTime.getTime() < Date.now();

    for (const e of entities) {
      stepEntity(e, TICK_SECONDS);
    }
    const events = entities.map((e) => buildEvent(e, simulatedTime));

    await producer.send({
      topic: TOPIC,
      compression: CompressionTypes.ZSTD,
      messages: events.map((ev) => ({ key: ev.entity_id, value: JSON.stringify(ev) })),
    });
    publishedCount += events.length;
    tickCount++;

    if (tickCount % 20 === 0) {
      console.log(`[history-sim] mode=${backfilling ? 'backfill' : 'live'} simulatedTime=${simulatedTime.toISOString()} published=${publishedCount}`);
    }

    simulatedTime = new Date(simulatedTime.getTime() + TICK_SECONDS * 1000);
    const delayMs = backfilling ? (TICK_SECONDS * 1000) / BACKFILL_COMPRESSION : TICK_SECONDS * 1000;
    await sleep(delayMs);
  }
}

main().catch((err) => {
  console.error('[history-sim] fatal error:', err);
  process.exit(1);
});

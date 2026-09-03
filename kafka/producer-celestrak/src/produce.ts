// Timelapse capability — Space domain data source. Fetches real orbital
// elements from CelesTrak's public GP catalog (celestrak.org/NORAD/elements,
// no auth required) and propagates each tracked object's live position via
// SGP4 (satellite.js), republishing as `meridian.telemetry.history.v1`
// events with `layer_id: "history-space-tracks"` — same topic, same
// message shape as kafka/producer/src/produce.ts's simulated vessel/
// aircraft tracks (see kafka/README.md's "Message schema" section), just
// real satellites instead of a simulated scenario. Unrelated to
// server/src/liveDomainKafka.ts's "Live Domain Tracks" pipeline
// (meridian.live.space.v1) — that classifies Meridian's own simulated
// targets/sensors/units by domain; this ingests real-world orbital data
// into the historical timelapse pipeline. Different topic, different
// table, different purpose.
//
// CATALOG_URL uses FORMAT=tle deliberately, not FORMAT=json (CelesTrak's
// OMM format) — TLE is satellite.js's native input (twoline2satrec takes
// line1/line2 directly), so there's no hand-rolled OMM→TLE re-encoding
// step (checksums, fixed-column fields) to get subtly wrong. A GROUP-style
// TLE response is 3 lines per object (name, line 1, line 2) — the same
// convention CelesTrak's classic .txt group files have used for decades.
//
// GROUP defaults to 'stations' (ISS, Tiangong, a handful of others — a few
// dozen objects) rather than 'active' (10,000+): this app is a small-AO
// demo, not a full space-surveillance picture, and publishing thousands of
// fast-moving points at a useful cadence would both overwhelm
// entity_track_history's row count and make the timelapse UI's entity list
// unusable. Override via CELESTRAK_GROUP for a different curated set (see
// celestrak.org/NORAD/elements/ for the full list of named groups).
import { randomUUID } from 'node:crypto';
import { Kafka, Partitioners, CompressionTypes, logLevel } from 'kafkajs';
import './zstdCodec.js';
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js';
import type { SatRec } from 'satellite.js';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'kafka:9092';
const TOPIC = process.env.KAFKA_HISTORY_TOPIC ?? 'meridian.telemetry.history.v1';
const LAYER_ID = process.env.HISTORY_LAYER_ID ?? 'history-space-tracks';
const GROUP = process.env.CELESTRAK_GROUP ?? 'stations';
const CATALOG_URL = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(GROUP)}&FORMAT=tle`;
// TLE sets are only updated ~every 6h upstream (see CelesTrak docs) —
// refetching more often than that would just hit the same rate-limited
// endpoint for identical data. CelesTrak explicitly asks integrators not
// to poll aggressively; 6h keeps this well inside that.
const CATALOG_REFRESH_SECONDS = Number(process.env.CATALOG_REFRESH_SECONDS ?? 21_600);
// How often a fresh *propagated* position is published per tracked
// satellite — independent of the catalog refresh above. 30s is frequent
// enough to see LEO objects (ISS: ~7.7 km/s) actually move between points
// on the timelapse scrubber without generating an unreasonable row count.
const PROPAGATE_SECONDS = Number(process.env.PROPAGATE_SECONDS ?? 30);

const KM_PER_S_TO_KN = 1943.844; // 1 km/s = 1943.844 knots

interface TrackedSat {
  entityId: string;
  name: string;
  satrec: SatRec;
}

function parseTleGroup(text: string): TrackedSat[] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
  const sats: TrackedSat[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i]?.trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!name || !line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    try {
      const satrec = twoline2satrec(line1, line2);
      const noradId = line1.slice(2, 7).trim();
      sats.push({ entityId: `SAT-${noradId}`, name, satrec });
    } catch (err) {
      console.error(`[celestrak] failed to parse TLE for "${name}":`, err);
    }
  }
  return sats;
}

async function fetchCatalog(): Promise<TrackedSat[]> {
  const res = await fetch(CATALOG_URL, { headers: { 'User-Agent': 'meridian-fires-demo/1.0 (celestrak space-tracks producer)' } });
  if (!res.ok) throw new Error(`CelesTrak fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  return parseTleGroup(text);
}

function currentPosition(sat: TrackedSat, at: Date): { lng: number; lat: number; altKm: number; speedKmS: number } | null {
  const pv = propagate(sat.satrec, at);
  if (!pv.position || typeof pv.position === 'boolean') return null; // propagation failed (e.g. decayed orbit)
  const gmst = gstime(at);
  const geo = eciToGeodetic(pv.position, gmst);
  const speedKmS = pv.velocity && typeof pv.velocity !== 'boolean' ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  return { lng: degreesLong(geo.longitude), lat: degreesLat(geo.latitude), altKm: geo.height, speedKmS };
}

function buildEvent(sat: TrackedSat, at: Date) {
  const pos = currentPosition(sat, at);
  if (!pos) return null;
  return {
    event_id: randomUUID(),
    entity_id: sat.entityId,
    entity_kind: 'satellite',
    layer_id: LAYER_ID,
    event_time: at.toISOString(),
    geom: { type: 'Point' as const, coordinates: [Number(pos.lng.toFixed(5)), Number(pos.lat.toFixed(5))] },
    // No HOS/UNK/FRD/NEU affiliation for a real public satellite catalog —
    // left null rather than guessed.
    affiliation: null,
    speed_kn: Number((pos.speedKmS * KM_PER_S_TO_KN).toFixed(1)),
    attrs: { name: sat.name, altitudeKm: Number(pos.altKm.toFixed(1)) },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function main() {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'celestrak-space-tracks-producer', logLevel: logLevel.WARN });
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await producer.connect();
  console.log(`[celestrak] connected to ${KAFKA_BROKER}, publishing to "${TOPIC}" as layer_id="${LAYER_ID}", group="${GROUP}"`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[celestrak] shutting down...');
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  let sats: TrackedSat[] = [];
  let lastCatalogFetch = 0;

  while (!shuttingDown) {
    if (Date.now() - lastCatalogFetch > CATALOG_REFRESH_SECONDS * 1000) {
      try {
        const fresh = await fetchCatalog();
        sats = fresh;
        lastCatalogFetch = Date.now();
        console.log(`[celestrak] catalog refreshed: group=${GROUP} satellites=${sats.length}`);
      } catch (err) {
        console.error('[celestrak] catalog fetch failed, keeping previous catalog:', err);
        if (sats.length === 0) {
          await sleep(30_000);
          continue;
        }
      }
    }

    const now = new Date();
    const events = sats.map((s) => buildEvent(s, now)).filter((e): e is NonNullable<typeof e> => e != null);
    if (events.length > 0) {
      await producer.send({ topic: TOPIC, compression: CompressionTypes.ZSTD, messages: events.map((ev) => ({ key: ev.entity_id, value: JSON.stringify(ev) })) });
      console.log(`[celestrak] published ${events.length} position(s) at ${now.toISOString()}`);
    }
    await sleep(PROPAGATE_SECONDS * 1000);
  }
}

main().catch((err) => {
  console.error('[celestrak] fatal error:', err);
  process.exit(1);
});

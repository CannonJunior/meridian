// Timelapse capability — Ground domain data source. Polls GDELT's GEO 2.0
// API (https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/), a free,
// keyless public feed of geolocated mentions across GDELT's monitored
// global news coverage (65 languages, refreshed ~every 15 minutes), and
// republishes each point as a `meridian.telemetry.history.v1` event with
// `layer_id: "history-ground-events"` — same topic, same message shape as
// kafka/producer/src/produce.ts's simulated vessel/aircraft tracks (see
// kafka/README.md's "Message schema" section), just real data instead of
// simulated. Unrelated to server/src/liveDomainKafka.ts's "Live Domain
// Tracks" pipeline (meridian.live.ground.v1) — that classifies Meridian's
// own simulated targets/sensors/units by domain; this ingests real-world
// external data into the historical timelapse pipeline. Different topic,
// different table, different purpose — the "ground" in each name is a
// coincidence of both describing the same real-world domain, not a shared
// mechanism.
//
// GDELT's PointData mode re-aggregates its whole rolling `timespan` window
// on every single poll — it is not a per-mention stream, so there is no
// GDELT-native "entity" to key on. entityIdFor() derives a stable id from
// the location name/coordinates instead, so the *same* place accumulates
// as one evolving track across successive polls (mention count rising and
// falling over time) rather than a fresh, disconnected point every 15
// minutes — which is what makes it meaningful to scrub through in the
// timelapse UI at all.
import { randomUUID } from 'node:crypto';
import { Kafka, Partitioners, logLevel } from 'kafkajs';

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'kafka:9092';
const TOPIC = process.env.KAFKA_HISTORY_TOPIC ?? 'meridian.telemetry.history.v1';
const LAYER_ID = process.env.HISTORY_LAYER_ID ?? 'history-ground-events';
// Keyword/phrase query GDELT's GEO API searches for — defaults to a broad
// ground-activity net (battles, deployments, strikes, insurgent activity),
// not scoped to this app's fictional AO/callsigns the way history-sim's
// simulated data is, since this is real-world data.
const QUERY = process.env.GDELT_QUERY ?? '(military OR troops OR airstrike OR insurgent OR offensive OR ceasefire)';
// GDELT accepts 15-1440 (minutes) or Nd/Nh/Nw shorthand — default matches
// this producer's own POLL_SECONDS-driven refresh cadence: each poll asks
// for "the last day," same as GDELT's own dashboard default.
const TIMESPAN = process.env.GDELT_TIMESPAN ?? '1440';
const MAX_POINTS = Number(process.env.GDELT_MAX_POINTS ?? 250);
// 900s = 15min, matching GDELT's own stated refresh cadence for this feed
// — polling faster than the source itself updates would just re-fetch the
// same window repeatedly.
const POLL_SECONDS = Number(process.env.GDELT_POLL_SECONDS ?? 900);

const GEO_API_URL = 'https://api.gdeltproject.org/api/v2/geo/geo';

interface GdeltFeature {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
}

interface GdeltFeatureCollection {
  type?: string;
  features?: unknown;
}

// The GEO API's exact property names for PointData mode aren't pinned down
// in GDELT's own docs beyond "location names, mention counts" — this reads
// several plausible key spellings defensively rather than asserting one,
// so a naming variance in the live response degrades to a generic label
// instead of silently dropping every feature.
function readString(props: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}
function readNumber(props: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = props[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function fetchGeoJson(): Promise<GdeltFeature[]> {
  const params = new URLSearchParams({ query: QUERY, format: 'GeoJSON', mode: 'PointData', timespan: TIMESPAN, maxpoints: String(MAX_POINTS) });
  const res = await fetch(`${GEO_API_URL}?${params.toString()}`, { headers: { 'User-Agent': 'meridian-fires-demo/1.0 (gdelt ground-events producer)' } });
  if (!res.ok) throw new Error(`GDELT fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as GdeltFeatureCollection;
  return Array.isArray(body.features) ? (body.features as GdeltFeature[]) : [];
}

function slug(text: string): string {
  return (
    text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'UNKNOWN'
  );
}

function entityIdFor(name: string, lng: number, lat: number): string {
  const key = name !== 'UNKNOWN LOCATION' ? slug(name) : `${lat.toFixed(2)}-${lng.toFixed(2)}`;
  return `GDELT-${key}`;
}

function buildEvent(f: GdeltFeature, at: Date) {
  if (!f.geometry || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) return null;
  const [lng, lat] = f.geometry.coordinates as [unknown, unknown];
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const props = f.properties ?? {};
  const name = readString(props, ['name', 'locationname', 'label'], 'UNKNOWN LOCATION').slice(0, 80);
  const mentionCount = readNumber(props, ['count', 'mentioncount'], 1);

  return {
    event_id: randomUUID(),
    entity_id: entityIdFor(name, lng, lat),
    entity_kind: 'ground_event',
    layer_id: LAYER_ID,
    event_time: at.toISOString(),
    geom: { type: 'Point' as const, coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
    // No natural HOS/UNK/FRD/NEU affiliation for a news-mention location —
    // left null rather than guessed, same as history-sim's stationary
    // sensor_track fixtures leave speed_kn null when it genuinely doesn't
    // apply.
    affiliation: null,
    speed_kn: null,
    attrs: { name, mentionCount, query: QUERY },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function main() {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER], clientId: 'gdelt-ground-events-producer', logLevel: logLevel.WARN });
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await producer.connect();
  console.log(`[gdelt] connected to ${KAFKA_BROKER}, publishing to "${TOPIC}" as layer_id="${LAYER_ID}", query="${QUERY}"`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[gdelt] shutting down...');
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!shuttingDown) {
    try {
      const features = await fetchGeoJson();
      const now = new Date();
      const events = features.map((f) => buildEvent(f, now)).filter((e): e is NonNullable<typeof e> => e != null);
      if (events.length > 0) {
        await producer.send({ topic: TOPIC, messages: events.map((ev) => ({ key: ev.entity_id, value: JSON.stringify(ev) })) });
      }
      console.log(`[gdelt] poll complete: fetched=${features.length} published=${events.length} at=${now.toISOString()}`);
    } catch (err) {
      // A failed poll (network blip, GDELT rate-limit, malformed response)
      // just waits for the next interval rather than crashing the
      // container — matches kafkaHistoryConsumer.ts's "log and skip" style
      // for a single bad message, applied here at the poll level instead.
      console.error('[gdelt] poll failed, will retry next interval:', err);
    }
    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((err) => {
  console.error('[gdelt] fatal error:', err);
  process.exit(1);
});

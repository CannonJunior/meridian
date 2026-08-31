# Timelapse capability — Kafka stack

Standalone dockerized service publishing simulated historical entity-track
events onto a Kafka topic, which Meridian's server subscribes to and
ingests into the PostGIS database GeoServer already reads (see
`geoserver/README.md`'s new "Entity Track History" section). This is Phase 0
of that plan: the broker, topic, and (in `geoserver/`) the storage/query
side it feeds. The producer and consumer themselves are Phase 1.

## Run

```
npm run kafka:up
```

Brings up, in order: a single-node Kafka broker in KRaft mode, then a
one-shot `kafka-init` container that creates the
`meridian.telemetry.history.v1` topic (6 partitions, idempotent —
`--if-not-exists`). Re-running `up` is safe.

- Broker, reachable from the host (and from Phase 1's consumer, run as a
  host process — see below): `localhost:9094`
- Broker, reachable from containers on this compose project's own network
  (Phase 1's producer container, `kafka-init` above): `kafka:9092`

```
npm run kafka:down     # stop, keep the topic's data
npm run kafka:down -- -v   # stop, wipe it (append -v yourself if you want this)
npm run kafka:logs
```

## Why this is a separate compose project from `geoserver/`

An earlier draft of the timelapse plan attached this stack to
`geoserver/docker-compose.yml`'s network so the consumer could "resolve
`postgis` by service name." That reasoning didn't survive review: neither
the producer (Phase 1) nor the consumer (`server/src/kafkaHistoryConsumer.ts`,
Phase 1, a host process started alongside the rest of `server/`) actually
need docker-network access to `postgis` — the consumer reaches it exactly
the way `server/src/liveSync.ts` already does today, via the *published*
host port (`POSTGIS_PORT`, default `5555`), not container DNS. So this
stack stays fully independent — `kafka:up`/`kafka:down` don't touch, and
don't need, `geoserver:up`/`geoserver:down`.

## The dual-listener setup — verified, not just written

A single-node KRaft broker reached by both an in-network container
(`kafka-init`, and Phase 1's producer) and a host process (Phase 1's
consumer) needs two correctly matched listeners, because the *advertised*
address a client is told to reconnect to for the actual partition-leader
connection is different for each: `kafka:9092` only resolves inside this
compose network, `localhost:9094` only resolves from the host. This is a
well-known Kafka/Docker failure mode specifically because it doesn't fail
at bootstrap — a wrong `advertised.listeners` value still lets a client
connect to the bootstrap port and fetch metadata, then hangs or errors on
the *next* connection (to the partition leader, or on any reconnect after
a broker restart), which a one-time smoke test at first connect won't
catch.

This was verified live during Phase 0, not just configured and assumed:

```
# In-network topic creation (kafka-init, using kafka:9092) — confirmed via
# docker logs meridian-kafka-init: "Created topic meridian.telemetry.history.v1."

# Host-side full round-trip through the EXTERNAL listener (localhost:9094),
# including the partition-leader connection a plain bootstrap check would miss:
echo "test-key:test-value" | docker run --rm -i --network host apache/kafka:3.8.0 \
  /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9094 \
  --topic meridian.telemetry.history.v1 --property "parse.key=true" --property "key.separator=:"

docker run --rm --network host apache/kafka:3.8.0 \
  /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9094 \
  --topic meridian.telemetry.history.v1 --from-beginning --max-messages 1 --property "print.key=true"
# => test-key    test-value
```

If you ever change the listener config, re-run this exact round-trip
(produce *and* consume from a fresh client process each time, not just
list topics) before trusting it — a bootstrap-only check is not sufficient
evidence this works.

## Message schema (Phase 1, documented here since the topic name encodes it)

Topic name `meridian.telemetry.history.v1` is versioned deliberately — a
breaking schema change is a new topic, not an in-place migration. One JSON
event per message, keyed by `entity_id` (keeps one entity's events in
order across the topic's 6 partitions):

```json
{
  "event_id": "b3f5c2b0-....-....-....-............",
  "entity_id": "SIM-VESSEL-014",
  "entity_kind": "vessel",
  "layer_id": "history-vessel-tracks",
  "event_time": "2026-08-20T14:03:00Z",
  "geom": { "type": "Point", "coordinates": [-5.353, 36.14] },
  "affiliation": "NEU",
  "speed_kn": 14.3,
  "attrs": { "course": 184.2, "name": "MV KESTREL" }
}
```

`affiliation` and `speed_kn` are top-level, matching the promoted columns
in `geoserver/postgis-init/100-history.sql` — the consumer (Phase 1) must
map these fields by exact name and fail loudly (not insert `NULL`) if the
producer's schema and this shape ever drift apart. Everything else the
producer wants to emit belongs in `attrs`, not as a new top-level field,
without also updating the table schema and the query API's field
whitelist to match.

**A second `layer_id`, `history-air-tracks`, exists** (added for the
"Rolling Air Picture" ATO plan's Phase D, whitelisted in
`server/src/historyQuery.ts`) but this producer does not emit it — it's
seeded directly into Postgres by `server/src/seed.ts` /
`server/src/db.ts`, not through this topic, since there's no live
air-track simulator yet. A future producer for it would follow this exact
same message shape with `entity_kind: "aircraft"` and
`layer_id: "history-air-tracks"`; nothing about the schema above is
vessel-specific.

**Two more `layer_id`s, `history-ground-events` and `history-space-tracks`,
publish real external data** rather than simulated or fixture rows —
`kafka/producer-gdelt` and `kafka/producer-celestrak`, both independent
compose services publishing onto this same topic (same schema, so no new
topic per the versioning rule above). Neither has anything to do with
`server/src/liveDomainKafka.ts`'s "Live Domain Tracks" pipeline below —
same word ("ground"/"space"), unrelated mechanism; see that section's own
disambiguation note.

- **`history-ground-events`** (`kafka/producer-gdelt`) polls GDELT's public
  GEO 2.0 API (`api.gdeltproject.org`, no auth) every `GDELT_POLL_SECONDS`
  (default 900s, matching GDELT's own ~15min refresh) for geolocated news
  mentions matching `GDELT_QUERY` (default a broad ground-activity net —
  see the producer's source for the exact terms), `entity_kind:
  "ground_event"`, `affiliation: null` (no natural HOS/UNK/FRD/NEU for a
  news-mention location), `attrs: { name, mentionCount, query }`. GDELT's
  PointData mode re-aggregates its whole rolling window on every poll —
  there's no GDELT-native per-mention entity id, so `entity_id` is derived
  from the location's name/coordinates (`GDELT-<slug>`), which is what lets
  the *same* place accumulate as one evolving track (mention count rising
  and falling) across successive polls instead of a fresh disconnected
  point every 15 minutes.
- **`history-space-tracks`** (`kafka/producer-celestrak`) fetches real
  orbital elements from CelesTrak's public GP catalog
  (`celestrak.org/NORAD/elements`, no auth, `CELESTRAK_GROUP` — default
  `stations`, a few dozen objects, not the 10,000+-object `active` group;
  this is a small-AO demo, not a space-surveillance picture) and propagates
  each object's live position via SGP4 (`satellite.js`), publishing a fresh
  position every `PROPAGATE_SECONDS` (default 30s) per tracked satellite —
  `entity_kind: "satellite"`, `entity_id: "SAT-<NORAD ID>"`, `affiliation:
  null`, `speed_kn` converted from the propagated orbital velocity,
  `attrs: { name, altitudeKm }`. The catalog itself only refetches every
  `CATALOG_REFRESH_SECONDS` (default 6h, matching how often CelesTrak
  itself updates TLEs — polling faster just re-hits the same data and
  invites rate-limiting) — independent from the propagation cadence.

Both new producers need real outbound internet access from their
container (unlike every other service in this compose project, which is
fully self-contained) and both degrade the same way on a bad poll: log the
failure and retry on the next interval rather than crash the container —
a transient GDELT/CelesTrak outage doesn't need a restart to recover from.

**Retention.** Unlike `history-sim` above (a bounded simulated scenario)
and `history-air-tracks` (fixture-only), these two run indefinitely with
no upstream cap — CelesTrak alone publishes a fresh position every ~30s
per tracked satellite. `server/src/db.ts`'s `pruneRealtimeHistoryLayers()`
(same shape as the pre-existing `pruneAirTrackHistory()`, wired up
alongside it in `server/src/index.ts`) deletes rows older than 72h from
just these two `layer_id`s, once at server startup and then hourly.

## Live Domain Tracks

**Not to be confused with `history-ground-events`/`history-space-tracks`
above** — this pipeline classifies Meridian's own simulated
targets/sensors/units by domain; the other two ingest real external data
(GDELT, CelesTrak) into the historical timelapse pipeline. Same domain
words, unrelated mechanism, unrelated topics/tables.

A second, unrelated pipeline on this same broker: Meridian's live tactical
picture (targets/sensors/friendly_units), classified into AIR/SEA/GROUND/
SPACE domains and republished so GeoServer can serve a domain-segmented
projection of it. This is what `web/src/components/LayerManager.tsx`'s
per-domain checkboxes describe as "KAFKA · meridian.live.<domain>.v1 →
GeoServer" — those checkboxes only control this app's own map overlay, not
whether this pipeline runs; it publishes unconditionally whenever it's
enabled, independent of what any client has toggled on screen.

Unlike the history pipeline above, there is no separate producer
container — `server/src/liveDomainKafka.ts` owns both ends. The producer
half republishes onto four topics (`meridian.live.air.v1`,
`meridian.live.sea.v1`, `meridian.live.ground.v1`, `meridian.live.space.v1`,
created by `kafka-init` alongside the history topic, 1 partition each —
this app's live entity count is small enough that partition count was never
a throughput concern) whenever `server/src/store.ts`'s live state actually
changes; the consumer half upserts those messages into
`geoserver/postgis-init/110-live-domain-tracks.sql`'s four `live_*_tracks`
tables, published read-only over WFS through `history_ro_pg` — the same
role/reasoning as `entity_track_history` below. See `domainForTarget`/
`domainForSensor`/`domainForUnit` in `server/src/domain.ts` (mirrored in
`web/src/selectors.ts` for the client) for the actual classification rule.

Opt-in via `KAFKA_LIVE_DOMAINS_ENABLED=true` (see `server/src/index.ts`),
independent of `KAFKA_HISTORY_ENABLED` — either pipeline can run without
the other. Message shape, one JSON event per entity, keyed by `entity_id`
(upserted, not appended — these tables represent "where is X right now,"
not a history log):

```json
{
  "entity_id": "T2203",
  "entity_kind": "target",
  "name": "REEF",
  "affiliation": "HOS",
  "geom": { "type": "Point", "coordinates": [-5.33, 36.05] },
  "updated_at": "2026-08-25T14:03:00Z",
  "attrs": { "cat": "SHIP", "status": "IN COORD" }
}
```

**`SEED`/idempotency — resolved in `kafka/producer/src/produce.ts`**: the
consumer's ingest is idempotent via `event_id` (`ON CONFLICT DO NOTHING`),
which protects against replay after a crash (the *same* Kafka message
redelivered). `event_id` is always a fresh `crypto.randomUUID()` at publish
time — never derived from `SEED`, `entity_id`, or `event_time` — so it
never collides with a prior run's rows. `SEED` only drives the deterministic
PRNG that generates entity start positions/courses/speeds/names: restarting
the producer with the same `SEED` reproduces the same *scenario*, as new,
uniquely-id'd rows each time, not byte-identical rows. Verified live during
Phase 1: restarting the `history-sim` container with its default `SEED=42`
inserted ~1,200 new rows rather than the zero-silently-swallowed behavior
an earlier, content-derived `event_id` design would have produced. If you
need byte-identical rows across runs (e.g. a golden-file test), truncate
`entity_track_history` first rather than relying on `event_id` collisions
to dedupe for you.

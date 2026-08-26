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

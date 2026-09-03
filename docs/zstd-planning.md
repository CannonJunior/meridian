# Zstandard — where it applies in this codebase, and where it doesn't

Planning memo, written 2026-09-02 after auditing every network/storage path
in the app for compression opportunities. Kept as a standing reference so a
future feature isn't evaluated for zstd from scratch — check this list
first, then update it if the codebase's shape changes enough to invalidate
an entry below.

## Done

**Kafka producers** (`kafka/producer`, `kafka/producer-celestrak`,
`kafka/producer-gdelt`, `server/src/liveDomainKafka.ts`) — all four send
with `compression: CompressionTypes.ZSTD` via a per-package `zstdCodec.ts`
(see `kafka/README.md`'s "Compression" section for the mechanism). This was
the clear win: every one of these producers runs continuously, publishing
small, structurally-repetitive JSON (same keys, similar shape every
message) — exactly zstd's sweet spot, and better ratio *and* speed than
gzip on this kind of payload. No new dependency: Node 22.15+'s `node:zlib`
has zstd built in, and every image in this repo already runs `node:22-alpine`.
Any new Kafka producer added to this codebase should follow the same
pattern from the start, not bolt it on later.

## Worth adding when the feature exists

**HTTP response compression on the Express server** (`server/src/index.ts`)
— there is currently no compression middleware at all, on any route.
`GET /api/history/query` (timelapse GeoJSON, can be large) and
`GET /api/state` are the routes where it would matter; small action/status
responses wouldn't benefit enough to bother. Node's built-in
`zlib.zstdCompressSync` makes this cheap to add, but `Content-Encoding: zstd`
browser support is behind gzip/brotli's — a gzip fallback via
`Accept-Encoding` negotiation is required, not optional. Add this when
`/api/history/query` payload sizes actually become a complaint, not
speculatively.

**PostGIS backup/restore**, if a real backup pipeline gets built for the
`postgis` volume (none exists today — `geoserver/postgis-init/*.sql` is
seed data, not a backup story). `pg_dump --compress=zstd` (PG16+) and both
pgBackRest and wal-g support zstd. Revisit this memo when that pipeline is
actually being designed.

## Deliberately not applied

**WebSocket state broadcast** (`server/src/ws.ts`) — `perMessageDeflate` is
already off, on purpose (see that file's own header comment): per-socket
compression state costs more at thousands of connections than it saves on
the small diffs actually being sent (`diffState` already limits a broadcast
to whatever top-level `State` keys changed). A zstd *dictionary* trained on
typical patch shapes would sidestep the per-connection-state problem
specifically, but patch payloads here are already small — not worth the
complexity unless patch sizes grow substantially (e.g., a feature that
starts pushing large arrays over this channel every tick).

**nginx static asset serving** (`web/nginx.conf.template`) — no compression
is configured there at all today (not even gzip), but zstd specifically is
the wrong fix: stock `nginx:1.27-alpine` has no zstd module (would need a
custom build with `ngx_http_zstd_module`), and browser
`Content-Encoding: zstd` support lags gzip/brotli. If static-asset transfer
size becomes a real problem, reach for gzip or brotli first.

**PostGIS live column storage** (`targets`, `entity_track_history`, etc.) —
not applicable. Postgres TOAST compression uses pglz (default) or lz4
(PG14+, opt-in), never zstd, for in-table storage — this is a backup-tool
concern (see above), not a schema/column one.

## Checklist for a new feature

When adding something that sends the same-shaped payload repeatedly over a
network (a new Kafka topic/producer, a new polling endpoint, a new
streaming path), ask:
1. Is the payload small, structured, and repetitive across messages? →
   zstd is very likely worth it, cheap given Node's built-in support.
2. Is it large, one-shot request/response (e.g. a big GeoJSON export)? →
   Standard `Accept-Encoding` negotiation (zstd with a gzip fallback) is
   worth it once the payload size is actually a problem.
3. Is it many small messages over many *persistent, stateful* connections
   (another WebSocket-shaped feature)? → Default to no compression, same
   reasoning as `ws.ts` above, unless per-message size grows well past what
   this app's state diffs are today.

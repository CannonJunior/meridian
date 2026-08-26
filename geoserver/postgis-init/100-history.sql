-- Schema for the timelapse capability's historical event store — the
-- table server/src/kafkaHistoryConsumer.ts (Phase 1) batches Kafka messages
-- into, and which GeoServer publishes for the query/playback UI
-- (TimelapseManager.tsx, Phase 3+) to read over WFS.
--
-- affiliation and speed_kn are promoted to real columns rather than left
-- inside attrs, specifically so they're plain CQL_FILTER-able (this was
-- the review's flagged gap: a JSONB sub-field isn't filterable via a plain
-- PostGIS feature type without a SQL-view). attrs stays as a JSONB catch-all
-- for everything else the producer emits that isn't a query-builder filter
-- field. If the producer's schema renames or drops affiliation/speed_kn,
-- the consumer (Phase 1) must fail loudly rather than let this column go
-- silently NULL while the true value sits untouched in attrs — that
-- silent-divergence failure mode is exactly what promoting these columns
-- was meant to avoid, so it must not be reintroduced at the ingest layer.
--
-- event_id is the Kafka message's own id and this table's primary key:
-- ON CONFLICT (event_id) DO NOTHING is what makes the consumer's
-- at-least-once delivery idempotent on replay after a crash. It is NOT
-- safe against a producer re-run with a reused SEED (see kafka/README.md)
-- — that's a deliberate, documented limitation, not an oversight.
DROP TABLE IF EXISTS entity_track_history;
CREATE TABLE entity_track_history (
  event_id    UUID PRIMARY KEY,
  entity_id   TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  layer_id    TEXT NOT NULL,
  affiliation TEXT,
  speed_kn    REAL,
  event_time  TIMESTAMPTZ NOT NULL,
  geom        geometry(Point, 4326) NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entity_track_history_geom_idx        ON entity_track_history USING GIST (geom);
CREATE INDEX entity_track_history_layer_time_idx  ON entity_track_history (layer_id, event_time);
CREATE INDEX entity_track_history_entity_time_idx ON entity_track_history (entity_id, event_time);

-- Read-only role for GeoServer's second datastore (history_ro_pg,
-- provisioned in geoserver-init/provision.sh) — the chosen mechanism for
-- keeping this layer un-writable over WFS-T, since this workspace's WFS-T
-- service level is "Complete" (see 90-live-entities-triggers.sql) and that
-- setting is workspace-wide, not per-layer: a per-layer read-only *service*
-- toggle doesn't exist in stock GeoServer, so enforcement has to happen at
-- the database role instead. Dev-only credential, matching every other
-- password in this stack (POSTGRES_PASSWORD default 'meridian', etc.) —
-- not meant to survive contact with a real deployment any more than those
-- are.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meridian_history_ro') THEN
    CREATE ROLE meridian_history_ro LOGIN PASSWORD 'meridian_history_ro';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE meridian TO meridian_history_ro;
GRANT USAGE ON SCHEMA public TO meridian_history_ro;
GRANT SELECT ON entity_track_history TO meridian_history_ro;
-- No ALTER DEFAULT PRIVILEGES here on purpose: this role's grant is scoped
-- to entity_track_history alone, not "every future table" — a new table
-- added later needs its own explicit GRANT, so read-only access doesn't
-- silently expand.

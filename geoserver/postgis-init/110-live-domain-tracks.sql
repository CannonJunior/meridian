-- Live Domain Tracks — one table per physical domain (AIR/SEA/GROUND/SPACE),
-- fed by server/src/liveDomainKafka.ts's consumer half from the
-- meridian.live.<domain>.v1 Kafka topics (see kafka/README.md's "Live
-- Domain Tracks" section). This is a *separate* projection of the live
-- tactical picture from targets/sensors/friendly_units
-- (80-live-entities.sql) — those tables remain the source of truth the sim
-- tick and server/src/liveSync.ts's two-way WFS-T sync read/write; these
-- four are a read-only-over-WFS mirror, domain-segmented, for GeoServer/
-- external GIS consumers, matching entity_track_history's role for
-- historical data (100-history.sql) rather than duplicating live-entities'
-- two-way editability.
--
-- One row per entity per domain table (entity_id is the primary key, not
-- an append-only event log like entity_track_history) — the consumer
-- upserts the entity's current position on every Kafka message rather than
-- inserting a new row per tick, since this table represents "where is X
-- right now," not "X's history."
DROP TABLE IF EXISTS live_air_tracks;
CREATE TABLE live_air_tracks (
  entity_id   TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  name        TEXT NOT NULL,
  affiliation TEXT,
  geom        geometry(Point, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX live_air_tracks_geom_idx ON live_air_tracks USING GIST (geom);

DROP TABLE IF EXISTS live_sea_tracks;
CREATE TABLE live_sea_tracks (
  entity_id   TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  name        TEXT NOT NULL,
  affiliation TEXT,
  geom        geometry(Point, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX live_sea_tracks_geom_idx ON live_sea_tracks USING GIST (geom);

DROP TABLE IF EXISTS live_ground_tracks;
CREATE TABLE live_ground_tracks (
  entity_id   TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  name        TEXT NOT NULL,
  affiliation TEXT,
  geom        geometry(Point, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX live_ground_tracks_geom_idx ON live_ground_tracks USING GIST (geom);

DROP TABLE IF EXISTS live_space_tracks;
CREATE TABLE live_space_tracks (
  entity_id   TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  name        TEXT NOT NULL,
  affiliation TEXT,
  geom        geometry(Point, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX live_space_tracks_geom_idx ON live_space_tracks USING GIST (geom);

-- Reuses 100-history.sql's meridian_history_ro role rather than creating a
-- fourth-of-a-kind role for these tables — same reasoning applies (the
-- Kafka consumer is the only writer; GeoServer's datastore connects
-- read-only so WFS-T against these layers fails at the database, not a
-- GeoServer config toggle). That role's grant is scoped table-by-table on
-- purpose (see that file's closing comment), so each new table needs its
-- own explicit GRANT here rather than inheriting one.
GRANT SELECT ON live_air_tracks, live_sea_tracks, live_ground_tracks, live_space_tracks TO meridian_history_ro;

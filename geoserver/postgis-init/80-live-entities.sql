-- Schema for Meridian's live tactical picture (targets, sensors, effectors,
-- friendly units, NAIs) — the entities server/src/db.ts reads and writes at
-- runtime, one PostGIS table per entity type, real geometry(Point, 4326)
-- (geometry(Polygon, 4326) for nais' area) instead of the app's old
-- abstract 0-100 x/y grid. Unlike every other seed file in this directory,
-- this one is schema-only — no INSERT statements. The server owns the
-- data and populates it itself on first connect (see db.ts's seedFresh()),
-- the same way it always self-seeded from server/meridian.sqlite before
-- this migration. Publishing these as GeoServer feature types (see
-- provision.sh) is what makes the live picture queryable over WFS by
-- anything other than Meridian's own WebSocket client.
--
-- Column names matching a PostgreSQL keyword (desc -> description) are
-- renamed at this layer; everything else keeps the same name the app's
-- types already use, unquoted (Postgres folds unquoted identifiers to
-- lowercase, which server/src/db.ts's row-mapping already expects).

DROP TABLE IF EXISTS targets;
CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  cat TEXT NOT NULL,
  aff TEXT NOT NULL,
  threat TEXT,
  stage INTEGER NOT NULL,
  pri INTEGER,
  conf INTEGER NOT NULL,
  trkQ INTEGER NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  course REAL NOT NULL,
  speed REAL NOT NULL,
  elev TEXT NOT NULL,
  custody TEXT NOT NULL,
  decay INTEGER NOT NULL,
  sidc TEXT NOT NULL,
  effector TEXT,
  method TEXT NOT NULL,
  cde TEXT NOT NULL,
  nsl BOOLEAN NOT NULL,
  appr_pid BOOLEAN NOT NULL,
  appr_jag BOOLEAN NOT NULL,
  appr_strike BOOLEAN NOT NULL,
  appr_tea BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  bda TEXT,
  engagedAt INTEGER
);
CREATE INDEX targets_geom_idx ON targets USING GIST (geom);

DROP TABLE IF EXISTS sensors;
CREATE TABLE sensors (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  intType TEXT NOT NULL,
  status TEXT NOT NULL,
  tasking TEXT NOT NULL,
  endur INTEGER NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  cov TEXT NOT NULL,
  covDir REAL
);
CREATE INDEX sensors_geom_idx ON sensors USING GIST (geom);

DROP TABLE IF EXISTS effectors;
CREATE TABLE effectors (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  weapon TEXT NOT NULL,
  status TEXT NOT NULL,
  tot INTEGER NOT NULL,
  rng INTEGER NOT NULL,
  suits JSONB NOT NULL,
  stealth BOOLEAN NOT NULL,
  kinetic BOOLEAN NOT NULL
);

DROP TABLE IF EXISTS friendly_units;
CREATE TABLE friendly_units (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  weapon TEXT NOT NULL,
  endur INTEGER NOT NULL,
  effId TEXT
);
CREATE INDEX friendly_units_geom_idx ON friendly_units USING GIST (geom);

DROP TABLE IF EXISTS nais;
CREATE TABLE nais (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  pir TEXT NOT NULL,
  color TEXT NOT NULL,
  geom geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX nais_geom_idx ON nais USING GIST (geom);

DROP TABLE IF EXISTS log;
CREATE TABLE log (
  seq SERIAL PRIMARY KEY,
  t INTEGER NOT NULL,
  tag TEXT NOT NULL,
  text TEXT NOT NULL,
  tag2 TEXT NOT NULL
);

DROP TABLE IF EXISTS meta;
CREATE TABLE meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  t INTEGER NOT NULL,
  selectedId TEXT NOT NULL,
  view TEXT NOT NULL,
  roeIdx INTEGER NOT NULL
);

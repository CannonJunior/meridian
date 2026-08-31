-- Schema for Meridian's Sortie entities — Phase A of the "Rolling Air
-- Picture" ATO/collection-plan/BDA visualization plan (see the design
-- brief for the full rationale). Numbered between 80-live-entities.sql and
-- 90-live-entities-triggers.sql because a Sortie is a live-picture entity
-- server/src/db.ts reads and writes the same way targets/sensors/
-- effectors/friendly_units/nais already are, just not one of the
-- original five.
--
-- No PostGIS geometry column, unlike every table in 80-live-entities.sql:
-- a Sortie doesn't reduce to one point the way a target or a ship does —
-- an AAR orbit or an airlift route is the meaningful geometry, not a
-- coordinate (see the design brief's RT-08 finding). Phase C decides the
-- per-missionType location strategy once the map layer actually needs
-- one; this table doesn't guess at it now.
--
-- Not published as a GeoServer layer, for the same reason targets/
-- sensors/effectors/friendly_units/nais/log/meta aren't either (see
-- geoserver/README.md's layer list) — read/written by server/src/db.ts
-- only. No 90-live-entities-triggers.sql-style NOTIFY trigger for the
-- same reason: that trigger exists to feed server/src/liveSync.ts's
-- GeoServer WFS-T round-trip, which nothing publishes this table to.
--
-- targetIds / supportedSortieIds / collectionRequirementIds / bda are
-- JSONB, matching the existing effectors.suits convention — server/src/
-- db.ts (de)serializes these as plain JS arrays/objects rather than typed
-- Postgres arrays, since nothing needs to query inside them from SQL.
--
-- No atoDay column, deliberately — an earlier version stored the D-3..D+3
-- rolling-timeline band as its own TEXT column, computed once at seed
-- time. Left alone long enough with nothing to recompute it (no live
-- producer, no scheduled reseed, and server/src/db.ts's resetToSeed() was
-- never wired to a route or button), every stored label would quietly go
-- stale relative to "today" without anything failing loudly — the
-- "Tutorial Flight Plan" brief's RT-T1 finding. web/src/selectors.ts's
-- atoDayFor() now derives it client-side, live, from totWindowStart
-- instead; there is nothing for this table to store or index.

DROP TABLE IF EXISTS sorties;
CREATE TABLE sorties (
  id TEXT PRIMARY KEY,
  packageId TEXT,
  callsign TEXT NOT NULL,
  platform TEXT NOT NULL,
  linkedPlatformId TEXT,
  missionType TEXT NOT NULL,
  originAirfield TEXT NOT NULL,
  recoveryAirfield TEXT NOT NULL,
  targetIds JSONB NOT NULL,
  supportedSortieIds JSONB NOT NULL,
  collectionRequirementIds JSONB NOT NULL,
  totWindowStart TIMESTAMPTZ NOT NULL,
  totWindowEnd TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  bda JSONB
);

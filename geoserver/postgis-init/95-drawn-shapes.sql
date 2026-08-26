-- User-drawn shapes created in-app via the map's drawing tool (see
-- web/src/components/DrawingToolManager.tsx) and associated with a specific
-- layer + object — e.g. a hand-traced port-extent polygon for the Maritime
-- Ports layer's WPI 62380 (Sasebo) entry. Replaces the old approach of
-- bundling a hand-coded GeoJSON polygon straight into a TypeScript file
-- (assets/portOutlines.ts, now removed) with something a user can draw and
-- redraw precisely against real Google satellite imagery, saved durably
-- here instead of shipped as source.
--
-- Schema-only, like 80-live-entities.sql. Writes go through
-- server/src/drawnShapes.ts's plain REST API (GET/POST/DELETE
-- /api/drawn-shapes) rather than the WebSocket action system — this is
-- reference/annotation data tied to a layer+object pair, not part of the
-- live simulated picture, so it doesn't need 90-live-entities-triggers.sql's
-- LISTEN/NOTIFY bridge. It IS published as a GeoServer feature type
-- (meridian:drawn_shapes, see geoserver-init/provision.sh) through the same
-- writable ports_pg datastore every other reference layer uses — so the
-- traced geometry itself is real, externally-queryable GIS data (filterable
-- by object_label via CQL_FILTER, same mechanism assets/contextLayers.ts's
-- other filterProperty layers use), not just an app-internal annotation.
--
-- The captured reference image (reference_image + its extent columns) is
-- deliberately NOT exposed as a WFS attribute — it's an app-display
-- convenience (see server/src/drawnShapes.ts's getReferenceImage /
-- GET /api/drawn-shapes/:id/image), not GIS data, and would bloat every
-- WFS GetFeature response for a layer that's supposed to stay lean like its
-- siblings.
-- drawn_shapes_geo (defined below) depends on the table, so it must go
-- first — otherwise re-applying this file against an already-provisioned
-- volume (same re-runnability every seed file here supports) fails with
-- "cannot drop table drawn_shapes because other objects depend on it".
DROP VIEW IF EXISTS drawn_shapes_geo;
DROP TABLE IF EXISTS drawn_shapes;
CREATE TABLE drawn_shapes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_label TEXT NOT NULL,
  geom geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The Google Static Maps capture the shape was traced against (see
  -- googleStaticMap.ts) — optional (older rows predate this column), PNG
  -- bytes, only ever served back through the dedicated image route, never
  -- as a WFS attribute (see header comment).
  reference_image BYTEA,
  -- The captured image's EPSG:3857 bounds at the time it was saved, so it
  -- can be redisplayed at the exact position/scale it was traced against —
  -- computed the same way TacticalMap.tsx computes it for a live capture
  -- (see web/src/googleStaticMap.ts's computeStaticMapExtentWebMercator).
  reference_image_extent_minx DOUBLE PRECISION,
  reference_image_extent_miny DOUBLE PRECISION,
  reference_image_extent_maxx DOUBLE PRECISION,
  reference_image_extent_maxy DOUBLE PRECISION,
  -- What the traced shape represents (DrawingToolManager.tsx's SHAPE KIND
  -- selector) — 'outline' for the object's own extent, 'reporting-point'
  -- for a reporting-point area tied to it. Always exactly these two values
  -- regardless of layer_id.
  kind TEXT NOT NULL DEFAULT 'outline'
);
CREATE INDEX drawn_shapes_geom_idx ON drawn_shapes USING GIST (geom);
CREATE INDEX drawn_shapes_layer_object_idx ON drawn_shapes (layer_id, object_id);

-- What geoserver-init/provision.sh actually publishes as meridian:drawn_shapes
-- (nativeName drawn_shapes_geo, not the table itself) — a view is how the
-- reference_image columns stay out of WFS: GeoServer's REST API doesn't
-- reliably support publishing a table while hiding one native column (see
-- provision.sh's comment for the exact failure), whereas a view only ever
-- exposes the columns it selects.
CREATE OR REPLACE VIEW drawn_shapes_geo AS
  SELECT id, name, layer_id, object_id, object_label, geom, created_at, kind FROM drawn_shapes;

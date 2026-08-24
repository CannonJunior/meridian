-- User-drawn shapes created in-app via the map's drawing tool (see
-- web/src/components/DrawingToolManager.tsx) and associated with a specific
-- layer + object — e.g. a hand-traced port-extent polygon for the Maritime
-- Ports layer's WPI 62380 (Sasebo) entry. Replaces the old approach of
-- bundling a hand-coded GeoJSON polygon straight into a TypeScript file
-- (assets/portOutlines.ts, now removed) with something a user can draw and
-- redraw precisely against real basemap imagery, saved durably here instead
-- of shipped as source.
--
-- Schema-only, like 80-live-entities.sql — server/src/drawnShapes.ts owns
-- reads/writes via a plain REST API (GET/POST/DELETE /api/drawn-shapes),
-- not the WebSocket action system: this is reference/annotation data tied
-- to a layer+object pair, not part of the live simulated picture, so it
-- doesn't need 90-live-entities-triggers.sql's LISTEN/NOTIFY bridge or WFS-T
-- exposure.
DROP TABLE IF EXISTS drawn_shapes;
CREATE TABLE drawn_shapes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_label TEXT NOT NULL,
  geom geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX drawn_shapes_geom_idx ON drawn_shapes USING GIST (geom);
CREATE INDEX drawn_shapes_layer_object_idx ON drawn_shapes (layer_id, object_id);

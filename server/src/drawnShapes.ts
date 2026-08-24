import { randomUUID } from 'node:crypto';
import type { Polygon } from 'geojson';
import { pool } from './db.js';

// CRUD for user-drawn shapes (see geoserver/postgis-init/95-drawn-shapes.sql
// and web/src/components/DrawingToolManager.tsx) — plain REST, not the
// WebSocket action system: this is reference/annotation data tied to a
// layer+object pair, not part of the live simulated picture.
export interface DrawnShape {
  id: string;
  name: string;
  layerId: string;
  objectId: string;
  objectLabel: string;
  geometry: Polygon;
  createdAt: string;
}

function rowToDrawnShape(r: any): DrawnShape {
  return {
    id: r.id,
    name: r.name,
    layerId: r.layer_id,
    objectId: r.object_id,
    objectLabel: r.object_label,
    geometry: JSON.parse(r.geometry),
    createdAt: r.created_at,
  };
}

export async function listDrawnShapes(layerId: string, objectId: string): Promise<DrawnShape[]> {
  const r = await pool.query(
    'SELECT id,name,layer_id,object_id,object_label,ST_AsGeoJSON(geom) AS geometry,created_at FROM drawn_shapes WHERE layer_id=$1 AND object_id=$2 ORDER BY created_at',
    [layerId, objectId],
  );
  return r.rows.map(rowToDrawnShape);
}

export async function createDrawnShape(args: { name: string; layerId: string; objectId: string; objectLabel: string; geometry: Polygon }): Promise<DrawnShape> {
  const id = `shape-${randomUUID()}`;
  const r = await pool.query(
    `INSERT INTO drawn_shapes (id,name,layer_id,object_id,object_label,geom)
     VALUES ($1,$2,$3,$4,$5,ST_SetSRID(ST_GeomFromGeoJSON($6),4326))
     RETURNING id,name,layer_id,object_id,object_label,ST_AsGeoJSON(geom) AS geometry,created_at`,
    [id, args.name, args.layerId, args.objectId, args.objectLabel, JSON.stringify(args.geometry)],
  );
  return rowToDrawnShape(r.rows[0]);
}

export async function deleteDrawnShape(id: string): Promise<void> {
  await pool.query('DELETE FROM drawn_shapes WHERE id=$1', [id]);
}

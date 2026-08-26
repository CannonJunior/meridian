import { randomUUID } from 'node:crypto';
import type { Polygon } from 'geojson';
import { pool } from './db.js';

// CRUD for user-drawn shapes (see geoserver/postgis-init/95-drawn-shapes.sql
// and web/src/components/DrawingToolManager.tsx) — plain REST, not the
// WebSocket action system: this is reference/annotation data tied to a
// layer+object pair, not part of the live simulated picture. The geometry
// itself is ALSO published as a GeoServer feature type (meridian:drawn_shapes,
// see geoserver-init/provision.sh) so it's real, externally-queryable GIS
// data — this module is just the write path (GeoServer reads the same table
// live) plus the reference-image read path, which is deliberately NOT a WFS
// attribute (see the schema file's header comment).
export type ImageExtent = [number, number, number, number];
export type DrawnShapeKind = 'outline' | 'reporting-point';

export interface DrawnShape {
  id: string;
  name: string;
  layerId: string;
  objectId: string;
  objectLabel: string;
  kind: DrawnShapeKind;
  geometry: Polygon;
  createdAt: string;
  // Set when a reference image was captured with this shape — the actual
  // bytes are fetched separately via getReferenceImage/GET
  // /api/drawn-shapes/:id/image, not inlined here, so listing shapes stays
  // cheap regardless of how many carry an image.
  referenceImageUrl: string | null;
  referenceImageExtent: ImageExtent | null;
}

function rowToDrawnShape(r: any): DrawnShape {
  const hasImage = !!r.has_reference_image;
  const extent: ImageExtent | null =
    hasImage && r.reference_image_extent_minx != null
      ? [Number(r.reference_image_extent_minx), Number(r.reference_image_extent_miny), Number(r.reference_image_extent_maxx), Number(r.reference_image_extent_maxy)]
      : null;
  return {
    id: r.id,
    name: r.name,
    layerId: r.layer_id,
    objectId: r.object_id,
    objectLabel: r.object_label,
    kind: r.kind,
    geometry: JSON.parse(r.geometry),
    createdAt: r.created_at,
    referenceImageUrl: hasImage ? `/api/drawn-shapes/${r.id}/image` : null,
    referenceImageExtent: extent,
  };
}

const LIST_COLUMNS = `id,name,layer_id,object_id,object_label,kind,ST_AsGeoJSON(geom) AS geometry,created_at,
  (reference_image IS NOT NULL) AS has_reference_image,
  reference_image_extent_minx,reference_image_extent_miny,reference_image_extent_maxx,reference_image_extent_maxy`;

export async function listDrawnShapes(layerId: string, objectId: string): Promise<DrawnShape[]> {
  const r = await pool.query(`SELECT ${LIST_COLUMNS} FROM drawn_shapes WHERE layer_id=$1 AND object_id=$2 ORDER BY created_at`, [layerId, objectId]);
  return r.rows.map(rowToDrawnShape);
}

// Strips a "data:image/png;base64,...." prefix down to the raw base64
// payload — throws rather than silently storing garbage if the string
// doesn't look like a data URL, since a malformed capture should surface,
// not save.
function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('referenceImage must be a base64 data URL');
  return Buffer.from(match[1], 'base64');
}

export async function createDrawnShape(args: {
  name: string;
  layerId: string;
  objectId: string;
  objectLabel: string;
  kind: DrawnShapeKind;
  geometry: Polygon;
  referenceImage?: string;
  referenceImageExtent?: ImageExtent;
}): Promise<DrawnShape> {
  const id = `shape-${randomUUID()}`;
  const imageBuffer = args.referenceImage ? decodeDataUrl(args.referenceImage) : null;
  const extent = imageBuffer ? args.referenceImageExtent : undefined;
  const r = await pool.query(
    `INSERT INTO drawn_shapes (id,name,layer_id,object_id,object_label,kind,geom,reference_image,reference_image_extent_minx,reference_image_extent_miny,reference_image_extent_maxx,reference_image_extent_maxy)
     VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_GeomFromGeoJSON($7),4326),$8,$9,$10,$11,$12)
     RETURNING ${LIST_COLUMNS}`,
    [id, args.name, args.layerId, args.objectId, args.objectLabel, args.kind, JSON.stringify(args.geometry), imageBuffer, extent?.[0] ?? null, extent?.[1] ?? null, extent?.[2] ?? null, extent?.[3] ?? null],
  );
  return rowToDrawnShape(r.rows[0]);
}

// Geometry-only update — the drawing tool's Edit flow (TacticalMap.tsx's
// Modify interaction) only ever moves/adds vertices on an already-saved
// shape, never touches its name/kind/association.
export async function updateDrawnShapeGeometry(id: string, geometry: Polygon): Promise<DrawnShape | null> {
  const r = await pool.query(
    `UPDATE drawn_shapes SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2),4326) WHERE id=$1 RETURNING ${LIST_COLUMNS}`,
    [id, JSON.stringify(geometry)],
  );
  return r.rows[0] ? rowToDrawnShape(r.rows[0]) : null;
}

export async function deleteDrawnShape(id: string): Promise<void> {
  await pool.query('DELETE FROM drawn_shapes WHERE id=$1', [id]);
}

export async function getReferenceImage(id: string): Promise<Buffer | null> {
  const r = await pool.query('SELECT reference_image FROM drawn_shapes WHERE id=$1', [id]);
  return r.rows[0]?.reference_image ?? null;
}

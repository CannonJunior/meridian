// Phase 2 of the timelapse capability (see kafka/README.md and
// geoserver/README.md's "Entity Track History" section for Phases 0/1):
// turns a structured, UI-supplied filter into a GeoServer WFS query against
// meridian:entity_track_history. The query builder in TimelapseManager.tsx
// (Phase 3+) is what makes this a *query builder* rather than a raw-CQL
// textbox, and that shape is deliberate, not incidental — this module never
// accepts CQL text from the caller. Every clause in buildCqlFilter() is
// assembled from a value that's already been validated by validateFilter()
// against a fixed whitelist of fields, characters, and ranges; the string
// values that do reach a CQL string literal are still quote-escaped as a
// second layer, in case a future field is ever widened to allow freer text.
//
// GEOSERVER_WFS_URL is fetched from a Node process, not the browser, so it's
// safe to point at the container's published host port the same way
// server/src/db.ts already does for Postgres.
import type { Feature, FeatureCollection } from 'geojson';

const GEOSERVER_WFS_URL = process.env.GEOSERVER_WFS_URL ?? 'http://localhost:8600/geoserver/meridian/wfs';
const TYPE_NAME = 'meridian:entity_track_history';

// The layerIds the query builder can ask for — matches the layer_id values
// entity_track_history's rows actually hold. A real allowlist, not a
// stand-in: adding a layer means adding it here AND to the producer/
// consumer schema (kafka/README.md), not just to the UI.
// 'history-vessel-tracks' is seeded by geoserver/postgis-init/
// 101-history-fixtures.sql (Phase 0) and, in production, the Kafka
// pipeline (kafka/README.md, Phase 1). 'history-air-tracks' (Phase D of
// the "Rolling Air Picture" plan) is fixture-only today, seeded by
// server/src/seed.ts's SEED_AIR_TRACK_HISTORY via db.ts's seedFresh() —
// deliberately not a static postgis-init SQL file, since its timestamps
// have to land inside whichever Sortie it belongs to's real, dynamically-
// computed TOT window (see seed.ts's atoTime()), and not through the
// Kafka pipeline either, since there's no live air-track producer yet.
const ALLOWED_LAYER_IDS = new Set(['history-vessel-tracks', 'history-air-tracks']);

// Hard cap on features returned by a single page — mirrors the
// "pre-simplify so the browser can hold it" discipline contextLayers.ts
// already applies to eez/bathymetry_contours, applied here to feature
// *count* instead of geometry complexity.
export const MAX_FEATURES = 50_000;
export const DEFAULT_PAGE_SIZE = 1_000;

export class HistoryQueryError extends Error {}

export interface BboxFilter {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface HistoryFilter {
  layerId: string;
  timeStart: string; // ISO 8601, validated
  timeEnd: string; // ISO 8601, validated
  bbox?: BboxFilter;
  entityKind?: string;
  affiliation?: string;
  speedMin?: number;
  speedMax?: number;
}

const SAFE_TOKEN = /^[A-Za-z0-9_-]{1,40}$/;

function isValidIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

// Validates and narrows an arbitrary (e.g. Express req.query) object into a
// HistoryFilter. Throws HistoryQueryError on anything outside the
// whitelist — unknown layerId, out-of-range bbox, non-ISO timestamps,
// entityKind/affiliation containing anything but a safe token. This is
// where a CQL/SQL-injection-shaped payload (quotes, parens, boolean-logic
// keywords) gets rejected outright, before it's anywhere near string
// interpolation — see historyQuery.test.ts's "rejects" cases.
export function validateFilter(raw: Record<string, unknown>): HistoryFilter {
  const layerId = String(raw.layerId ?? '');
  if (!ALLOWED_LAYER_IDS.has(layerId)) {
    throw new HistoryQueryError(`Unknown layerId '${layerId}' — must be one of: ${[...ALLOWED_LAYER_IDS].join(', ')}`);
  }

  const timeStart = String(raw.timeStart ?? '');
  const timeEnd = String(raw.timeEnd ?? '');
  if (!isValidIso(timeStart) || !isValidIso(timeEnd)) {
    throw new HistoryQueryError('timeStart and timeEnd must be ISO 8601 UTC timestamps, e.g. 2026-08-20T08:00:00Z');
  }
  if (Date.parse(timeStart) > Date.parse(timeEnd)) {
    throw new HistoryQueryError('timeStart must not be after timeEnd');
  }

  const filter: HistoryFilter = { layerId, timeStart, timeEnd };

  if (raw.bbox != null) {
    const b = raw.bbox as Partial<BboxFilter>;
    const west = Number(b.west);
    const south = Number(b.south);
    const east = Number(b.east);
    const north = Number(b.north);
    if (![west, south, east, north].every(Number.isFinite)) {
      throw new HistoryQueryError('bbox requires finite west/south/east/north');
    }
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
      throw new HistoryQueryError('bbox is out of range or degenerate (expects west<east, south<north, within -180..180/-90..90)');
    }
    filter.bbox = { west, south, east, north };
  }

  if (raw.entityKind != null) {
    const v = String(raw.entityKind);
    if (!SAFE_TOKEN.test(v)) throw new HistoryQueryError('entityKind contains characters outside the allowed set');
    filter.entityKind = v;
  }

  if (raw.affiliation != null) {
    const v = String(raw.affiliation);
    if (!SAFE_TOKEN.test(v)) throw new HistoryQueryError('affiliation contains characters outside the allowed set');
    filter.affiliation = v;
  }

  if (raw.speedMin != null) {
    const v = Number(raw.speedMin);
    if (!Number.isFinite(v)) throw new HistoryQueryError('speedMin must be a finite number');
    filter.speedMin = v;
  }

  if (raw.speedMax != null) {
    const v = Number(raw.speedMax);
    if (!Number.isFinite(v)) throw new HistoryQueryError('speedMax must be a finite number');
    filter.speedMax = v;
  }

  if (filter.speedMin != null && filter.speedMax != null && filter.speedMin > filter.speedMax) {
    throw new HistoryQueryError('speedMin must not be greater than speedMax');
  }

  return filter;
}

// Quote-escapes a string for use inside a CQL string literal (doubles
// embedded single quotes, same rule as SQL). Defense in depth: every
// caller today already passed a SAFE_TOKEN-validated value, so this never
// has anything to escape in practice — but it's what stands between a
// future, less-constrained field and a broken-out string literal, so it's
// applied unconditionally rather than "only when a field looks risky."
function cqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Builds the CQL_FILTER string from an already-validated HistoryFilter.
// AXIS ORDER: BBOX() takes (geom, south, west, north, east) — lat,lon
// order — NOT the filter's own west/south/east/north (lon,lat) field
// order. This GeoServer instance requires lat,lon order for EPSG:4326
// BBOX filtering (both the raw WFS BBOX param and CQL's BBOX() function —
// verified live in Phase 0, see geoserver/README.md's "Axis order"
// section) and silently returns zero results if it's backwards, not an
// error — which is exactly why this line has a dedicated test in
// historyQuery.test.ts rather than being left to eyeball review.
export function buildCqlFilter(filter: HistoryFilter): string {
  const clauses: string[] = [
    `layer_id = ${cqlString(filter.layerId)}`,
    `event_time >= ${cqlString(filter.timeStart)}`,
    `event_time <= ${cqlString(filter.timeEnd)}`,
  ];
  if (filter.bbox) {
    const { west, south, east, north } = filter.bbox;
    clauses.push(`BBOX(geom, ${south}, ${west}, ${north}, ${east})`);
  }
  if (filter.entityKind) clauses.push(`entity_kind = ${cqlString(filter.entityKind)}`);
  if (filter.affiliation) clauses.push(`affiliation = ${cqlString(filter.affiliation)}`);
  if (filter.speedMin != null) clauses.push(`speed_kn >= ${filter.speedMin}`);
  if (filter.speedMax != null) clauses.push(`speed_kn <= ${filter.speedMax}`);
  return clauses.join(' AND ');
}

// Clamps caller-supplied pagination params to safe integer bounds — pure,
// so it's unit-testable without a network call.
export function clampPage(rawStartIndex: unknown, rawCount: unknown): { startIndex: number; count: number } {
  const s = Number(rawStartIndex);
  const c = Number(rawCount);
  const startIndex = Number.isFinite(s) ? Math.max(0, Math.trunc(s)) : 0;
  const count = Number.isFinite(c) ? Math.min(MAX_FEATURES, Math.max(1, Math.trunc(c))) : DEFAULT_PAGE_SIZE;
  return { startIndex, count };
}

async function wfsGetText(params: URLSearchParams): Promise<string> {
  const url = `${GEOSERVER_WFS_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoServer WFS request failed: HTTP ${res.status} — ${url}`);
  return res.text();
}

// resultType=hits preflight — lets the query-builder UI (Phase 3) warn on
// a too-broad query before committing to a full GetFeature fetch, rather
// than after.
export async function countHistoryFeatures(filter: HistoryFilter): Promise<number> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: TYPE_NAME,
    resultType: 'hits',
    CQL_FILTER: buildCqlFilter(filter),
  });
  const text = await wfsGetText(params);
  const match = text.match(/numberMatched="(\d+)"/);
  if (!match) throw new Error(`Could not parse numberMatched from GeoServer response: ${text.slice(0, 200)}`);
  return Number(match[1]);
}

export interface HistoryQueryResult {
  features: Feature[];
  startIndex: number;
  count: number;
  totalMatched: number;
  truncated: boolean;
}

// The actual GetFeature fetch — always sorted (event_time, then event_id as
// a tiebreaker for deterministic ordering across pages when many rows share
// a timestamp) and always paginated via startIndex/count, so two successive
// page requests against a table under concurrent ingest can't silently
// duplicate or skip rows the way an unordered query could.
export async function queryHistoryFeatures(filter: HistoryFilter, page: { startIndex?: unknown; count?: unknown } = {}): Promise<HistoryQueryResult> {
  const { startIndex, count } = clampPage(page.startIndex, page.count);
  const cql = buildCqlFilter(filter);

  const [totalMatched, text] = await Promise.all([
    countHistoryFeatures(filter),
    wfsGetText(
      new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: TYPE_NAME,
        outputFormat: 'application/json',
        CQL_FILTER: cql,
        sortBy: 'event_time,event_id',
        startIndex: String(startIndex),
        count: String(count),
      }),
    ),
  ]);

  const geojson = JSON.parse(text) as FeatureCollection;
  return {
    features: geojson.features ?? [],
    startIndex,
    count,
    totalMatched,
    truncated: totalMatched > MAX_FEATURES,
  };
}

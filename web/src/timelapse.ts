// Phase 3+ of the timelapse capability (see kafka/README.md and
// geoserver/README.md's "Entity Track History" section for Phases 0/1,
// server/src/historyQuery.ts for Phase 2): the client-side query-builder
// API client and playback selectors LayerManager.tsx and
// TimelapseMapLayer.tsx are built on. Mirrors historyQuery.ts's shape
// deliberately — this is the other half of that contract, not a
// reinvention of it.
import type { Feature } from 'geojson';
import type { Domain } from './types';

export type TimelapseLayerId = 'history-vessel-tracks' | 'history-air-tracks' | 'history-ground-events' | 'history-space-tracks';

export interface TimelapseLayer {
  id: TimelapseLayerId;
  label: string;
  domain: Domain;
}

// `domain` is what LayerManager.tsx uses to nest each layer's controls
// under the matching domain section (VESSEL TRACKS under MARITIME/SEA, AIR
// TRACKS under AIR) instead of a standalone layer picker. GROUND EVENTS and
// SPACE TRACKS are real external data (GDELT / CelesTrak — see
// kafka/producer-gdelt and kafka/producer-celestrak), not this app's own
// simulated GROUND/SPACE domain entities — see kafka/README.md's "Message
// schema" section for the disambiguation from the unrelated Live Domain
// Tracks pipeline.
export const TIMELAPSE_LAYERS: TimelapseLayer[] = [
  { id: 'history-vessel-tracks', label: 'VESSEL TRACKS', domain: 'SEA' },
  { id: 'history-air-tracks', label: 'AIR TRACKS', domain: 'AIR' },
  { id: 'history-ground-events', label: 'GROUND EVENTS (GDELT)', domain: 'GROUND' },
  { id: 'history-space-tracks', label: 'SPACE TRACKS (CELESTRAK)', domain: 'SPACE' },
];

// Every Domain has exactly one layer above (one-to-one by construction, not
// coincidence) — this is the non-optional lookup LayerManager.tsx's
// DomainSection uses instead of `TIMELAPSE_LAYERS.find(...) ?? null`, so a
// domain section's timelapse row doesn't need an "unmapped domain" branch
// for a case that can't occur. If a domain is ever added without a
// matching layer, this throws at module load rather than silently handing
// out `undefined` deep inside a component render.
export const TIMELAPSE_LAYER_BY_DOMAIN: Record<Domain, TimelapseLayer> = Object.fromEntries(
  TIMELAPSE_LAYERS.map((l) => [l.domain, l]),
) as Record<Domain, TimelapseLayer>;
for (const domain of ['AIR', 'SEA', 'GROUND', 'SPACE'] as const) {
  if (!TIMELAPSE_LAYER_BY_DOMAIN[domain]) throw new Error(`timelapse.ts: no TIMELAPSE_LAYERS entry for domain "${domain}"`);
}

export interface BboxFilter {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TimelapseFilter {
  layerId: TimelapseLayerId;
  timeStart: string; // ISO 8601 UTC, e.g. 2026-08-20T08:00:00Z
  timeEnd: string;
  bbox?: BboxFilter;
  entityKind?: string;
  affiliation?: string;
  speedMin?: number;
  speedMax?: number;
}

export interface HistoryQueryResult {
  features: Feature[];
  startIndex: number;
  count: number;
  totalMatched: number;
  truncated: boolean;
}

export class TimelapseApiError extends Error {}

// Mirrors historyQuery.ts's own MAX_FEATURES — nothing enforces these two
// staying in sync, same caveat as the promoted-column list in
// kafka/README.md.
export const MAX_TIMELAPSE_FEATURES = 50_000;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBoundsUtc(date: Date, offsetDaysStart: number, offsetDaysEnd: number): { start: string; end: string } {
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return {
    start: new Date(base + offsetDaysStart * DAY_MS).toISOString(),
    end: new Date(base + offsetDaysEnd * DAY_MS).toISOString(),
  };
}

// A sensible starting time range per layer — the two layers' seed data
// live on unrelated clocks (see geoserver/postgis-init/101-history-fixtures.sql
// vs. server/src/seed.ts's SEED_AIR_TRACK_HISTORY doc comment), so one
// shared default would leave whichever layer wasn't hardcoded to match
// showing zero results the first time a user opens this panel.
export function defaultTimelapseFilter(layerId: TimelapseLayerId): TimelapseFilter {
  if (layerId === 'history-vessel-tracks') {
    // Matches 101-history-fixtures.sql's six fixed rows (all timestamped
    // 2026-08-20, 08:00-10:30Z) — the only data this layer has until the
    // Kafka producer (kafka/README.md, Phase 1) is actually running.
    return { layerId, timeStart: '2026-08-20T00:00:00Z', timeEnd: '2026-08-21T00:00:00Z' };
  }
  if (layerId === 'history-air-tracks') {
    // seed.ts's SEED_AIR_TRACK_HISTORY is anchored to this server
    // process's boot day (its SEED_EPOCH), not a fixed date — bracket
    // D-1..D+2 around "now" rather than hardcoding one.
    const { start, end } = dayBoundsUtc(new Date(), -1, 3);
    return { layerId, timeStart: start, timeEnd: end };
  }
  // history-ground-events / history-space-tracks: real, continuously
  // updating external data (kafka/producer-gdelt, kafka/producer-celestrak)
  // rather than a fixed fixture — "today" is always the right window,
  // unlike the two fixture-backed layers above.
  const { start, end } = dayBoundsUtc(new Date(), 0, 1);
  return { layerId, timeStart: start, timeEnd: end };
}

// The two continuously-running real-data layers — see defaultTimelapseFilter
// above for why their filter window is handled separately from the two
// fixture-backed layers. Reused by initialCursorFor below for the same
// "these two are live, not a bounded scenario" distinction.
const LIVE_LAYER_IDS = new Set<TimelapseLayerId>(['history-ground-events', 'history-space-tracks']);

// Where LOAD should park the playback cursor the moment features arrive.
// For the two fixture-backed layers (bounded historical scenarios,
// vessel/air) this is filter.timeStart, same as before — pressing play
// watches the whole thing unfold from the beginning, which is the point of
// a "timelapse." For the two live layers, their actual data only exists
// from whenever their producer container happened to start publishing —
// often hours after filter.timeStart (today's midnight) — so starting the
// cursor there shows "0 visible, nothing on the map" until the user
// manually scrubs most of the way across the slider, which reads as
// broken on first use. filter.timeEnd works for both: entityStatesAtTime
// picks the latest point at-or-before the cursor, and since nothing exists
// past "now" either, parking at timeEnd (always >= now for these two
// layers' filter window) always lands on each entity's most recent
// position — i.e. "show me what's happening right now."
export function initialCursorFor(layerId: TimelapseLayerId, filter: TimelapseFilter): string {
  return LIVE_LAYER_IDS.has(layerId) ? filter.timeEnd : filter.timeStart;
}

function filterToParams(filter: TimelapseFilter): URLSearchParams {
  const params = new URLSearchParams({ layerId: filter.layerId, timeStart: filter.timeStart, timeEnd: filter.timeEnd });
  // bbox[west]=..&bbox[south]=..&bbox[east]=..&bbox[north]=.. — Express's
  // default 'extended' query parser nests this into an object server-side
  // (see server/src/index.ts's history routes and historyQuery.ts's
  // validateFilter), so the bracketed keys are load-bearing, not cosmetic.
  if (filter.bbox) {
    params.set('bbox[west]', String(filter.bbox.west));
    params.set('bbox[south]', String(filter.bbox.south));
    params.set('bbox[east]', String(filter.bbox.east));
    params.set('bbox[north]', String(filter.bbox.north));
  }
  if (filter.entityKind) params.set('entityKind', filter.entityKind);
  if (filter.affiliation) params.set('affiliation', filter.affiliation);
  if (filter.speedMin != null) params.set('speedMin', String(filter.speedMin));
  if (filter.speedMax != null) params.set('speedMax', String(filter.speedMax));
  return params;
}

async function readJsonOrThrow(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new TimelapseApiError(body.error ?? `HTTP ${res.status}`);
  return body;
}

// resultType=hits preflight (historyQuery.ts's countHistoryFeatures) — lets
// the panel warn on a too-broad query before committing to a full fetch.
export async function fetchHistoryCount(filter: TimelapseFilter): Promise<number> {
  const body = await readJsonOrThrow(await fetch(`/api/history/query/count?${filterToParams(filter).toString()}`));
  return body.count as number;
}

export async function fetchHistoryFeatures(filter: TimelapseFilter, page: { startIndex?: number; count?: number } = {}): Promise<HistoryQueryResult> {
  const params = filterToParams(filter);
  if (page.startIndex != null) params.set('startIndex', String(page.startIndex));
  if (page.count != null) params.set('count', String(page.count));
  const body = await readJsonOrThrow(await fetch(`/api/history/query?${params.toString()}`));
  return body as HistoryQueryResult;
}

// --- Playback selectors ---------------------------------------------------
// Pure functions over the features LayerManager loaded, used by both
// the manager's own summary list and TimelapseMapLayer's markers, so the
// two can never disagree about "what's visible at time T."

export interface TrackPoint {
  time: string; // ISO 8601
  lng: number;
  lat: number;
  speedKn: number | null;
  affiliation: string | null;
}

export interface EntityTrack {
  entityId: string;
  entityKind: string;
  name: string;
  points: TrackPoint[]; // ascending by time
}

export interface EntityState {
  entityId: string;
  entityKind: string;
  name: string;
  current: TrackPoint;
  // Preceding points, most recent first, capped — for drawing a short trail.
  trail: TrackPoint[];
}

function attrName(attrs: unknown, fallback: string): string {
  if (attrs && typeof attrs === 'object') {
    const a = attrs as Record<string, unknown>;
    const name = a.name ?? a.callsign;
    if (typeof name === 'string' && name) return name;
  }
  return fallback;
}

function toTrackPoint(f: Feature): TrackPoint | null {
  if (!f.geometry || f.geometry.type !== 'Point') return null;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const time = String(p.event_time ?? '');
  if (!time) return null;
  return {
    time,
    lng,
    lat,
    speedKn: typeof p.speed_kn === 'number' ? p.speed_kn : null,
    affiliation: typeof p.affiliation === 'string' ? p.affiliation : null,
  };
}

// Groups raw WFS features by entity_id, each entity's points sorted
// ascending by event_time — the shape entityStatesAtTime's binary search
// assumes.
export function groupByEntity(features: Feature[]): Map<string, EntityTrack> {
  const groups = new Map<string, EntityTrack>();
  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const entityId = String(p.entity_id ?? '');
    const point = toTrackPoint(f);
    if (!entityId || !point) continue;
    let group = groups.get(entityId);
    if (!group) {
      group = { entityId, entityKind: String(p.entity_kind ?? ''), name: attrName(p.attrs, entityId), points: [] };
      groups.set(entityId, group);
    }
    group.points.push(point);
  }
  for (const group of groups.values()) group.points.sort((a, b) => a.time.localeCompare(b.time));
  return groups;
}

const TRAIL_LENGTH = 6;

// For each entity, its most recent point at-or-before cursorIso plus a
// short trailing history. An entity with nothing yet at or before the
// cursor is omitted entirely — it hasn't "appeared" in the playback yet,
// not drawn at some earlier position it never actually held at time T.
export function entityStatesAtTime(grouped: Map<string, EntityTrack>, cursorIso: string): EntityState[] {
  const out: EntityState[] = [];
  for (const { entityId, entityKind, name, points } of grouped.values()) {
    let lo = 0;
    let hi = points.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].time <= cursorIso) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx === -1) continue;
    out.push({ entityId, entityKind, name, current: points[idx], trail: points.slice(Math.max(0, idx - TRAIL_LENGTH), idx).reverse() });
  }
  return out;
}

// LayerManager.tsx's per-domain "center on this layer's data" button —
// deliberately over every loaded point regardless of cursor position, not
// entityStatesAtTime's "what's visible right now." Right after Load the
// cursor sits at filter.timeStart, which for most layers is *before* the
// actual data window (see defaultTimelapseFilter's per-layer doc comments)
// — nothing is visible-at-cursor yet even though features are loaded, and
// a button that only works once you've scrubbed forward reads as "just
// doesn't work" the first time someone reaches for it.
export function extentOfFeatures(features: Feature[]): { west: number; south: number; east: number; north: number } | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const f of features) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

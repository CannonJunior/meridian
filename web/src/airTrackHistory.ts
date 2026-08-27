// Phase D — fetches a completed Sortie's real historical track from
// entity_track_history (via the existing /api/history/query route) so
// Phase C's flight-line rendering can use it instead of that phase's
// straight-line approximation. The query API has no entity_id filter (see
// server/src/historyQuery.ts's HistoryFilter) — narrowed to a time window
// around the sortie's own TOT window instead, then matched client-side by
// entity_id === sortie.callsign, the same "server narrows, client
// disambiguates" split contextLayerData.ts already uses for CQL filters.
import type { Sortie } from './types';

export interface HistoryTrackPoint {
  lng: number;
  lat: number;
  eventTime: string;
}

interface HistoryQueryFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: { entity_id?: string; event_time?: string };
}
interface HistoryQueryResponse {
  features: HistoryQueryFeature[];
}

// Padding wide enough to cover this fixture's real span (TOT window ±12
// minutes — see seed.ts's SEED_AIR_TRACK_HISTORY) with margin, without
// being so wide it risks picking up an unrelated sortie's track under the
// same callsign on a different day.
const PAD_MS = 30 * 60 * 1000;

const cache = new Map<string, Promise<HistoryTrackPoint[]>>();

export function loadSortieHistoryTrack(sortie: Sortie): Promise<HistoryTrackPoint[]> {
  let pending = cache.get(sortie.id);
  if (!pending) {
    const timeStart = new Date(new Date(sortie.totWindowStart).getTime() - PAD_MS).toISOString();
    const timeEnd = new Date(new Date(sortie.totWindowEnd).getTime() + PAD_MS).toISOString();
    const params = new URLSearchParams({ layerId: 'history-air-tracks', timeStart, timeEnd, entityKind: 'aircraft' });
    pending = fetch(`/api/history/query?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`history query failed for sortie ${sortie.id}: HTTP ${res.status}`);
        return res.json() as Promise<HistoryQueryResponse>;
      })
      .then((result) =>
        result.features
          .filter((f) => f.properties.entity_id === sortie.callsign)
          .map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], eventTime: f.properties.event_time ?? '' }))
          .sort((a, b) => a.eventTime.localeCompare(b.eventTime)),
      );
    pending.catch(() => cache.delete(sortie.id));
    cache.set(sortie.id, pending);
  }
  return pending;
}

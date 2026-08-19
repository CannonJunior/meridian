// Tenth Fleet (U.S. Fleet Cyber Command) has no ships to plot — its
// component commands are pure organizational nodes in assets/oob.ts. Their
// real-world locations are a small, fixed dataset (5 points), so unlike the
// GeoServer-hosted WFS context layers, this is bundled directly as a static
// GeoJSON FeatureCollection rather than requiring a server round-trip. Each
// feature's `oobId` property links back to the corresponding OOB node —
// double-clicking a point opens that node's object card (see
// TacticalMap.tsx's context-layer dblclick handler).
import type { FeatureCollection } from 'geojson';

export const TENTH_FLEET_LOCATIONS: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'us-10f-fortmeade',
      geometry: { type: 'Point', coordinates: [-76.74, 39.11] },
      properties: { oobId: 'us-navy-10f', name: 'U.S. Tenth Fleet / Fleet Cyber Command — Fort Meade, MD' },
    },
    {
      type: 'Feature',
      id: 'us-10f-nioc-norfolk',
      geometry: { type: 'Point', coordinates: [-76.3, 36.85] },
      properties: { oobId: 'us-10f-nioc-norfolk', name: 'NIOC Norfolk, VA' },
    },
    {
      type: 'Feature',
      id: 'us-10f-nioc-sandiego',
      geometry: { type: 'Point', coordinates: [-117.16, 32.72] },
      properties: { oobId: 'us-10f-nioc-sandiego', name: 'NIOC San Diego, CA' },
    },
    {
      type: 'Feature',
      id: 'us-10f-nioc-pensacola',
      geometry: { type: 'Point', coordinates: [-87.32, 30.35] },
      properties: { oobId: 'us-10f-nioc-pensacola', name: 'NIOC Pensacola, FL' },
    },
    {
      type: 'Feature',
      id: 'us-10f-nioc-whidbey',
      geometry: { type: 'Point', coordinates: [-122.66, 48.35] },
      properties: { oobId: 'us-10f-nioc-whidbey', name: 'NIOC Whidbey Island, WA' },
    },
    {
      type: 'Feature',
      id: 'us-10f-nioc-colorado',
      geometry: { type: 'Point', coordinates: [-104.75, 39.7] },
      properties: { oobId: 'us-10f-nioc-colorado', name: 'NIOC Colorado — Buckley Space Force Base, Aurora, CO' },
    },
  ],
};

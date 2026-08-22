// The AO's real-world bounding box (Strait of Gibraltar — fictional AO, real
// coastline). Mirrored on the client in web/src/mapProjection.ts; kept as a
// separate copy since server/ and web/ are independent TypeScript projects
// with no shared-code package between them.
export const AO_BOUNDS = {
  west: -6.05,
  east: -5.15,
  south: 35.75,
  north: 36.25,
};

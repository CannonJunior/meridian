// The AO's real-world bounding box (Strait of Gibraltar — fictional AO, real
// coastline). Mirrored on the client in web/src/mapProjection.ts; kept as a
// separate copy since server/ and web/ are independent TypeScript projects
// with no shared-code package between them.
//
// Single-AO placeholder: this is Meridian's intended first AO, not its only
// one — the project's stated scope is worldwide, growing region-by-region.
// A second AO isn't a matter of editing these four numbers in place; it
// needs AO_BOUNDS (here and in mapProjection.ts) to become a lookup keyed
// by an AO id, plus whatever currently assumes a single fixed AO
// implicitly (seed.ts's fixture positions, the sim's target/sensor/unit
// starting data, and any UI that hardcodes this bounding box rather than
// reading it).
export const AO_BOUNDS = {
  west: -6.05,
  east: -5.15,
  south: 35.75,
  north: 36.25,
};

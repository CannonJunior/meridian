// Airspace Control Order control measures (JP 3-52 / JP 3-30) — the
// airspace-reservation counterpart to the ATO, published alongside it so
// every ATO sortie flies inside a deconflicted structure rather than raw
// open airspace. A minimal, static reference set for this AO (not derived
// from Sortie or any other live state, and not server-persisted — same
// "small fixed dataset" tier as assets/tenthFleetLocations.ts) illustrating
// the two kinds of measure this scenario actually needs: a Restricted
// Operations Zone around package ALPHA's target area, and the tanker track
// ALPHA-04 (TEXACO-3) works. Phase C's map-integration scope, not a
// generated-from-the-real-ACO product — there is no ACO document behind
// this yet, unlike Sortie's ATO-derived data.
export type AcmKind = 'ROZ' | 'CORRIDOR';

export interface AirspaceControlMeasure {
  id: string;
  kind: AcmKind;
  name: string;
  color: string;
  altitudeBlock: string;
  // ROZ: an axis-aligned box, same shape convention as Nai. CORRIDOR: a
  // polyline of 2+ points — a tanker track or ingress/egress route.
  box?: { lngMin: number; latMin: number; lngMax: number; latMax: number };
  line?: [number, number][];
}

export const AIRSPACE_CONTROL_MEASURES: AirspaceControlMeasure[] = [
  {
    id: 'ROZ-ALPHA',
    kind: 'ROZ',
    name: 'ROZ ALPHA',
    color: '#ff5a47',
    altitudeBlock: 'SFC–FL280',
    box: { lngMin: -5.86, latMin: 35.98, lngMax: -5.58, latMax: 36.2 },
  },
  {
    id: 'AR-1',
    kind: 'CORRIDOR',
    name: 'AR-1 · TANKER TRACK',
    color: '#5b9dff',
    altitudeBlock: 'FL220–FL260',
    line: [
      [-5.53, 36.02],
      [-5.4, 35.96],
      [-5.3, 35.92],
    ],
  },
];

// Phase E of the "Rolling Air Picture" plan — the Component Prioritized
// Collection List (CPCL, JP 2-01): the collection side's mirror of
// assets/targetLists.ts's JTL/JIPTL, closing the gap the design brief's
// literature review flagged (§I.4 — "the collection side has no
// equivalent list yet"). A real JIPCL reconciliation step (JCWG across
// multiple components) isn't modeled — this scenario has exactly one
// component, so CPCL is the operative list here, not an intermediate one.
//
// Static reference content, same tier as assets/targetLists.ts and
// assets/vesselProfiles.ts — not server-persisted, cross-referenced
// against the live `nais` and `sorties` arrays by id by
// selectors.ts's sortiesForCollectionRequirement() rather than stored
// redundantly here. `naiId: null` is a real, intended state (PIR-3 below
// has no formal NAI drawn for it yet), not a placeholder.
import type { Nai } from '../types';

export interface CollectionRequirement {
  id: string;
  naiId: string | null;
  pir: string;
  priority: number;
  description: string;
}

export const COLLECTION_REQUIREMENTS: CollectionRequirement[] = [
  { id: 'CPCL-01', naiId: 'NAI-1', pir: 'PIR-1', priority: 1, description: 'Confirm AShM battery composition and reload status.' },
  { id: 'CPCL-02', naiId: 'NAI-2', pir: 'PIR-1', priority: 2, description: 'Detect TBM launcher displacement pattern ahead of next window.' },
  { id: 'CPCL-03', naiId: 'NAI-3', pir: 'PIR-2', priority: 1, description: 'Maintain custody on VIPER SAM battery for reattack timing.' },
  { id: 'CPCL-04', naiId: null, pir: 'PIR-3', priority: 3, description: 'Standing air-picture custody across the AO — no formal NAI drawn yet.' },
];

export function naiForRequirement(req: CollectionRequirement, nais: Nai[]): Nai | null {
  return req.naiId ? (nais.find((n) => n.id === req.naiId) ?? null) : null;
}

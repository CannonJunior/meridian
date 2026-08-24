// Derives a JSON-LD knowledge-graph document from Meridian's existing data
// sources — never a second copy of that data, always a live view over it
// (the same discipline oobSelectors.ts and assets/targetLists.ts already
// apply elsewhere in this app). Node identity is the URI scheme in
// kb/ontology.ts; two ships that mount the same radar/weapon system share
// the *same* RadarSystem/WeaponSystem node id, which is what makes "same
// URI = graph relationship" literally true here, not just a naming
// convention.

import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { OOB_TREE } from '../assets/oob';
import type { OobNode } from '../assets/oob';
import { parentOf } from '../oobSelectors';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import { loadContextLayerData } from '../contextLayerData';
import { TARGET_LISTS, listsForTarget } from '../assets/targetLists';
import { useStore } from '../store';
import type { Target } from '../types';
import { contextLayerUri, oobUri, radarUri, targetListUri, targetUri, weaponUri, KG_CONTEXT } from './ontology';
import type { KgDocument, KgNode, KgType } from './ontology';
import { deriveEezZones, derivePortMatches } from './geoMatch';

function oobKgType(n: OobNode): KgType {
  if (n.kind === 'contact') return 'Contact';
  if (n.kind === 'ship') return 'NavalVessel';
  if (n.entityType === 'object') return 'Unit';
  return 'Command';
}

// Everything except live targets and user associations: the OOB tree
// (which is static data), radar/weapon systems, context layers, target
// list definitions, and the two geo-joined layers (EEZ zones, matched
// ports — see kb/geoMatch.ts). This is the expensive part — in particular
// derivePortMatches runs a haversine check across every OOB anchor for
// each of ~5,400 world ports — so it's kept in its own function, memoized
// separately from live data in useKnowledgeGraph below. targets update via
// the WebSocket far more often than eez/ports change (every server tick,
// vs. once per session), so recomputing this whole pass on every tick was
// the actual cause of the KB going unresponsive — see git history / the
// conversation this was fixed in for the full diagnosis.
function buildStaticGraph(args: { eez?: FeatureCollection | null; ports?: FeatureCollection | null }): KgNode[] {
  const nodes = new Map<string, KgNode>();

  function walk(list: OobNode[]) {
    for (const n of list) {
      const uri = oobUri(n.id);
      const parent = parentOf(n.id);
      const kgNode: KgNode = {
        '@id': uri,
        '@type': oobKgType(n),
        name: n.name,
        properties: {
          kind: n.kind,
          role: n.role,
          status: n.status,
          class: n.class,
          lengthM: n.lengthM,
          displacementT: n.displacementT,
          lat: n.lat,
          lng: n.lng,
        },
        partOf: parent ? [oobUri(parent.id)] : undefined,
        hasRadar: n.radars?.length ? n.radars.map((r) => radarUri(r.name)) : undefined,
        hasWeapon: n.weapons?.length ? n.weapons.map((w) => weaponUri(w.name)) : undefined,
      };
      nodes.set(uri, kgNode);

      for (const r of n.radars ?? []) {
        const rUri = radarUri(r.name);
        if (!nodes.has(rUri)) nodes.set(rUri, { '@id': rUri, '@type': 'RadarSystem', name: r.name, properties: { type: r.type, rangeNm: r.rangeNm } });
      }
      for (const w of n.weapons ?? []) {
        const wUri = weaponUri(w.name);
        if (!nodes.has(wUri)) nodes.set(wUri, { '@id': wUri, '@type': 'WeaponSystem', name: w.name, properties: { type: w.type, rangeNm: w.rangeNm } });
      }

      if (n.children) walk(n.children);
    }
  }
  walk(OOB_TREE);

  for (const layer of CONTEXT_LAYERS) {
    const uri = contextLayerUri(layer.id);
    // Only 'static' layers bundle their own GeoJSON directly (see
    // contextLayers.ts) — WFS layers are fetched from GeoServer at render
    // time and never loaded here, so there's no per-feature data available
    // to link from. Of the static layers, only those whose features carry
    // an explicit `oobId` (a real, already-declared correspondence — see
    // assets/tenthFleetLocations.ts) get a relatedTo edge; nothing here is
    // inferred from names/geography.
    const oobIds = layer.staticData?.features
      .map((f) => (f.properties as Record<string, unknown> | null)?.oobId)
      .filter((id): id is string => typeof id === 'string');
    const relatedTo = oobIds && oobIds.length ? Array.from(new Set(oobIds)).map(oobUri) : undefined;
    nodes.set(uri, {
      '@id': uri,
      '@type': 'ContextLayer',
      name: layer.name,
      properties: { sourceType: layer.sourceType, geometryType: layer.geometryType, description: layer.description },
      relatedTo,
    });
  }

  for (const list of TARGET_LISTS) {
    const uri = targetListUri(list.id);
    nodes.set(uri, { '@id': uri, '@type': 'TargetList', name: list.name, properties: { acronym: list.acronym, description: list.description } });
  }

  if (args.eez) {
    for (const n of deriveEezZones('eez', args.eez)) nodes.set(n['@id'], n);
  }
  if (args.ports) {
    for (const n of derivePortMatches('maritime-ports', args.ports)) nodes.set(n['@id'], n);
  }

  return Array.from(nodes.values());
}

// The cheap, high-frequency part: overlays live targets (which change on
// every server tick) and user-created associations onto the static graph
// above, without re-running any of the expensive derivation. Pure/plain —
// no memoization here; useKnowledgeGraph below is what actually gates how
// often each part reruns.
export function buildKnowledgeGraph(args: { staticNodes: KgNode[]; targets: Target[]; kbAssociations: Record<string, string[]> }): KgDocument {
  const nodes = new Map(args.staticNodes.map((n) => [n['@id'], n]));

  for (const t of args.targets) {
    const uri = targetUri(t.id);
    const lists = listsForTarget(t).map((id) => targetListUri(id));
    nodes.set(uri, {
      '@id': uri,
      '@type': 'Target',
      name: t.name,
      properties: { cat: t.cat, aff: t.aff, threat: t.threat, lat: t.lat, lng: t.lng },
      memberOfList: lists.length ? lists : undefined,
    });
  }

  // User-created associations: generic URI-to-URI edges. Stored symmetric
  // in the store (see store.ts's associateEntities), so a single pass just
  // applies whatever's on file for each node that has any. Replaces the map
  // entry with a shallow copy rather than mutating the node in place —
  // `nodes` shares object references with the memoized static graph above,
  // and mutating those directly would leak into every future render
  // (including failing to ever clear associatedWith once dissociateEntities
  // empties a node's association list, since map[from] stays a `[]` entry
  // rather than disappearing).
  for (const [uri, related] of Object.entries(args.kbAssociations)) {
    const node = nodes.get(uri);
    if (!node) continue;
    nodes.set(uri, { ...node, associatedWith: related.length ? related : undefined });
  }

  return { '@context': KG_CONTEXT, '@graph': Array.from(nodes.values()) };
}

// The outgoing-edge fields above (partOf, hasRadar, hasWeapon, memberOfList,
// relatedTo) are all one-directional by nature — a ship points at the radar
// it carries, not the other way around — which is normal for a JSON-LD
// graph (a node only ever states its own outgoing links). But it means a
// RadarSystem/WeaponSystem/TargetList/ContextLayer/root-org node can be
// solidly connected — visibly linked by an edge in the graph view — while
// its own card's RELATIONSHIPS tab, which only ever read that node's own
// fields, showed nothing. This reverse-indexes every outgoing edge in the
// graph so a node's card can also show "what points at me" (see
// KbEntityCardBody.tsx). associatedWith is deliberately excluded: it's
// already written symmetrically in both directions at the source (see
// store.ts's associateEntities), so indexing it again here would just
// duplicate every association edge.
export type IncomingRelation = 'partOf' | 'hasRadar' | 'hasWeapon' | 'memberOfList' | 'relatedTo';

export interface IncomingEdge {
  from: string;
  relation: IncomingRelation;
}

export function buildIncomingIndex(doc: KgDocument): Map<string, IncomingEdge[]> {
  const index = new Map<string, IncomingEdge[]>();
  const add = (to: string, from: string, relation: IncomingRelation) => {
    const list = index.get(to);
    if (list) list.push({ from, relation });
    else index.set(to, [{ from, relation }]);
  };
  for (const n of doc['@graph']) {
    for (const p of n.partOf ?? []) add(p, n['@id'], 'partOf');
    for (const r of n.hasRadar ?? []) add(r, n['@id'], 'hasRadar');
    for (const w of n.hasWeapon ?? []) add(w, n['@id'], 'hasWeapon');
    for (const l of n.memberOfList ?? []) add(l, n['@id'], 'memberOfList');
    for (const c of n.relatedTo ?? []) add(c, n['@id'], 'relatedTo');
  }
  return index;
}

const EEZ_LAYER = CONTEXT_LAYERS.find((l) => l.id === 'eez')!;
const PORTS_LAYER = CONTEXT_LAYERS.find((l) => l.id === 'maritime-ports')!;

// Fetches the two joinable layers' WFS data once, via the same cached
// loadContextLayerData() the map itself uses (contextLayerData.ts) — so
// this never double-fetches over the network even if the map has also (or
// separately) loaded these layers; it's only ever indexed twice (once for
// the map's rendering, once here for the join), never fetched twice.
function useJoinableLayerData(): { eez: FeatureCollection | null; ports: FeatureCollection | null } {
  const [eez, setEez] = useState<FeatureCollection | null>(null);
  const [ports, setPorts] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let alive = true;
    loadContextLayerData(EEZ_LAYER)
      .then((fc) => alive && setEez(fc))
      .catch(() => {});
    loadContextLayerData(PORTS_LAYER)
      .then((fc) => alive && setPorts(fc))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return { eez, ports };
}

// Two-layer memoization is deliberate: the static graph (OOB, radar/weapon,
// context layers, EEZ/port geo-join) only depends on eez/ports, which
// change once per session at most — so it's memoized separately from
// targets/kbAssociations, which the live sim updates on every server tick.
// Collapsing this into one useMemo keyed on all four (an earlier version of
// this code did) meant the expensive geo-join reran on every single tick,
// which was enough to make the whole KB panel unresponsive under a fast
// tick rate.
export function useKnowledgeGraph(): KgDocument {
  const targets = useStore((s) => s.targets);
  const kbAssociations = useStore((s) => s.kbAssociations);
  const { eez, ports } = useJoinableLayerData();
  const staticNodes = useMemo(() => buildStaticGraph({ eez, ports }), [eez, ports]);
  return useMemo(() => buildKnowledgeGraph({ staticNodes, targets, kbAssociations }), [staticNodes, targets, kbAssociations]);
}

export interface CytoscapeElement {
  data: { id: string; source?: string; target?: string; label: string; type?: KgType };
}

// Adapter only — the JSON-LD document above stays the source of truth
// (shown verbatim in the entity card's raw-JSON-LD view); this just
// reshapes it into the {nodes, edges} element list Cytoscape wants.
export function toCytoscapeElements(doc: KgDocument): CytoscapeElement[] {
  const nodeIds = new Set(doc['@graph'].map((n) => n['@id']));
  const elements: CytoscapeElement[] = [];
  const seenEdge = new Set<string>();

  function addEdge(from: string, to: string, label: string) {
    // An associatedWith edge can point at a URI outside the graph (e.g. a
    // raw external GeoServer feature URL) — that's a valid edge in the
    // JSON-LD doc and shows in the card's RELATIONSHIPS tab, but Cytoscape
    // requires both endpoints to exist as nodes, so it's skipped here.
    if (!nodeIds.has(to)) return;
    const key = `${from}->${to}:${label}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    elements.push({ data: { id: key, source: from, target: to, label } });
  }

  for (const n of doc['@graph']) {
    elements.push({ data: { id: n['@id'], label: n.name, type: n['@type'] } });
  }
  for (const n of doc['@graph']) {
    for (const p of n.partOf ?? []) addEdge(n['@id'], p, 'partOf');
    for (const r of n.hasRadar ?? []) addEdge(n['@id'], r, 'hasRadar');
    for (const w of n.hasWeapon ?? []) addEdge(n['@id'], w, 'hasWeapon');
    for (const l of n.memberOfList ?? []) addEdge(n['@id'], l, 'memberOfList');
    for (const c of n.relatedTo ?? []) addEdge(n['@id'], c, 'relatedTo');
    for (const a of n.associatedWith ?? []) addEdge(n['@id'], a, 'associatedWith');
  }
  return elements;
}

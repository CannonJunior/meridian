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

// OOB-only view for the "org chart" layout: Command nodes (organizations —
// countries/branches/fleets/task forces/squadrons/bases) and the object
// nodes that sit in their command chain (NavalVessel/Unit/Contact) — the
// same organization/object split oob.ts's OobEntityType already draws.
// Everything else the KG tracks (radar/weapon systems, context layers,
// target lists, live targets, associations) is out of scope for this view,
// same as the concentric layout's depth walk only following partOf.
const ORG_CHART_TYPES: ReadonlySet<KgType> = new Set(['Command', 'NavalVessel', 'Unit', 'Contact']);

export interface OrgChartPosition {
  x: number;
  y: number;
}

export interface OrgChartLayout {
  elements: CytoscapeElement[];
  positions: Record<string, OrgChartPosition>;
}

// Box geometry used both to compute positions here and to size the actual
// cytoscape node boxes in KnowledgeGraphView (kept in sync manually — this
// module has no rendering concerns of its own).
export const ORG_CHART_BOX_W = 132;
export const ORG_CHART_BOX_H = 34;
const H_GAP = 16;
const V_GAP = 10;
const LEVEL_GAP = 64;

interface Subtree {
  width: number;
  height: number;
  positions: Map<string, OrgChartPosition>;
}

// A hand-rolled tidy-tree, not one of cytoscape's built-in layouts (unlike
// every other mode in the dropdown) — see the comment on layoutForMode in
// KnowledgeGraphView.tsx for why: cytoscape's breadthfirst puts every node
// at a given depth on one shared rank, and a rank layout can't help this
// data's shape (a squadron's ~15-20 ships all land in the one deepest
// rank alongside every *other* squadron's ships, forcing a ~90-wide row
// that starves every other rank of the container's height). Wrapping each
// leaf-heavy sibling group into its own compact grid — the way the
// referenced numbered-fleet composition charts actually draw a squadron's
// hull list — fixes it structurally: a subtree's width is its own
// children's, not the whole tree's deepest rank.
function layoutNode(id: string, childrenOf: Map<string, string[]>): Subtree {
  const children = childrenOf.get(id) ?? [];
  if (children.length === 0) {
    return { width: ORG_CHART_BOX_W, height: ORG_CHART_BOX_H, positions: new Map([[id, { x: 0, y: 0 }]]) };
  }

  const positions = new Map<string, OrgChartPosition>();
  const allLeaves = children.every((c) => !(childrenOf.get(c)?.length));
  if (allLeaves && children.length > 6) {
    const cols = Math.max(3, Math.ceil(Math.sqrt(children.length * 1.8)));
    const rows = Math.ceil(children.length / cols);
    const gridWidth = cols * (ORG_CHART_BOX_W + H_GAP) - H_GAP;
    children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(c, {
        x: col * (ORG_CHART_BOX_W + H_GAP) - gridWidth / 2 + ORG_CHART_BOX_W / 2,
        y: LEVEL_GAP + row * (ORG_CHART_BOX_H + V_GAP),
      });
    });
    positions.set(id, { x: 0, y: 0 });
    return { width: Math.max(gridWidth, ORG_CHART_BOX_W), height: LEVEL_GAP + rows * (ORG_CHART_BOX_H + V_GAP), positions };
  }

  // Standard tidy-tree case: children side by side, each occupying exactly
  // its own subtree's width, so a small branch doesn't waste the space a
  // wide sibling branch needs.
  const subtrees = children.map((c) => ({ id: c, sub: layoutNode(c, childrenOf) }));
  const totalWidth = subtrees.reduce((sum, s) => sum + s.sub.width, 0) + H_GAP * (subtrees.length - 1);
  let cursor = -totalWidth / 2;
  let maxChildBottom = 0;
  for (const { sub } of subtrees) {
    const centerX = cursor + sub.width / 2;
    for (const [cid, p] of sub.positions) positions.set(cid, { x: centerX + p.x, y: LEVEL_GAP + p.y });
    maxChildBottom = Math.max(maxChildBottom, LEVEL_GAP + sub.height);
    cursor += sub.width + H_GAP;
  }
  positions.set(id, { x: 0, y: 0 });
  return { width: Math.max(totalWidth, ORG_CHART_BOX_W), height: maxChildBottom, positions };
}

export function buildOrgChart(doc: KgDocument): OrgChartLayout {
  const nodes = doc['@graph'].filter((n) => ORG_CHART_TYPES.has(n['@type']));
  const nodeIds = new Set(nodes.map((n) => n['@id']));
  const elements: CytoscapeElement[] = nodes.map((n) => ({ data: { id: n['@id'], label: n.name, type: n['@type'] } }));

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of nodes) {
    const parent = n.partOf?.[0];
    if (parent && nodeIds.has(parent)) {
      elements.push({ data: { id: `${parent}->${n['@id']}:partOf`, source: parent, target: n['@id'], label: 'partOf' } });
      const list = childrenOf.get(parent);
      if (list) list.push(n['@id']);
      else childrenOf.set(parent, [n['@id']]);
    } else {
      roots.push(n['@id']);
    }
  }

  const rootTrees = roots.map((id) => ({ id, sub: layoutNode(id, childrenOf) }));
  const rootGap = H_GAP * 3; // extra breathing room between unrelated top-level orgs (separate countries/branches)
  const totalWidth = rootTrees.reduce((sum, r) => sum + r.sub.width, 0) + rootGap * Math.max(0, rootTrees.length - 1);
  const positions: Record<string, OrgChartPosition> = {};
  let cursor = -totalWidth / 2;
  for (const { sub } of rootTrees) {
    const centerX = cursor + sub.width / 2;
    for (const [id, p] of sub.positions) positions[id] = { x: centerX + p.x, y: p.y };
    cursor += sub.width + rootGap;
  }

  return { elements, positions };
}

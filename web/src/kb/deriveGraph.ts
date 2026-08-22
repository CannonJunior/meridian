// Derives a JSON-LD knowledge-graph document from Meridian's existing data
// sources — never a second copy of that data, always a live view over it
// (the same discipline oobSelectors.ts and assets/targetLists.ts already
// apply elsewhere in this app). Node identity is the URI scheme in
// kb/ontology.ts; two ships that mount the same radar/weapon system share
// the *same* RadarSystem/WeaponSystem node id, which is what makes "same
// URI = graph relationship" literally true here, not just a naming
// convention.

import { useMemo } from 'react';
import { OOB_TREE } from '../assets/oob';
import type { OobNode } from '../assets/oob';
import { parentOf } from '../oobSelectors';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import { TARGET_LISTS, listsForTarget } from '../assets/targetLists';
import { useStore } from '../store';
import type { Target } from '../types';
import { contextLayerUri, oobUri, radarUri, targetListUri, targetUri, weaponUri, KG_CONTEXT } from './ontology';
import type { KgDocument, KgNode, KgType } from './ontology';

function oobKgType(n: OobNode): KgType {
  if (n.kind === 'contact') return 'Contact';
  if (n.entityType === 'object') return 'NavalVessel';
  return 'Command';
}

export function buildKnowledgeGraph(args: { targets: Target[]; kbAssociations: Record<string, string[]> }): KgDocument {
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
    nodes.set(uri, {
      '@id': uri,
      '@type': 'ContextLayer',
      name: layer.name,
      properties: { sourceType: layer.sourceType, geometryType: layer.geometryType, description: layer.description },
    });
  }

  for (const list of TARGET_LISTS) {
    const uri = targetListUri(list.id);
    nodes.set(uri, { '@id': uri, '@type': 'TargetList', name: list.name, properties: { acronym: list.acronym, description: list.description } });
  }

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
  // applies whatever's on file for each node that has any.
  for (const [uri, related] of Object.entries(args.kbAssociations)) {
    const node = nodes.get(uri);
    if (node && related.length) node.associatedWith = related;
  }

  return { '@context': KG_CONTEXT, '@graph': Array.from(nodes.values()) };
}

// OOB, context layers, and target lists are all static — only live targets
// and user-created associations actually vary at runtime, so those are the
// only two store slices this recomputes on.
export function useKnowledgeGraph(): KgDocument {
  const targets = useStore((s) => s.targets);
  const kbAssociations = useStore((s) => s.kbAssociations);
  return useMemo(() => buildKnowledgeGraph({ targets, kbAssociations }), [targets, kbAssociations]);
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
    for (const a of n.associatedWith ?? []) addEdge(n['@id'], a, 'associatedWith');
  }
  return elements;
}

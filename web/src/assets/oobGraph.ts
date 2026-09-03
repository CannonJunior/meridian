// Graph asset derived from the OOB tree (assets/oob.ts): every node flattened
// with a parent edge. This is the shape a future graph/network view will
// consume — nodes + edges rather than nested children. Currently unconsumed
// — nothing in web/src imports OobGraphNode/OobGraphEdge/buildOobGraph/
// OOB_GRAPH yet, so don't go looking for a caller; this exists ahead of
// that view being built.

import { OOB_TREE } from './oob';
import type { OobNode } from './oob';

export interface OobGraphNode {
  id: string;
  label: string;
  kind: OobNode['kind'];
  entityType: OobNode['entityType'];
  status?: OobNode['status'];
  depth: number;
  parentId: string | null;
}

export interface OobGraphEdge {
  source: string;
  target: string;
}

export interface OobGraph {
  nodes: OobGraphNode[];
  edges: OobGraphEdge[];
}

function walk(nodes: OobNode[], parentId: string | null, depth: number, out: OobGraph): void {
  for (const n of nodes) {
    out.nodes.push({ id: n.id, label: n.name, kind: n.kind, entityType: n.entityType, status: n.status, depth, parentId });
    if (parentId) out.edges.push({ source: parentId, target: n.id });
    if (n.children) walk(n.children, n.id, depth + 1, out);
  }
}

export function buildOobGraph(tree: OobNode[] = OOB_TREE): OobGraph {
  const out: OobGraph = { nodes: [], edges: [] };
  walk(tree, null, 0, out);
  return out;
}

export const OOB_GRAPH: OobGraph = buildOobGraph();

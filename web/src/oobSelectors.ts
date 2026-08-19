// Pure derived-value helpers over the OOB asset tree (assets/oob.ts).

import { OOB_TREE } from './assets/oob';
import type { ObjectStatus, OobKind, OobNode } from './assets/oob';

const KIND_LABEL: Record<OobKind, string> = {
  country: 'NATION',
  branch: 'BRANCH',
  fleet: 'FLEET',
  numberedAF: 'NUMBERED AIR FORCE',
  command: 'TASK FORCE',
  group: 'GROUP',
  wing: 'WING',
  squadron: 'SQUADRON',
  base: 'BASE',
  ship: 'SHIP',
  unit: 'UNIT',
  contact: 'UNIDENTIFIED CONTACT',
};

export function kindLabel(kind: OobKind): string {
  return KIND_LABEL[kind] ?? kind.toUpperCase();
}

export function findOobNode(id: string, tree: OobNode[] = OOB_TREE): OobNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findOobNode(id, n.children);
      if (found) return found;
    }
  }
  return null;
}

export function ancestorIds(id: string, tree: OobNode[] = OOB_TREE): string[] {
  const path: string[] = [];
  function walk(nodes: OobNode[], trail: string[]): boolean {
    for (const n of nodes) {
      if (n.id === id) {
        path.push(...trail);
        return true;
      }
      if (n.children && walk(n.children, [...trail, n.id])) return true;
    }
    return false;
  }
  walk(tree, []);
  return path;
}

export function pathNodes(id: string, tree: OobNode[] = OOB_TREE): OobNode[] {
  const ids = [...ancestorIds(id, tree), id];
  const out: OobNode[] = [];
  for (const i of ids) {
    const n = findOobNode(i, tree);
    if (n) out.push(n);
  }
  return out;
}

export function parentOf(id: string, tree: OobNode[] = OOB_TREE): OobNode | null {
  const ids = ancestorIds(id, tree);
  if (ids.length === 0) return null;
  return findOobNode(ids[ids.length - 1], tree);
}

// Despite the name, this returns sibling nodes of any entity type — for a
// ship, siblings are other ships (objects); for an organizational node like
// a squadron, siblings are other squadrons under the same group (also
// organizations). The "ASSOCIATIONS" tab just wants "what else is under
// this node's parent", regardless of kind.
export function siblingObjectsOf(id: string, tree: OobNode[] = OOB_TREE): OobNode[] {
  const parent = parentOf(id, tree);
  const list = parent ? (parent.children ?? []) : tree;
  return list.filter((n) => n.id !== id);
}

export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export function flattenObjects(tree: OobNode[] = OOB_TREE): OobNode[] {
  const out: OobNode[] = [];
  function walk(nodes: OobNode[]) {
    for (const n of nodes) {
      if (n.entityType === 'object') out.push(n);
      if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

export interface StatusMeta {
  label: string;
  color: string;
  opacity: number;
  dash?: string;
}

export function statusMeta(status: ObjectStatus | undefined): StatusMeta {
  switch (status) {
    case 'OBSCURED':
      return { label: 'OBSCURED', color: 'var(--ink-mute2)', opacity: 0.45, dash: '3 4' };
    case 'MISIDENTIFIED':
      return { label: 'UNVERIFIED ID', color: 'var(--yellow)', opacity: 0.85 };
    case 'DESTROYED':
      return { label: 'DESTROYED', color: 'var(--red)', opacity: 0.7 };
    case 'UNKNOWN':
      return { label: 'CONTACT LOST', color: 'var(--ink-faint)', opacity: 0.35, dash: '2 5' };
    case 'UNIDENTIFIED':
      return { label: 'UNIDENTIFIED', color: 'var(--yellow)', opacity: 0.9, dash: '2 4' };
    case 'VISIBLE':
    default:
      return { label: 'TRACKED', color: 'var(--cyan)', opacity: 1 };
  }
}

// A "contact" node's displayed status reflects whether the user has
// tentatively assigned it an identity via the IDENTIFY workflow: still
// UNIDENTIFIED until then, then MISIDENTIFIED ("unverified ID") once
// assigned — the same status ships already use for an unconfirmed
// classification, since a tentative contact ID is exactly that. Every
// other kind's status passes through unchanged.
export function effectiveStatus(node: OobNode, contactIdentityAssignments: Record<string, string>): ObjectStatus | undefined {
  if (node.kind === 'contact' && contactIdentityAssignments[node.id]) return 'MISIDENTIFIED';
  return node.status;
}

export type OobTabKey = 'overview' | 'identify' | 'hierarchy' | 'sensors' | 'associations';

const TAB_LABEL: Record<OobTabKey, string> = {
  overview: 'OVERVIEW',
  identify: 'IDENTIFY',
  hierarchy: 'HIERARCHY',
  sensors: 'SENSORS & ARMAMENT',
  associations: 'ASSOCIATIONS',
};

// The object card's tab set depends on what kind of node is open: a ship
// gets a SENSORS & ARMAMENT tab; an unidentified contact gets an IDENTIFY
// tab instead (there's nothing to show under sensors/armament until an
// identity is assigned); a pure organizational node (command/wing/
// squadron/etc.) gets neither.
export function oobTabKeys(node: OobNode): OobTabKey[] {
  if (node.kind === 'contact') return ['overview', 'identify', 'hierarchy', 'associations'];
  if (node.entityType === 'object') return ['overview', 'hierarchy', 'sensors', 'associations'];
  return ['overview', 'hierarchy', 'associations'];
}

export function oobTabNames(node: OobNode): string[] {
  return oobTabKeys(node).map((k) => TAB_LABEL[k]);
}

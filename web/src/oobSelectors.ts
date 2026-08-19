// Pure derived-value helpers over the OOB asset tree (assets/oob.ts).

import { OOB_TREE } from './assets/oob';
import type { ObjectStatus, OobNode } from './assets/oob';

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

export function siblingObjectsOf(id: string, tree: OobNode[] = OOB_TREE): OobNode[] {
  const parent = parentOf(id, tree);
  const list = parent ? (parent.children ?? []) : tree;
  return list.filter((n) => n.id !== id && n.entityType === 'object');
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
    case 'VISIBLE':
    default:
      return { label: 'TRACKED', color: 'var(--cyan)', opacity: 1 };
  }
}

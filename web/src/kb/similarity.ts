// Deterministic, explainable "more like this" similarity search over
// NavalVessel/Contact knowledge-graph nodes. No ML, no black-box score —
// matches the adjudication-rationale discipline store.ts already applies
// elsewhere in this app (every ADJUDICATORS entry there always returns
// concrete `reasons`, never just a verdict): every similarity score comes
// with the concrete feature matches behind it.
//
// Country is deliberately NOT part of the score — it's exactly the thing
// the user wants to search *across* ("find similar Chinese vessels to a
// selected US vessel"), so weighting toward same-country matches would
// defeat the point. It's still available on each result via the node's own
// @id/properties for the caller to display or filter by.

import type { KgNode } from './ontology';

const WEIGHTS = { class: 0.15, length: 0.25, radar: 0.3, weapon: 0.3 };

export interface SimilarityResult {
  node: KgNode;
  score: number; // 0..1
  reasons: string[];
}

function numericSimilarity(a: unknown, b: unknown, tolerance: number): number {
  if (typeof a !== 'number' || typeof b !== 'number') return 0;
  return Math.max(0, 1 - Math.abs(a - b) / tolerance);
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return Array.from(new Set(a.filter((x) => setB.has(x))));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const union = new Set([...a, ...b]);
  return overlap(a, b).length / union.size;
}

function linkedTypes(node: KgNode, edgeKey: 'hasRadar' | 'hasWeapon', allNodesById: Map<string, KgNode>): string[] {
  return (node[edgeKey] ?? []).map((uri) => allNodesById.get(uri)?.properties.type).filter((t): t is string => typeof t === 'string');
}

export function scoreSimilarity(a: KgNode, b: KgNode, allNodesById: Map<string, KgNode>): SimilarityResult {
  const reasons: string[] = [];
  let score = 0;

  if (a.properties.class && a.properties.class === b.properties.class) {
    score += WEIGHTS.class;
    reasons.push(`same class family (${a.properties.class})`);
  }

  const lengthSim = numericSimilarity(a.properties.lengthM, b.properties.lengthM, 60);
  if (lengthSim > 0) {
    score += WEIGHTS.length * lengthSim;
    if (lengthSim > 0.6) reasons.push(`comparable hull length (~${a.properties.lengthM}m vs ~${b.properties.lengthM}m)`);
  }

  const radarTypesA = linkedTypes(a, 'hasRadar', allNodesById);
  const radarTypesB = linkedTypes(b, 'hasRadar', allNodesById);
  const radarOverlap = jaccard(radarTypesA, radarTypesB);
  if (radarOverlap > 0) {
    score += WEIGHTS.radar * radarOverlap;
    reasons.push(`overlapping radar role (${overlap(radarTypesA, radarTypesB).join(', ')})`);
  }

  const weaponTypesA = linkedTypes(a, 'hasWeapon', allNodesById);
  const weaponTypesB = linkedTypes(b, 'hasWeapon', allNodesById);
  const weaponOverlap = jaccard(weaponTypesA, weaponTypesB);
  if (weaponOverlap > 0) {
    score += WEIGHTS.weapon * weaponOverlap;
    reasons.push(`overlapping weapon role (${overlap(weaponTypesA, weaponTypesB).join(', ')})`);
  }

  return { node: b, score, reasons };
}

export function moreLikeThis(node: KgNode, allNodes: KgNode[], topN = 8): SimilarityResult[] {
  const allNodesById = new Map(allNodes.map((n) => [n['@id'], n]));
  const scored = allNodes
    .filter((n) => n['@id'] !== node['@id'] && (n['@type'] === 'NavalVessel' || n['@type'] === 'Contact'))
    .map((n) => scoreSimilarity(node, n, allNodesById))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);

  // Sister hulls of the same class always score at or near 1.0 (identical
  // fit data) and would otherwise fill every slot — collapse to the single
  // best-scoring hull per class so cross-class/cross-country matches (the
  // actual point of "more like this") aren't crowded out by a ship's own
  // squadron-mates. Hulls with no class on file (e.g. contacts) each stand
  // alone, keyed by id instead.
  const bestPerClass = new Map<string, SimilarityResult>();
  for (const r of scored) {
    const key = typeof r.node.properties.class === 'string' ? r.node.properties.class : r.node['@id'];
    if (!bestPerClass.has(key)) bestPerClass.set(key, r);
  }
  return Array.from(bestPerClass.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, topN);
}

// JSON-LD ontology/vocabulary for Meridian's knowledge graph — the URI
// scheme and @context that let any entity (OOB platform, radar/weapon
// system, context layer, target list, live target) be addressed and linked
// uniformly. Two entities that reference the *same* URI (e.g. two ships
// fitted with the same radar) are graph-linked by that fact alone — see
// radarUri/weaponUri below, and kb/deriveGraph.ts for what builds the
// actual graph from this vocabulary, and kb/similarity.ts for what
// searches it.
//
// The vocabulary lives under a private, non-resolving namespace
// (https://meridian.local/ontology#) — normal practice for an app-internal
// JSON-LD vocabulary that has no need to be dereferenced over HTTP.

export const MERIDIAN_NS = 'https://meridian.local/ontology#';

export const KG_CONTEXT: Record<string, string> = {
  merid: MERIDIAN_NS,
  name: 'https://schema.org/name',
  partOf: `${MERIDIAN_NS}partOf`,
  hasRadar: `${MERIDIAN_NS}hasRadar`,
  hasWeapon: `${MERIDIAN_NS}hasWeapon`,
  memberOfList: `${MERIDIAN_NS}memberOfList`,
  relatedTo: `${MERIDIAN_NS}relatedTo`,
  associatedWith: `${MERIDIAN_NS}associatedWith`,
};

export type KgType = 'NavalVessel' | 'Unit' | 'Contact' | 'Command' | 'RadarSystem' | 'WeaponSystem' | 'ContextLayer' | 'GeoFeature' | 'TargetList' | 'Target';

export const KG_TYPE_LABEL: Record<KgType, string> = {
  NavalVessel: 'NAVAL VESSEL',
  Unit: 'UNIT',
  Contact: 'UNIDENTIFIED CONTACT',
  Command: 'COMMAND / ORGANIZATION',
  RadarSystem: 'RADAR SYSTEM',
  WeaponSystem: 'WEAPON SYSTEM',
  ContextLayer: 'CONTEXT LAYER',
  // A specific real feature drawn from a context layer's own WFS/GeoJSON
  // dataset (an EEZ zone, a matched port) — distinct from the ContextLayer
  // node itself, which represents the dataset/layer as a whole. See
  // kb/geoMatch.ts for how these get derived and joined to OOB entities.
  GeoFeature: 'GEOGRAPHIC FEATURE',
  TargetList: 'TARGET LIST',
  Target: 'TARGET',
};

const KG_TYPE_COLOR: Record<KgType, string> = {
  NavalVessel: 'var(--cyan)',
  Unit: 'var(--cyan)',
  Contact: 'var(--yellow)',
  Command: 'var(--blue)',
  RadarSystem: 'var(--violet)',
  WeaponSystem: 'var(--red)',
  ContextLayer: 'var(--green)',
  GeoFeature: 'var(--green)',
  TargetList: 'var(--amber)',
  Target: 'var(--ink-mute)',
};

export function kgTypeColor(type: KgType): string {
  return KG_TYPE_COLOR[type];
}

export type KgTabKey = 'overview' | 'relationships' | 'similar' | 'associate';

const KG_TAB_LABEL: Record<KgTabKey, string> = {
  overview: 'OVERVIEW',
  relationships: 'RELATIONSHIPS',
  similar: 'SIMILAR',
  associate: 'ASSOCIATE',
};

// Only NavalVessel/Contact nodes carry the physical/sensor parametrics
// kb/similarity.ts compares on, so only those types get a SIMILAR tab —
// same "the tab set depends on what the node actually has to show" rule
// oobSelectors.ts's oobTabKeys already applies to OOB object cards.
export function kgTabKeys(type: KgType): KgTabKey[] {
  const keys: KgTabKey[] = ['overview', 'relationships'];
  if (type === 'NavalVessel' || type === 'Contact') keys.push('similar');
  keys.push('associate');
  return keys;
}

export function kgTabNames(type: KgType): string[] {
  return kgTabKeys(type).map((k) => KG_TAB_LABEL[k]);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function oobUri(id: string): string {
  return `urn:meridian:oob:${id}`;
}
export function contextLayerUri(id: string): string {
  return `urn:meridian:contextlayer:${id}`;
}
export function targetListUri(id: string): string {
  return `urn:meridian:targetlist:${id}`;
}
export function targetUri(id: string): string {
  return `urn:meridian:target:${id}`;
}
export function radarUri(name: string): string {
  return `urn:meridian:radar:${slugify(name)}`;
}
export function weaponUri(name: string): string {
  return `urn:meridian:weapon:${slugify(name)}`;
}
export function geoFeatureUri(layerId: string, featureId: string | number): string {
  return `urn:meridian:geofeature:${layerId}:${featureId}`;
}

export interface KgNode {
  '@id': string;
  '@type': KgType;
  name: string;
  properties: Record<string, string | number | boolean | null | undefined>;
  partOf?: string[];
  hasRadar?: string[];
  hasWeapon?: string[];
  memberOfList?: string[];
  // A context layer's real, data-backed link to the specific OOB entities
  // its features depict — e.g. the Tenth Fleet layer's GeoJSON features
  // each carry an `oobId` (assets/tenthFleetLocations.ts); see
  // deriveGraph.ts for how that's turned into this edge. Deliberately NOT
  // populated by inference/guesswork (e.g. "this port is near that base")
  // for layers with no such declared per-feature link — see deriveGraph.ts
  // for which layers qualify and why the rest don't.
  relatedTo?: string[];
  // Generic, user-created URI-to-URI edges (KB↔KB, or KB↔any external URI —
  // e.g. a GeoServer WFS GetFeature URL for a specific context-layer
  // feature). The graph doesn't require the target to resolve to a KG node
  // for this to be a valid edge.
  associatedWith?: string[];
}

export interface KgDocument {
  '@context': Record<string, string>;
  '@graph': KgNode[];
}

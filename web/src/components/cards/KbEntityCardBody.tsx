import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { buildIncomingIndex, useKnowledgeGraph } from '../../kb/deriveGraph';
import type { IncomingEdge, IncomingRelation } from '../../kb/deriveGraph';
import { moreLikeThis } from '../../kb/similarity';
import { KG_TYPE_LABEL, kgTabKeys, kgTypeColor } from '../../kb/ontology';
import type { KgNode } from '../../kb/ontology';
import { EmptyNote, KV, KVGrid, LinkRow, SectionLabel } from './shared';

// Labels for the reverse direction of each edge — "what points at me", as
// opposed to the plain, already-existing outgoing labels below (PART OF,
// RADAR SYSTEMS, etc.). See kb/deriveGraph.ts's buildIncomingIndex for why
// this exists: without it, a RadarSystem/WeaponSystem/TargetList/root-org/
// depicted-context-layer node reads as relationship-less even though it's
// visibly connected in the graph view.
const INCOMING_LABEL: Record<IncomingRelation, string> = {
  partOf: 'MEMBERS',
  hasRadar: 'EQUIPPED ON',
  hasWeapon: 'EQUIPPED ON',
  memberOfList: 'CURRENT LIST MEMBERS',
  relatedTo: 'RELATED FEATURES',
};

function incomingUris(edges: IncomingEdge[], relations: IncomingRelation[]): string[] {
  return edges.filter((e) => relations.includes(e.relation)).map((e) => e.from);
}

// Overview KVGrid rows are driven generically off whatever's in a node's
// `properties` bag (kb/deriveGraph.ts) rather than a per-@type field list,
// so most keys can fall back to a plain .toUpperCase(); only the handful
// that read badly that way (a trailing unit letter fusing into the word
// above it) need a real label.
const PROPERTY_LABEL: Record<string, string> = {
  lengthM: 'LENGTH (M)',
  displacementT: 'DISPLACEMENT (T)',
  lat: 'LATITUDE',
  lng: 'LONGITUDE',
  rangeNm: 'RANGE (NM)',
  areaKm2: 'AREA (KM²)',
  isoTer: 'ISO TERRITORY CODE',
  maxVesselSize: 'MAX VESSEL SIZE',
  portSize: 'PORT SIZE',
};

function EdgeSection({ label, uris, byId, onClick }: { label: string; uris: string[] | undefined; byId: Map<string, KgNode>; onClick: (uri: string) => void }) {
  if (!uris || uris.length === 0) return null;
  return (
    <>
      <SectionLabel top={12}>{label}</SectionLabel>
      <div className="kb-entity-card-edge-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {uris.map((uri) => {
          const target = byId.get(uri);
          return (
            <LinkRow
              key={uri}
              affColor={target ? kgTypeColor(target['@type']) : 'var(--ink-faint)'}
              affShape={{}}
              idShort={target ? KG_TYPE_LABEL[target['@type']] : 'EXTERNAL'}
              name={target ? target.name : uri}
              onClick={target ? () => onClick(uri) : undefined}
            />
          );
        })}
      </div>
    </>
  );
}

export default function KbEntityCardBody({ uri, tab }: { uri: string; tab: number }) {
  const doc = useKnowledgeGraph();
  const selectKbEntity = useStore((s) => s.selectKbEntity);
  const associateEntities = useStore((s) => s.associateEntities);
  const dissociateEntities = useStore((s) => s.dissociateEntities);
  const [assocQuery, setAssocQuery] = useState('');
  const [rawUri, setRawUri] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const byId = useMemo(() => new Map(doc['@graph'].map((n) => [n['@id'], n] as const)), [doc]);
  const incomingIndex = useMemo(() => buildIncomingIndex(doc), [doc]);
  const node = byId.get(uri);
  if (!node) return null;
  const incoming = incomingIndex.get(uri) ?? [];

  const activeKey = kgTabKeys(node['@type'])[tab] ?? 'overview';

  if (activeKey === 'overview') {
    const entries = Object.entries(node.properties).filter(([, v]) => v != null && v !== '');
    return (
      <>
        <KVGrid>
          <KV label="TYPE" value={KG_TYPE_LABEL[node['@type']]} color={kgTypeColor(node['@type'])} />
          <KV label="URI" value={node['@id']} />
          {entries.map(([k, v]) => (
            <KV key={k} label={PROPERTY_LABEL[k] ?? k.toUpperCase()} value={String(v)} />
          ))}
        </KVGrid>
        <div className="kb-entity-card-raw-toggle" onClick={() => setShowRaw((s) => !s)} style={{ marginTop: 14, fontSize: 9, letterSpacing: '.1em', color: 'var(--ink-faint)', cursor: 'pointer' }}>
          ▸ {showRaw ? 'HIDE' : 'SHOW'} RAW JSON-LD
        </div>
        {showRaw && (
          <pre className="kb-entity-card-raw-jsonld" style={{ marginTop: 8, fontSize: 9, color: 'var(--ink-mute)', background: 'var(--panel-3)', border: '1px solid #1c2a28', padding: 9, overflowX: 'auto', maxHeight: 220 }}>
            {JSON.stringify({ '@context': doc['@context'], ...node }, null, 2)}
          </pre>
        )}
      </>
    );
  }

  if (activeKey === 'relationships') {
    const equippedOn = incomingUris(incoming, ['hasRadar', 'hasWeapon']);
    const members = incomingUris(incoming, ['partOf']);
    const currentListMembers = incomingUris(incoming, ['memberOfList']);
    const depictedBy = incomingUris(incoming, ['relatedTo']);
    const hasAny =
      node.partOf || node.hasRadar || node.hasWeapon || node.memberOfList || node.relatedTo || node.associatedWith || equippedOn.length || members.length || currentListMembers.length || depictedBy.length;
    return (
      <>
        <EdgeSection label="PART OF" uris={node.partOf} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label={INCOMING_LABEL.partOf} uris={members} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label="RADAR SYSTEMS" uris={node.hasRadar} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label="WEAPON SYSTEMS" uris={node.hasWeapon} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label={INCOMING_LABEL.hasRadar} uris={equippedOn} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label="MEMBER OF LIST" uris={node.memberOfList} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label={INCOMING_LABEL.memberOfList} uris={currentListMembers} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label="RELATED ENTITIES" uris={node.relatedTo} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label={INCOMING_LABEL.relatedTo} uris={depictedBy} byId={byId} onClick={selectKbEntity} />
        <EdgeSection label="ASSOCIATED WITH" uris={node.associatedWith} byId={byId} onClick={selectKbEntity} />
        {!hasAny && <EmptyNote>No relationships on file for this entity.</EmptyNote>}
      </>
    );
  }

  if (activeKey === 'similar') {
    const results = moreLikeThis(node, doc['@graph']);
    return (
      <>
        <SectionLabel>MORE LIKE THIS</SectionLabel>
        <div className="kb-entity-card-similar-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map((r) => (
            <div key={r.node['@id']} className="kb-entity-card-similar-row" onClick={() => selectKbEntity(r.node['@id'])} style={{ border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: 'pointer' }}>
              <div className="kb-entity-card-similar-row-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="kb-entity-card-similar-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
                  {r.node.name}
                </span>
                <span className="kb-entity-card-similar-score" style={{ fontSize: 10, color: 'var(--violet)', fontWeight: 700 }}>
                  {Math.round(r.score * 100)}%
                </span>
              </div>
              <div className="kb-entity-card-similar-reasons" style={{ fontSize: 9, color: 'var(--ink-mute2)', marginTop: 4, lineHeight: 1.5 }}>
                {r.reasons.join(' · ')}
              </div>
            </div>
          ))}
          {results.length === 0 && <EmptyNote>No comparable entities found — this entity carries too little parametric data to compare, or nothing else in the graph overlaps yet.</EmptyNote>}
        </div>
      </>
    );
  }

  // associate
  const candidates = doc['@graph'].filter((n) => n['@id'] !== uri && n.name.toLowerCase().includes(assocQuery.trim().toLowerCase())).slice(0, 20);
  return (
    <>
      <SectionLabel>ASSOCIATE WITH ANOTHER ENTITY</SectionLabel>
      <input
        className="kb-entity-card-associate-search"
        value={assocQuery}
        onChange={(e) => setAssocQuery(e.target.value)}
        placeholder="SEARCH KNOWLEDGE-BASE ENTITIES…"
        style={{ width: '100%', background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '5px 7px', fontFamily: 'var(--font-mono)' }}
      />
      {assocQuery.trim() && (
        <div className="kb-entity-card-associate-candidates" style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          {candidates.map((c) => (
            <div
              key={c['@id']}
              className="kb-entity-card-associate-candidate-row"
              onClick={() => associateEntities(uri, c['@id'])}
              style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '6px 8px', cursor: 'pointer' }}
            >
              <span className="kb-entity-card-associate-candidate-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: kgTypeColor(c['@type']), flexShrink: 0 }} />
              <span className="kb-entity-card-associate-candidate-name" style={{ fontSize: 10, color: 'var(--ink-bright)', flex: 1 }}>
                {c.name}
              </span>
              <span className="kb-entity-card-associate-candidate-type" style={{ fontSize: 8, color: 'var(--ink-faint)' }}>
                {KG_TYPE_LABEL[c['@type']]}
              </span>
            </div>
          ))}
          {candidates.length === 0 && <EmptyNote>No matches.</EmptyNote>}
        </div>
      )}

      <SectionLabel top={16}>ASSOCIATE WITH A URI</SectionLabel>
      <div className="kb-entity-card-associate-uri-row" style={{ display: 'flex', gap: 6 }}>
        <input
          className="kb-entity-card-associate-uri-input"
          value={rawUri}
          onChange={(e) => setRawUri(e.target.value)}
          placeholder="urn:… or a GeoServer WFS feature URL"
          style={{ flex: 1, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '5px 7px', fontFamily: 'var(--font-mono)' }}
        />
        <div
          className="kb-entity-card-associate-uri-button"
          onClick={() => {
            if (!rawUri.trim()) return;
            associateEntities(uri, rawUri.trim());
            setRawUri('');
          }}
          style={{ padding: '5px 10px', fontSize: 9, letterSpacing: '.1em', fontWeight: 600, color: 'var(--violet)', border: '1px solid var(--violet)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          LINK
        </div>
      </div>

      <SectionLabel top={16}>CURRENT ASSOCIATIONS</SectionLabel>
      <div className="kb-entity-card-associate-current-list" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(node.associatedWith ?? []).map((assocUri) => {
          const target = byId.get(assocUri);
          return (
            <div key={assocUri} className="kb-entity-card-associate-current-row" style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '6px 8px' }}>
              <span
                className="kb-entity-card-associate-current-name"
                style={{ fontSize: 10, color: target ? 'var(--ink-bright)' : 'var(--ink-mute2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {target ? target.name : assocUri}
              </span>
              <span className="kb-entity-card-associate-remove-button" onClick={() => dissociateEntities(uri, assocUri)} style={{ fontSize: 9, color: 'var(--red)', cursor: 'pointer' }}>
                ✕
              </span>
            </div>
          );
        })}
        {(!node.associatedWith || node.associatedWith.length === 0) && <EmptyNote>No manual associations yet.</EmptyNote>}
      </div>
    </>
  );
}

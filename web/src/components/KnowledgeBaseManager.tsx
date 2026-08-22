// Left-rail browse/search panel for the knowledge graph — structurally
// mirrors OobManager.tsx (header, filtered list, click-to-select), but over
// the derived JSON-LD graph (kb/deriveGraph.ts) instead of the raw OOB
// tree. Selecting a row drives both the KnowledgeGraphView canvas (center
// panel) and the entity's object card, same cross-navigation idiom
// selectOob already gives the OOB tree/map/card.
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useKnowledgeGraph } from '../kb/deriveGraph';
import { KG_TYPE_LABEL, kgTypeColor } from '../kb/ontology';
import type { KgType } from '../kb/ontology';

const FILTERS: { id: KgType | 'all'; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'NavalVessel', label: 'VESSELS' },
  { id: 'Contact', label: 'CONTACTS' },
  { id: 'Command', label: 'COMMANDS' },
  { id: 'ContextLayer', label: 'CONTEXT LAYERS' },
  { id: 'TargetList', label: 'TARGET LISTS' },
];

export default function KnowledgeBaseManager() {
  const doc = useKnowledgeGraph();
  const kbSelectedUri = useStore((s) => s.kbSelectedUri);
  const selectKbEntity = useStore((s) => s.selectKbEntity);
  const [filter, setFilter] = useState<KgType | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doc['@graph']
      .filter((n) => filter === 'all' || n['@type'] === filter)
      .filter((n) => !q || n.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [doc, filter, query]);

  return (
    <div className="kb-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="kb-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="kb-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--violet)', boxShadow: '0 0 8px var(--violet)' }} />
        <span className="kb-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--violet)', fontWeight: 600 }}>
          KNOWLEDGE · BASE
        </span>
      </div>

      <div className="kb-manager-search-row" style={{ padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
        <input
          className="kb-manager-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH ENTITIES…"
          style={{ width: '100%', background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '5px 7px', fontFamily: 'var(--font-mono)' }}
        />
      </div>

      <div className="kb-manager-filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <div
              key={f.id}
              className={`kb-manager-filter-chip kb-manager-filter-chip-${f.id}`}
              onClick={() => setFilter(f.id)}
              style={{
                fontSize: 8.5,
                letterSpacing: '.08em',
                padding: '3px 7px',
                border: `1px solid ${active ? 'var(--violet)' : 'var(--hairline-mid)'}`,
                color: active ? 'var(--violet)' : 'var(--ink-faint)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {f.label}
            </div>
          );
        })}
      </div>

      <div className="kb-manager-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
        {filtered.map((n) => {
          const isSelected = kbSelectedUri === n['@id'];
          return (
            <div
              key={n['@id']}
              className="kb-manager-row"
              onClick={() => selectKbEntity(n['@id'])}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(185,139,255,.08)' : 'transparent',
                borderLeft: `2px solid ${isSelected ? 'var(--violet)' : 'transparent'}`,
              }}
            >
              <span className="kb-manager-row-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: kgTypeColor(n['@type']), flexShrink: 0 }} />
              <span
                className="kb-manager-row-name"
                style={{ fontSize: 10, color: isSelected ? 'var(--ink-brighter)' : 'var(--ink-mute)', fontWeight: isSelected ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {n.name}
              </span>
              <span className="kb-manager-row-type" style={{ fontSize: 7.5, letterSpacing: '.06em', color: 'var(--ink-faint)', flexShrink: 0 }}>
                {KG_TYPE_LABEL[n['@type']]}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="kb-manager-empty-note" style={{ fontSize: 9.5, color: 'var(--ink-faint)', padding: '10px 12px' }}>
            No entities match this filter/search.
          </div>
        )}
      </div>

      <div className="kb-manager-footer" style={{ borderTop: '1px solid var(--hairline)', padding: '7px 12px', fontSize: 8.5, letterSpacing: '.06em', color: 'var(--ink-faint)' }}>
        {doc['@graph'].length} ENTITIES · JSON-LD GRAPH
      </div>
    </div>
  );
}

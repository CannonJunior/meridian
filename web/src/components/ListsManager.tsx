import { useState } from 'react';
import { useStore } from '../store';
import { TARGET_LISTS } from '../assets/targetLists';
import type { TargetListDef } from '../assets/targetLists';

function ListRow({ list, active, onSelect }: { list: TargetListDef; active: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="lists-manager-row"
      style={{ border: `1px solid ${active ? list.accent : 'var(--hairline-mid)'}`, background: active ? 'rgba(255,255,255,.03)' : 'var(--panel-3)' }}
    >
      <div className="lists-manager-row-header" onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', cursor: 'pointer' }}>
        <span
          className="lists-manager-row-radio"
          style={{
            width: 13,
            height: 13,
            borderRadius: '50%',
            border: `1.5px solid ${active ? list.accent : 'var(--ink-faint)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {active && <span className="lists-manager-row-radio-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: list.accent }} />}
        </span>
        <span className="lists-manager-row-acronym" style={{ fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: list.accent, flexShrink: 0 }}>
          {list.acronym}
        </span>
        <span className="lists-manager-row-name" style={{ fontSize: 9.5, color: active ? 'var(--ink-bright)' : 'var(--ink-mute)', lineHeight: 1.3 }}>
          {list.name}
        </span>
        <span className="lists-manager-row-spacer" style={{ flex: 1 }} />
        <span
          className="lists-manager-row-expand-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          title={expanded ? 'Collapse' : 'Expand'}
          style={{ fontSize: 9, color: 'var(--ink-faint)', padding: '2px 4px', cursor: 'pointer', flexShrink: 0 }}
        >
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      <div className="lists-manager-row-description" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', lineHeight: 1.4, padding: '0 9px 9px 30px' }}>
        {list.description}
      </div>

      {expanded && (
        <div className="lists-manager-row-detail" style={{ fontSize: 9, color: 'var(--ink-dim2)', lineHeight: 1.55, padding: '0 9px 10px 30px', borderTop: '1px solid var(--hairline)', marginTop: -1 }}>
          <div className="lists-manager-row-detail-label" style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--ink-faint)', margin: '8px 0 4px' }}>
            COMPOSITION &amp; PROCESS
          </div>
          {list.detail}
        </div>
      )}
    </div>
  );
}

export default function ListsManager() {
  const activeListId = useStore((s) => s.activeListId);
  const setActiveListId = useStore((s) => s.setActiveListId);

  return (
    <div className="lists-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="lists-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="lists-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--yellow)', boxShadow: '0 0 8px var(--yellow)' }} />
        <span className="lists-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--yellow)', fontWeight: 600 }}>
          TARGET · LISTS
        </span>
      </div>

      <div className="lists-manager-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="lists-manager-intro" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
          JOINT TARGETING CYCLE LISTS — select one to load it into the collection-table below.
        </div>

        {TARGET_LISTS.map((list) => (
          <ListRow key={list.id} list={list} active={activeListId === list.id} onSelect={() => setActiveListId(list.id)} />
        ))}
      </div>
    </div>
  );
}

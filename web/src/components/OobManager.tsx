import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { OOB_TREE } from '../assets/oob';
import type { OobNode } from '../assets/oob';
import { ancestorIds, findOobNode, statusMeta } from '../oobSelectors';

const KIND_LABEL: Record<OobNode['kind'], string> = {
  country: 'NATION',
  branch: 'BRANCH',
  fleet: 'FLEET',
  command: 'TASK FORCE',
  group: 'GROUP',
  squadron: 'SQUADRON',
  base: 'BASE',
  ship: 'SHIP',
  unit: 'UNIT',
};

function rootAccent(rootId: string): string {
  return rootId === 'ru' ? 'var(--red)' : rootId === 'us' ? 'var(--cyan)' : 'var(--amber)';
}

function OobRow({
  node,
  depth,
  accent,
  expanded,
  toggle,
  selectedId,
  onSelect,
}: {
  node: OobNode;
  depth: number;
  accent: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (n: OobNode) => void;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isCountry = node.kind === 'country';
  const isObject = node.entityType === 'object';
  const meta = isObject ? statusMeta(node.status) : null;

  return (
    <div className="oob-row-wrap">
      <div
        className="oob-row"
        onClick={() => {
          if (hasChildren) toggle(node.id);
          onSelect(node);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px 5px 0',
          paddingLeft: 8 + depth * 14,
          cursor: 'pointer',
          background: isSelected ? 'rgba(63,210,230,.08)' : 'transparent',
          borderLeft: `2px solid ${isSelected ? accent : 'transparent'}`,
        }}
      >
        <span className="oob-row-chevron" style={{ width: 9, textAlign: 'center', fontSize: 8.5, color: 'var(--ink-faint)', flexShrink: 0 }}>
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className="oob-row-dot" style={{ width: 6, height: 6, borderRadius: node.kind === 'ship' ? '50%' : 1, background: isObject ? meta!.color : accent, opacity: isObject ? meta!.opacity : hasChildren ? 1 : 0.5, flexShrink: 0 }} />
        <span
          className="oob-row-name"
          style={{
            fontSize: isCountry ? 11.5 : 10,
            fontWeight: isCountry || node.kind === 'fleet' ? 700 : 500,
            fontFamily: isCountry ? 'var(--font-display)' : 'var(--font-mono)',
            letterSpacing: isCountry ? '.08em' : undefined,
            color: isSelected ? 'var(--ink-brighter)' : node.kind === 'country' ? 'var(--ink-bright)' : 'var(--ink-mute)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {node.name}
        </span>
        {isObject && node.status !== 'VISIBLE' && (
          <span className="oob-row-status-label" style={{ fontSize: 7.5, letterSpacing: '.08em', color: meta!.color, flexShrink: 0 }}>
            {meta!.label}
          </span>
        )}
      </div>
      {hasChildren && isOpen && node.children!.map((c) => <OobRow key={c.id} node={c} depth={depth + 1} accent={accent} expanded={expanded} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />)}
    </div>
  );
}

export default function OobManager() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const oobSelectedId = useStore((s) => s.oobSelectedId);
  const selectOob = useStore((s) => s.selectOob);
  const selected = oobSelectedId ? findOobNode(oobSelectedId) : null;

  useEffect(() => {
    if (!oobSelectedId) return;
    const ancestors = ancestorIds(oobSelectedId);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [oobSelectedId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedMeta = selected?.entityType === 'object' ? statusMeta(selected.status) : null;

  return (
    <div className="oob-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="oob-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="oob-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--blue)', boxShadow: '0 0 8px var(--blue)' }} />
        <span className="oob-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--blue)', fontWeight: 600 }}>
          ORDER · OF BATTLE
        </span>
      </div>

      <div className="oob-manager-tree" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {OOB_TREE.map((root) => (
          <OobRow key={root.id} node={root} depth={0} accent={rootAccent(root.id)} expanded={expanded} toggle={toggle} selectedId={oobSelectedId} onSelect={(n) => selectOob(n.id)} />
        ))}
      </div>

      {selected && (
        <div className="oob-manager-detail" style={{ borderTop: '1px solid var(--hairline)', padding: '9px 12px', background: 'var(--panel-3)' }}>
          <div className="oob-manager-detail-kind" style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)' }}>
            {KIND_LABEL[selected.kind]}
          </div>
          <div className="oob-manager-detail-name" style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-bright)', marginTop: 3 }}>
            {selected.name}
          </div>
          {selected.role && (
            <div className="oob-manager-detail-role" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 4 }}>
              {selected.role}
            </div>
          )}
          {selectedMeta && (
            <div className="oob-manager-detail-status-row" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span className="oob-manager-detail-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: selectedMeta.color, boxShadow: `0 0 6px ${selectedMeta.color}` }} />
              <span className="oob-manager-detail-status-label" style={{ fontSize: 9, letterSpacing: '.1em', color: selectedMeta.color, fontWeight: 600 }}>
                {selectedMeta.label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

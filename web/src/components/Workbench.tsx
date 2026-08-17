import { useRef } from 'react';
import { useStore } from '../store';
import { affColor, affShapeStyle, C, effName, STAGES, threatColor } from '../selectors';
import type { Target } from '../types';

export default function Workbench() {
  const targets = useStore((s) => s.targets);
  const effectors = useStore((s) => s.effectors);
  const selectedId = useStore((s) => s.selectedId);
  const selectTarget = useStore((s) => s.selectTarget);
  const openCard = useStore((s) => s.openCard);
  const setStage = useStore((s) => s.setStage);
  const dragId = useRef<string | null>(null);

  return (
    <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0, overflow: 'hidden' }}>
      {STAGES.map((stage, idx) => {
        const cards = targets.filter((t) => t.stage === idx);
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId.current) setStage(dragId.current, idx);
            }}
            style={{ flex: 1, minWidth: 0, borderRight: '1px solid #131e1d', display: 'flex', flexDirection: 'column', minHeight: 0, background: idx === 3 ? 'rgba(255,90,71,.025)' : 'transparent' }}
          >
            <div style={{ padding: '8px 9px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 4, height: 13, background: stage.color }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', fontWeight: 600, color: stage.color }}>
                {stage.name} · {stage.key}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 9, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{cards.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 7px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cards.map((t) => (
                <BoardCard key={t.id} t={t} selected={t.id === selectedId} effLabel={t.effector ? `▣ ${effName(effectors, t.effector)}` : 'unpaired'} onDragStart={() => (dragId.current = t.id)} onSelect={() => selectTarget(t.id)} onOpen={() => openCard(t.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ t, selected, effLabel, onDragStart, onSelect, onOpen }: { t: Target; selected: boolean; effLabel: string; onDragStart: () => void; onSelect: () => void; onOpen: () => void }) {
  const cardBorder = selected ? C.amber : 'var(--hairline-subtle)';
  const cardBg = selected ? 'rgba(255,171,56,.06)' : 'var(--panel-3)';
  const threatBorder = threatColor(t.threat);
  const priLabel = t.pri ? `#${t.pri}` : '—';
  const priColor = t.pri && t.pri <= 3 ? C.amber : '#7a8d8a';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      onDoubleClick={onOpen}
      style={{ border: `1px solid ${cardBorder}`, background: cardBg, padding: 8, cursor: 'grab', position: 'relative' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 9, height: 9, background: '#0c1416', border: `1.5px solid ${affColor(t.aff)}`, flexShrink: 0, ...affShapeStyle(t.aff) }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink-bright)', letterSpacing: '.04em' }}>
          {t.id.slice(1)} {t.name}
        </span>
        <span style={{ flex: 1 }} />
        {t.threat && (
          <span style={{ fontSize: 8, letterSpacing: '.08em', color: threatBorder, border: `1px solid ${threatBorder}`, padding: '1px 4px' }}>{t.threat}</span>
        )}
      </div>
      <div style={{ fontSize: 9, color: 'var(--ink-dim2)', marginTop: 5 }}>{t.type}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 8.5, color: priColor, fontWeight: 600 }}>HPTL {priLabel}</span>
        <span style={{ fontSize: 8.5, color: t.effector ? C.amber : '#5d6f6c' }}>{effLabel}</span>
      </div>
    </div>
  );
}

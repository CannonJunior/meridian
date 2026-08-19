import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { Manager } from '../store';

function ContextIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-context" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path className="icon-sidebar-context-glyph-top" d="M10 2L18 6.5L10 11L2 6.5L10 2Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path className="icon-sidebar-context-glyph-mid" d="M2 10L10 14.5L18 10" stroke={color} strokeWidth="1.4" strokeLinejoin="round" opacity="0.7" />
      <path className="icon-sidebar-context-glyph-bottom" d="M2 13.5L10 18L18 13.5" stroke={color} strokeWidth="1.4" strokeLinejoin="round" opacity="0.45" />
    </svg>
  );
}

function IsrIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-isr" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle className="icon-sidebar-isr-glyph-dot" cx="10" cy="10" r="2" fill={color} />
      <circle className="icon-sidebar-isr-glyph-ring-inner" cx="10" cy="10" r="5.5" stroke={color} strokeWidth="1.4" strokeDasharray="2.5 3" />
      <circle className="icon-sidebar-isr-glyph-ring-outer" cx="10" cy="10" r="9" stroke={color} strokeWidth="1.2" opacity="0.55" />
    </svg>
  );
}

function OobIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-oob" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect className="icon-sidebar-oob-glyph-top" x="7" y="2" width="6" height="5" stroke={color} strokeWidth="1.4" />
      <path className="icon-sidebar-oob-glyph-connector" d="M10 7V10M10 10H4M10 10H16M4 10V12M16 10V12" stroke={color} strokeWidth="1.3" />
      <rect className="icon-sidebar-oob-glyph-left" x="1" y="12" width="6" height="5" stroke={color} strokeWidth="1.4" />
      <rect className="icon-sidebar-oob-glyph-right" x="13" y="12" width="6" height="5" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function ListsIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-lists" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle className="icon-sidebar-lists-glyph-dot-1" cx="3" cy="4.5" r="1.3" fill={color} />
      <line className="icon-sidebar-lists-glyph-line-1" x1="7" y1="4.5" x2="18" y2="4.5" stroke={color} strokeWidth="1.4" />
      <circle className="icon-sidebar-lists-glyph-dot-2" cx="3" cy="10" r="1.3" fill={color} opacity="0.75" />
      <line className="icon-sidebar-lists-glyph-line-2" x1="7" y1="10" x2="18" y2="10" stroke={color} strokeWidth="1.4" opacity="0.75" />
      <circle className="icon-sidebar-lists-glyph-dot-3" cx="3" cy="15.5" r="1.3" fill={color} opacity="0.5" />
      <line className="icon-sidebar-lists-glyph-line-3" x1="7" y1="15.5" x2="14" y2="15.5" stroke={color} strokeWidth="1.4" opacity="0.5" />
    </svg>
  );
}

function StyleIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-style" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect className="icon-sidebar-style-glyph-swatch-tl" x="2" y="2" width="7" height="7" fill={color} opacity="0.9" />
      <rect className="icon-sidebar-style-glyph-swatch-tr" x="11" y="2" width="7" height="7" stroke={color} strokeWidth="1.4" />
      <rect className="icon-sidebar-style-glyph-swatch-bl" x="2" y="11" width="7" height="7" stroke={color} strokeWidth="1.4" />
      <rect className="icon-sidebar-style-glyph-swatch-br" x="11" y="11" width="7" height="7" fill={color} opacity="0.5" />
    </svg>
  );
}

const MANAGERS: { id: Manager; label: string; accent: string; icon: (c: string) => ReactNode }[] = [
  { id: 'context', label: 'CONTEXT LAYERS', accent: 'var(--green)', icon: (c) => <ContextIcon color={c} /> },
  { id: 'isr', label: 'ISR COLLECTION', accent: 'var(--cyan)', icon: (c) => <IsrIcon color={c} /> },
  { id: 'oob', label: 'ORDER OF BATTLE', accent: 'var(--blue)', icon: (c) => <OobIcon color={c} /> },
  { id: 'lists', label: 'TARGET LISTS', accent: 'var(--yellow)', icon: (c) => <ListsIcon color={c} /> },
  { id: 'style', label: 'STYLE MANAGER', accent: 'var(--amber)', icon: (c) => <StyleIcon color={c} /> },
];

export default function IconSidebar() {
  const activeManager = useStore((s) => s.activeManager);
  const setActiveManager = useStore((s) => s.setActiveManager);

  return (
    <div className="icon-sidebar" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 0', minHeight: 0 }}>
      {MANAGERS.map((m) => {
        const active = activeManager === m.id;
        return (
          <div
            key={m.id}
            className={`icon-sidebar-button icon-sidebar-button-${m.id}`}
            onClick={() => setActiveManager(m.id)}
            title={m.label}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: active ? 'rgba(63,210,230,.08)' : 'transparent',
              borderLeft: `2px solid ${active ? m.accent : 'transparent'}`,
              flexShrink: 0,
            }}
          >
            {m.icon(active ? m.accent : 'var(--ink-faint)')}
          </div>
        );
      })}
    </div>
  );
}

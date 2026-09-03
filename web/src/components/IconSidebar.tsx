import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { Manager } from '../store';
import { ClickableDiv } from './Clickable';

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

function KbIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-kb" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle className="icon-sidebar-kb-glyph-node-center" cx="10" cy="10" r="1.8" fill={color} />
      <circle className="icon-sidebar-kb-glyph-node-tl" cx="3.5" cy="4" r="1.6" stroke={color} strokeWidth="1.3" />
      <circle className="icon-sidebar-kb-glyph-node-tr" cx="16.5" cy="4" r="1.6" stroke={color} strokeWidth="1.3" opacity="0.8" />
      <circle className="icon-sidebar-kb-glyph-node-bl" cx="3.5" cy="16" r="1.6" stroke={color} strokeWidth="1.3" opacity="0.6" />
      <circle className="icon-sidebar-kb-glyph-node-br" cx="16.5" cy="16" r="1.6" stroke={color} strokeWidth="1.3" opacity="0.45" />
      <line className="icon-sidebar-kb-glyph-edge-tl" x1="10" y1="10" x2="4.6" y2="5.1" stroke={color} strokeWidth="1.1" />
      <line className="icon-sidebar-kb-glyph-edge-tr" x1="10" y1="10" x2="15.4" y2="5.1" stroke={color} strokeWidth="1.1" opacity="0.8" />
      <line className="icon-sidebar-kb-glyph-edge-bl" x1="10" y1="10" x2="4.6" y2="14.9" stroke={color} strokeWidth="1.1" opacity="0.6" />
      <line className="icon-sidebar-kb-glyph-edge-br" x1="10" y1="10" x2="15.4" y2="14.9" stroke={color} strokeWidth="1.1" opacity="0.45" />
    </svg>
  );
}

function ChatIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-chat" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path className="icon-sidebar-chat-glyph-bubble" d="M2 4.5C2 3.67 2.67 3 3.5 3H16.5C17.33 3 18 3.67 18 4.5V12C18 12.83 17.33 13.5 16.5 13.5H8L4.5 16.5V13.5H3.5C2.67 13.5 2 12.83 2 12V4.5Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <line className="icon-sidebar-chat-glyph-dot-1" x1="6" y1="8.25" x2="6.01" y2="8.25" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line className="icon-sidebar-chat-glyph-dot-2" x1="10" y1="8.25" x2="10.01" y2="8.25" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line className="icon-sidebar-chat-glyph-dot-3" x1="14" y1="8.25" x2="14.01" y2="8.25" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LayersIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-layers" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path className="icon-sidebar-layers-glyph-top" d="M10 2L18 6.5L10 11L2 6.5L10 2Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path className="icon-sidebar-layers-glyph-mid" d="M2 10L10 14.5L18 10" stroke={color} strokeWidth="1.4" strokeLinejoin="round" opacity="0.75" />
      <path className="icon-sidebar-layers-glyph-bottom" d="M2 13.5L10 18L18 13.5" stroke={color} strokeWidth="1.4" strokeLinejoin="round" opacity="0.5" />
      <path className="icon-sidebar-layers-glyph-check" d="M7.3 6.6L9.2 8.5L12.9 4.8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-notifications" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        className="icon-sidebar-notifications-glyph-bell"
        d="M10 3C7.5 3 6 4.8 6 7.2V9.5C6 10.6 5.6 11.6 5 12.4C4.6 12.9 4.9 13.6 5.5 13.6H14.5C15.1 13.6 15.4 12.9 15 12.4C14.4 11.6 14 10.6 14 9.5V7.2C14 4.8 12.5 3 10 3Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path className="icon-sidebar-notifications-glyph-clapper" d="M8.3 15.5C8.6 16.2 9.3 16.7 10 16.7C10.7 16.7 11.4 16.2 11.7 15.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function AtoIcon({ color }: { color: string }) {
  return (
    <svg className="icon-sidebar-glyph icon-sidebar-glyph-ato" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line className="icon-sidebar-ato-glyph-baseline" x1="2" y1="15" x2="18" y2="15" stroke={color} strokeWidth="1.3" />
      <line className="icon-sidebar-ato-glyph-tick-1" x1="6" y1="12.5" x2="6" y2="15" stroke={color} strokeWidth="1.2" opacity="0.6" />
      <line className="icon-sidebar-ato-glyph-tick-2" x1="14" y1="12.5" x2="14" y2="15" stroke={color} strokeWidth="1.2" opacity="0.6" />
      <path className="icon-sidebar-ato-glyph-plane" d="M10 3L13.5 10.5L10 9L6.5 10.5L10 3Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <line className="icon-sidebar-ato-glyph-now" x1="10" y1="10.5" x2="10" y2="15" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

const MANAGERS: { id: Manager; label: string; accent: string; icon: (c: string) => ReactNode }[] = [
  { id: 'context', label: 'CONTEXT LAYERS', accent: 'var(--green)', icon: (c) => <ContextIcon color={c} /> },
  { id: 'isr', label: 'ISR COLLECTION', accent: 'var(--cyan)', icon: (c) => <IsrIcon color={c} /> },
  { id: 'ato', label: 'AIR TASKING', accent: 'var(--amber)', icon: (c) => <AtoIcon color={c} /> },
  { id: 'layers', label: 'LAYER MANAGER', accent: 'var(--green-alt)', icon: (c) => <LayersIcon color={c} /> },
  { id: 'oob', label: 'ORDER OF BATTLE', accent: 'var(--blue)', icon: (c) => <OobIcon color={c} /> },
  { id: 'kb', label: 'KNOWLEDGE BASE', accent: 'var(--violet)', icon: (c) => <KbIcon color={c} /> },
  { id: 'lists', label: 'TARGET LISTS', accent: 'var(--yellow)', icon: (c) => <ListsIcon color={c} /> },
  { id: 'chat', label: 'BOARD COMMS', accent: 'var(--red)', icon: (c) => <ChatIcon color={c} /> },
  { id: 'style', label: 'STYLE MANAGER', accent: 'var(--amber)', icon: (c) => <StyleIcon color={c} /> },
  { id: 'notifications', label: 'NOTIFICATIONS', accent: 'var(--red-crit)', icon: (c) => <BellIcon color={c} /> },
];

export default function IconSidebar() {
  const activeManager = useStore((s) => s.activeManager);
  const setActiveManager = useStore((s) => s.setActiveManager);
  const unreadNotificationCount = useStore((s) => s.unreadNotificationCount);

  return (
    <div className="icon-sidebar" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 0', minHeight: 0 }}>
      {MANAGERS.map((m) => {
        const active = activeManager === m.id;
        const unread = m.id === 'notifications' ? unreadNotificationCount : 0;
        return (
          <ClickableDiv
            key={m.id}
            className={`icon-sidebar-button icon-sidebar-button-${m.id}`}
            onClick={() => setActiveManager(m.id)}
            title={unread > 0 ? `${m.label} — ${unread} unread` : m.label}
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
              position: 'relative',
            }}
          >
            {m.icon(active ? m.accent : 'var(--ink-faint)')}
            {unread > 0 && (
              <span
                className="icon-sidebar-notifications-badge"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                  borderRadius: 7,
                  background: 'var(--red-crit)',
                  color: '#06090a',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8.5,
                  fontWeight: 700,
                  lineHeight: '14px',
                  textAlign: 'center',
                }}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </ClickableDiv>
        );
      })}
    </div>
  );
}

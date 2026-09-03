import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { TUTORIAL_CATEGORIES, TUTORIALS } from '../assets/tutorials';
import { ClickableDiv } from './Clickable';

// The "Joint Targeting Field Guide" — the doctrine reference this app's own
// domain logic cites by chapter (e.g. assets/staff.ts's header, "see the
// Joint Targeting Field Guide (chapters 1-2)"). Lives outside this repo as
// a published Claude artifact, not a bundled asset — an external,
// unversioned dependency: if that artifact is ever deleted or made
// private, this link breaks with no build-time warning.
const FIELD_GUIDE_URL = 'https://claude.ai/code/artifact/683e9557-56e2-4b29-99c1-87df05022854';

function BarsIcon({ color }: { color: string }) {
  return (
    <svg className="command-bar-menu-glyph" width="14" height="14" viewBox="0 0 20 20" fill="none">
      <line className="command-bar-menu-glyph-bar-top" x1="2" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line className="command-bar-menu-glyph-bar-mid" x1="2" y1="10" x2="18" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line className="command-bar-menu-glyph-bar-bottom" x1="2" y1="15" x2="18" y2="15" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function CommandBarMenu() {
  const [open, setOpen] = useState(false);
  const [tutorialsExpanded, setTutorialsExpanded] = useState(false);
  const startTutorial = useStore((s) => s.startTutorial);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTutorialsExpanded(false);
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, []);

  return (
    <div className="command-bar-menu" ref={rootRef} style={{ position: 'relative', marginLeft: 10, flexShrink: 0 }}>
      <ClickableDiv
        className="command-bar-menu-button"
        onClick={() => setOpen((v) => !v)}
        title="Menu"
        style={{
          width: 26,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${open ? 'var(--amber)' : 'var(--hairline-mid)'}`,
          cursor: 'pointer',
          background: open ? 'rgba(255,171,56,.1)' : 'transparent',
        }}
      >
        <BarsIcon color={open ? 'var(--amber)' : 'var(--ink-mute)'} />
      </ClickableDiv>

      {open && (
        <div className="command-bar-menu-dropdown" style={{ position: 'absolute', top: 32, right: 0, width: 264, background: 'var(--panel-2)', border: '1px solid var(--hairline-mid)', boxShadow: '0 16px 40px rgba(0,0,0,.5)', zIndex: 60 }}>
          <a
            className="command-bar-menu-item command-bar-menu-item-field-guide"
            href={FIELD_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '9px 12px',
              fontSize: 10.5,
              letterSpacing: '.04em',
              color: 'var(--ink-bright)',
              textDecoration: 'none',
              cursor: 'pointer',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            ▸ JOINT TARGETING FIELD GUIDE
          </a>

          <ClickableDiv
            className="command-bar-menu-item command-bar-menu-item-tutorials"
            onClick={() => setTutorialsExpanded((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '9px 12px',
              fontSize: 10.5,
              letterSpacing: '.04em',
              color: 'var(--ink-bright)',
              cursor: 'pointer',
              borderBottom: tutorialsExpanded ? 'none' : '1px solid var(--hairline)',
            }}
          >
            <span className="command-bar-menu-item-tutorials-label" style={{ flex: 1 }}>
              ▸ TUTORIALS
            </span>
            <span className="command-bar-menu-item-tutorials-caret" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
              {tutorialsExpanded ? '▾' : '▸'}
            </span>
          </ClickableDiv>
          {tutorialsExpanded && (
            // Grouped by category (Tutorial.category) rather than one flat
            // list, with a max-height + scroll of its own — at 5 tutorials
            // this never mattered; doubling to 10 with the ATO set would
            // have run this dropdown off the bottom of a shorter viewport
            // with no way to reach the rest (the "Tutorial Flight Plan"
            // brief's RT-T3 finding). TUTORIALS_BY_CATEGORY preserves each
            // category's own array order within itself.
            <div className="command-bar-menu-tutorials-list" style={{ borderBottom: '1px solid var(--hairline)', maxHeight: 260, overflowY: 'auto', overflowX: 'hidden' }}>
              {TUTORIAL_CATEGORIES.map((category) => {
                const inCategory = TUTORIALS.filter((tu) => tu.category === category);
                if (inCategory.length === 0) return null;
                return (
                  <div key={category} className="command-bar-menu-tutorial-category">
                    <div
                      className="command-bar-menu-tutorial-category-label"
                      style={{ padding: '6px 12px 4px 22px', fontSize: 8, letterSpacing: '.12em', color: 'var(--ink-faint)', borderTop: '1px solid #0e1716' }}
                    >
                      {category.toUpperCase()}
                    </div>
                    {inCategory.map((tu) => (
                      <ClickableDiv
                        key={tu.id}
                        className="command-bar-menu-tutorial-row"
                        onClick={() => {
                          startTutorial(tu.id);
                          setOpen(false);
                          setTutorialsExpanded(false);
                        }}
                        title={tu.description}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 22px', fontSize: 9.5, color: 'var(--ink-mute)', cursor: 'pointer' }}
                      >
                        <span className="command-bar-menu-tutorial-row-name" style={{ flex: 1 }}>
                          {tu.name}
                        </span>
                        {tu.recommended && (
                          <span
                            className="command-bar-menu-tutorial-row-start-here"
                            style={{ fontSize: 7.5, letterSpacing: '.08em', padding: '1px 5px', border: '1px solid var(--amber)', color: 'var(--amber)', fontWeight: 700, flexShrink: 0 }}
                          >
                            START HERE
                          </span>
                        )}
                      </ClickableDiv>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useStore } from '../store';
import type { OobStyle } from '../store';
import { STYLE_PALETTE } from '../assets/palette';

const OOB_ATTRIBUTES: { key: keyof OobStyle; label: string; description: string }[] = [
  { key: 'radarColor', label: 'RADAR / SENSOR RANGE', description: 'Detection-range figures on the object card and the range rings drawn around a selected object on the map.' },
  { key: 'weaponColor', label: 'WEAPON SYSTEM RANGE', description: 'Engagement-range figures on the object card and the range rings drawn around a selected object on the map.' },
];

export default function StyleManager() {
  const oobStyle = useStore((s) => s.oobStyle);
  const setOobStyleColor = useStore((s) => s.setOobStyleColor);

  return (
    <div className="style-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="style-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="style-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />
        <span className="style-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>
          STYLE · MANAGER
        </span>
      </div>

      <div className="style-manager-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="style-manager-intro" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
          DISPLAY COLOR OVERRIDES — customize how order-of-battle object attributes render on the object card and the map.
        </div>

        <div className="style-manager-section">
          <div className="style-manager-section-label" style={{ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--ink-mute)', fontWeight: 600, padding: '0 2px', marginBottom: 8 }}>
            ORDER OF BATTLE OBJECTS
          </div>
          <div className="style-manager-attribute-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OOB_ATTRIBUTES.map((attr) => {
              const current = oobStyle[attr.key];
              return (
                <div key={attr.key} className="style-manager-attribute-row" style={{ border: '1px solid var(--hairline-mid)', background: 'var(--panel-3)', padding: '8px 9px' }}>
                  <div className="style-manager-attribute-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="style-manager-attribute-swatch" style={{ width: 12, height: 12, borderRadius: '50%', background: current, boxShadow: `0 0 6px ${current}`, flexShrink: 0 }} />
                    <span className="style-manager-attribute-name" style={{ fontFamily: 'var(--font-display)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-bright)' }}>
                      {attr.label}
                    </span>
                  </div>
                  <div className="style-manager-attribute-description" style={{ fontSize: 9, color: 'var(--ink-mute2)', marginTop: 6, lineHeight: 1.4 }}>
                    {attr.description}
                  </div>
                  <div className="style-manager-swatch-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {STYLE_PALETTE.map((c) => {
                      const selected = c.hex.toLowerCase() === current.toLowerCase();
                      return (
                        <div
                          key={c.id}
                          className="style-manager-swatch-button"
                          onClick={() => setOobStyleColor(attr.key, c.hex)}
                          title={c.label}
                          style={{
                            width: 22,
                            height: 22,
                            background: c.hex,
                            cursor: 'pointer',
                            border: selected ? '2px solid var(--ink-brighter)' : '1px solid rgba(0,0,0,.4)',
                            boxShadow: selected ? `0 0 6px ${c.hex}` : 'none',
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

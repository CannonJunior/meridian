import { useStore } from '../store';
import { CONTEXT_LAYERS } from '../assets/contextLayers';

export default function ContextLayerManager() {
  const visibility = useStore((s) => s.contextLayerVisibility);
  const toggleContextLayer = useStore((s) => s.toggleContextLayer);

  return (
    <div className="context-layer-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="context-layer-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="context-layer-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
        <span className="context-layer-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--green)', fontWeight: 600 }}>
          CONTEXT · LAYERS
        </span>
      </div>

      <div className="context-layer-manager-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="context-layer-manager-intro" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
          REFERENCE &amp; LIVE OVERLAYS — GeoServer WFS vector data, small bundled datasets, and externally-hosted live feeds.
        </div>

        {CONTEXT_LAYERS.map((layer) => {
          const on = !!visibility[layer.id];
          return (
            <div
              key={layer.id}
              className="context-layer-row"
              onClick={() => toggleContextLayer(layer.id)}
              style={{ border: `1px solid ${on ? '#1f4a44' : 'var(--hairline-mid)'}`, background: on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)', padding: '8px 9px', cursor: 'pointer' }}
            >
              <div className="context-layer-row-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="context-layer-row-checkbox"
                  style={{
                    width: 13,
                    height: 13,
                    border: `1.5px solid ${on ? 'var(--green)' : 'var(--ink-faint)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    color: 'var(--green)',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="context-layer-row-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', color: on ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
                  {layer.name}
                </span>
                <span className="context-layer-row-spacer" style={{ flex: 1 }} />
                <span className="context-layer-row-source-badge" style={{ fontSize: 8, letterSpacing: '.1em', color: layer.sourceType === 'live-raster' ? 'var(--amber)' : 'var(--ink-faint)' }}>
                  {layer.sourceType === 'wfs' ? 'WFS' : layer.sourceType === 'static' ? 'STATIC' : 'LIVE'}
                </span>
              </div>
              <div className="context-layer-row-description" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 6, lineHeight: 1.4 }}>
                {layer.description}
              </div>
              <div className="context-layer-row-attribution" style={{ fontSize: 8.5, color: 'var(--ink-faint2)', marginTop: 5 }}>
                SOURCE · {layer.attribution}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

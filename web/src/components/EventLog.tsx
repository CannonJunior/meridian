import { useStore } from '../store';
import { fmtLogTime } from '../selectors';
import RightRailResizeHandle from './RightRailResizeHandle';

const TAG_COLORS: Record<string, string> = {
  det: 'var(--cyan)',
  trk: '#9fb2ae',
  pair: 'var(--amber)',
  fire: 'var(--red)',
  bda: 'var(--green)',
  warn: 'var(--yellow)',
  sys: 'var(--ink-dim2)',
};

export default function EventLog() {
  const log = useStore((s) => s.log);

  return (
    <div className="event-log" style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <RightRailResizeHandle />
      <div className="event-log-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-2)' }}>
        <span className="event-log-header-accent" style={{ width: 5, height: 13, background: 'var(--cyan)' }} />
        <span className="event-log-title" style={{ fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.2em', color: 'var(--cyan)', fontWeight: 600 }}>
          FIRES · EVENT LOG
        </span>
        <span className="event-log-spacer" style={{ flex: 1 }} />
        <span className="event-log-live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'twbblink 1.4s infinite' }} />
        <span className="event-log-live-label" style={{ fontSize: 9, color: 'var(--ink-dim2)', letterSpacing: '.08em' }}>
          LIVE
        </span>
      </div>
      <div className="event-log-rows" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
        {log.map((l, i) => {
          const tagColor = TAG_COLORS[l.tag2] || 'var(--ink-dim)';
          const textColor = l.tag2 === 'fire' || l.tag2 === 'warn' ? 'var(--ink)' : 'var(--ink-mute)';
          return (
            <div key={`${l.t}-${i}`} className="event-log-row" style={{ display: 'flex', gap: 9, padding: '4px 12px', alignItems: 'baseline' }}>
              <span className="event-log-row-time" style={{ fontSize: 9, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {fmtLogTime(l.t)}
              </span>
              <span className="event-log-row-tag" style={{ fontSize: 8, letterSpacing: '.06em', color: tagColor, fontWeight: 700, width: 36, flexShrink: 0 }}>
                {l.tag}
              </span>
              <span className="event-log-row-text" style={{ fontSize: 10, color: textColor, lineHeight: 1.4 }}>
                {l.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

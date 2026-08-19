import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { fmtRealDateLine, fmtRealDTG, stageForF2T2EA } from '../selectors';
import { ROES } from '../types';

const PHASE_LETTERS = ['F', 'F', 'T', 'T', 'E', 'A'];
const PHASE_NAMES = ['FIND', 'FIX', 'TRACK', 'TARGET', 'ENGAGE', 'ASSESS'];

export default function CommandBar() {
  const roeIdx = useStore((s) => s.roeIdx);
  const cycleRoe = useStore((s) => s.cycleRoe);
  const targets = useStore((s) => s.targets);
  const selectedId = useStore((s) => s.selectedId);

  const sel = targets.find((x) => x.id === selectedId) ?? targets[0];
  const roe = ROES[roeIdx];

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dtg = fmtRealDTG(now);
  const dateLine = fmtRealDateLine(now);

  const stageToPhase = stageForF2T2EA(sel ? sel.stage : 0);
  const phases = PHASE_LETTERS.map((letter, i) => {
    const done = i < stageToPhase;
    const active = i === stageToPhase;
    return {
      letter,
      label: PHASE_NAMES[i],
      border: active ? 'var(--amber)' : done ? '#3a5a4a' : '#22302d',
      bg: active ? 'rgba(255,171,56,.16)' : done ? 'rgba(58,90,74,.18)' : 'transparent',
      fg: active ? 'var(--amber)' : done ? 'var(--green)' : '#3a4a47',
      lblColor: active ? 'var(--amber)' : done ? 'var(--ink-dim2)' : '#3a4a47',
      connector: i < stageToPhase ? '#3a5a4a' : 'var(--hairline-mid)',
    };
  });

  return (
    <div className="command-bar" style={{ display: 'flex', alignItems: 'stretch', background: 'linear-gradient(180deg,#0c1315,#080d0e)', borderBottom: '1px solid var(--hairline)' }}>
      {/* system identity */}
      <div className="command-bar-identity" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px', borderRight: '1px solid var(--hairline)' }}>
        <div className="command-bar-logo-mark" style={{ width: 30, height: 30, position: 'relative', flexShrink: 0 }}>
          <div className="command-bar-logo-square" style={{ position: 'absolute', inset: 0, border: '1.5px solid var(--amber)', transform: 'rotate(45deg)' }} />
          <div className="command-bar-logo-ring" style={{ position: 'absolute', inset: 7, border: '1.5px solid var(--amber)', borderRadius: '50%', opacity: 0.6 }} />
          <div className="command-bar-logo-dot" style={{ position: 'absolute', left: '50%', top: '50%', width: 5, height: 5, background: 'var(--amber)', borderRadius: '50%', transform: 'translate(-50%,-50%)', boxShadow: '0 0 8px var(--amber)' }} />
        </div>
        <div className="command-bar-identity-text">
          <div className="command-bar-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '.16em', color: 'var(--ink-warm)', lineHeight: 1 }}>
            MERIDIAN<span className="command-bar-callsign-dot" style={{ color: 'var(--amber)' }}>·</span>FIRES
          </div>
          <div className="command-bar-unit-label" style={{ fontSize: 9, letterSpacing: '.22em', color: 'var(--ink-faint)', marginTop: 3 }}>
            JOINT C2 / TARGETING CELL
          </div>
        </div>
      </div>

      {/* mission */}
      <div className="command-bar-mission" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 18px', borderRight: '1px solid var(--hairline)', minWidth: 0 }}>
        <div className="command-bar-mission-name" style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600, letterSpacing: '.12em', color: 'var(--ink-bright)', whiteSpace: 'nowrap' }}>
          OP IRON MERIDIAN
        </div>
        <div className="command-bar-mission-subtitle" style={{ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--ink-dim2)', marginTop: 3, whiteSpace: 'nowrap' }}>
          SEAD / TIME-SENSITIVE TARGETING · AO AZ STRAIT
        </div>
      </div>

      {/* F2T2EA kill chain tracker */}
      <div className="command-bar-kill-chain" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '0 14px', minWidth: 0 }}>
        <span className="command-bar-kill-chain-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginRight: 14 }}>
          KILL&nbsp;CHAIN
        </span>
        {phases.map((ph, i) => (
          <div key={i} className="command-bar-phase" style={{ display: 'flex', alignItems: 'center' }}>
            <div className="command-bar-phase-chip-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 4px' }}>
              <div
                className="command-bar-phase-chip"
                style={{
                  width: 30,
                  height: 30,
                  border: `1.5px solid ${ph.border}`,
                  background: ph.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: ph.fg,
                  clipPath: 'polygon(18% 0,100% 0,82% 100%,0 100%)',
                }}
              >
                {ph.letter}
              </div>
              <div className="command-bar-phase-label" style={{ fontSize: 8, letterSpacing: '.08em', color: ph.lblColor }}>
                {ph.label}
              </div>
            </div>
            {i < phases.length - 1 && <div className="command-bar-phase-connector" style={{ width: 14, height: 1.5, background: ph.connector }} />}
          </div>
        ))}
      </div>

      {/* ROE + clock */}
      <div className="command-bar-roe-clock" style={{ display: 'flex', alignItems: 'center', gap: 0, borderLeft: '1px solid var(--hairline)' }}>
        <div className="command-bar-roe" onClick={cycleRoe} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px', cursor: 'pointer', borderRight: '1px solid var(--hairline)', height: '100%' }}>
          <div className="command-bar-roe-label" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)' }}>
            RULES OF ENGAGEMENT
          </div>
          <div className="command-bar-roe-value-row" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
            <span className="command-bar-roe-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: roe.color, boxShadow: `0 0 8px ${roe.color}` }} />
            <span className="command-bar-roe-value" style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.1em', color: roe.color }}>
              {roe.label}
            </span>
          </div>
        </div>
        <div className="command-bar-clock" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 18px', textAlign: 'right' }}>
          <div className="command-bar-clock-dtg" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '.08em', color: 'var(--amber)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {dtg.split('').map((ch, i) => (
              <span key={i} className="command-bar-clock-dtg-char" style={{ display: 'inline-block', width: '1ch', textAlign: 'center' }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="command-bar-clock-date" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-dim2)', marginTop: 4 }}>
            {dateLine}
          </div>
        </div>
      </div>
    </div>
  );
}

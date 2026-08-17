import { useStore } from '../store';
import {
  affColor,
  affFull,
  affShapeStyle,
  C,
  catFull,
  cdeColorFor,
  confColor,
  decayInfo,
  effFor,
  effName,
  isEngageReady,
  mgrs,
  nslDistFor,
  sensorName,
  STAGES,
  threatColor,
  trkColorFor,
} from '../selectors';
import type { Approvals, Target } from '../types';

const APPR_DEFS: { k: keyof Approvals; l: string }[] = [
  { k: 'pid', l: 'POSITIVE ID (PID)' },
  { k: 'jag', l: 'ROE / JAG REVIEW' },
  { k: 'strike', l: 'STRIKE CELL CONCUR' },
  { k: 'tea', l: 'TARGET ENGAGEMENT AUTH' },
];

function engageButtonProps(sel: Target, effCallsign: string) {
  const ready = isEngageReady(sel);
  const engaged = sel.engagedAt != null;
  const done = sel.stage === 4;
  if (done) {
    return { label: 'TARGET COMPLETE', sub: sel.bda || 'BDA LOGGED', color: C.green, bg: 'rgba(95,227,154,.08)', border: '#244536', subColor: 'var(--ink-dim2)', cursor: 'default' };
  }
  if (engaged) {
    return { label: '⊕ WEAPONS IN FLIGHT', sub: 'TIME OF FLIGHT RUNNING', color: C.red, bg: 'rgba(255,90,71,.12)', border: C.red, subColor: '#c98a82', cursor: 'default' };
  }
  if (ready) {
    return { label: '◉ ENGAGE — CLEARED HOT', sub: `AUTH COMPLETE · ${effCallsign}`, color: '#06090a', bg: C.red, border: C.red, subColor: 'rgba(6,9,10,.7)', cursor: 'pointer' };
  }
  const miss: string[] = [];
  if (sel.stage < 3) miss.push('REACH EXECUTION');
  if (!sel.effector) miss.push('PAIR EFFECTOR');
  if (!(sel.appr.tea && sel.appr.jag && sel.appr.pid && sel.appr.strike)) miss.push('CLEAR APPROVALS');
  return { label: 'ENGAGE — INHIBITED', sub: miss.join(' · '), color: 'var(--ink-faint)', bg: 'rgba(255,255,255,.015)', border: '#2a3d3a', subColor: 'var(--ink-dim2)', cursor: 'default' };
}

export default function TargetWorkup() {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const effectors = useStore((s) => s.effectors);
  const selectedId = useStore((s) => s.selectedId);
  const advanceStage = useStore((s) => s.advanceStage);
  const retreatStage = useStore((s) => s.retreatStage);
  const assignEffector = useStore((s) => s.assignEffector);
  const toggleAppr = useStore((s) => s.toggleAppr);
  const engage = useStore((s) => s.engage);

  const sel = targets.find((t) => t.id === selectedId) ?? targets[0];
  if (!sel) return <div style={{ borderLeft: '1px solid var(--hairline)', background: 'var(--panel-1)' }} />;

  const di = decayInfo(sel.decay);
  const candidates = effFor(sel, effectors);
  const effCallsign = effName(effectors, sel.effector);
  const btn = engageButtonProps(sel, effCallsign);

  const affWash = sel.aff === 'HOS' ? 'rgba(255,90,71,.07)' : sel.aff === 'UNK' ? 'rgba(255,210,63,.06)' : 'rgba(95,227,154,.05)';
  const nsl = nslDistFor(sel);

  return (
    <div style={{ borderLeft: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span style={{ width: 5, height: 14, background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>TARGET WORKUP</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>TWB / SINGLE</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* identity header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--hairline)', background: `linear-gradient(180deg,${affWash},transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 18, height: 18, background: '#0c1416', border: `2px solid ${affColor(sel.aff)}`, flexShrink: 0, boxShadow: `0 0 10px ${affColor(sel.aff)}`, ...affShapeStyle(sel.aff) }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '.04em', color: 'var(--ink-warm)', lineHeight: 1 }}>{sel.id.slice(1)}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: affColor(sel.aff), letterSpacing: '.06em' }}>{sel.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', background: affColor(sel.aff), color: '#06090a', fontWeight: 700 }}>{affFull(sel.aff)}</span>
            <span style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', border: `1px solid ${threatColor(sel.threat)}`, color: threatColor(sel.threat), fontWeight: 700 }}>{sel.threat || '—'} THREAT</span>
            <span style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', border: '1px solid #2a3d3a', color: 'var(--ink-mute)' }}>HPTL #{sel.pri ?? '—'}</span>
            {sel.nsl && <span style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>⚠ NSL PROXIMITY</span>}
          </div>
        </div>

        {/* identification */}
        <div style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>▸ IDENTIFICATION</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 12, fontSize: 11 }}>
            <span style={{ color: 'var(--ink-dim2)' }}>TYPE</span>
            <span style={{ color: 'var(--ink-bright)', textAlign: 'right' }}>{sel.type}</span>
            <span style={{ color: 'var(--ink-dim2)' }}>CATEGORY</span>
            <span style={{ color: 'var(--ink-bright)', textAlign: 'right' }}>{catFull(sel.cat)}</span>
            <span style={{ color: 'var(--ink-dim2)' }}>SIDC</span>
            <span style={{ color: 'var(--ink-mute)', textAlign: 'right', fontSize: 10 }}>{sel.sidc}</span>
            <span style={{ color: 'var(--ink-dim2)' }}>CLASSIFIED BY</span>
            <span style={{ color: 'var(--cyan)', textAlign: 'right' }}>{sensorName(sensors, sel.custody)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
              <span style={{ letterSpacing: '.1em' }}>CLASSIFICATION CONFIDENCE</span>
              <span style={{ color: confColor(sel.conf), fontWeight: 600 }}>{sel.conf}%</span>
            </div>
            <div style={{ height: 5, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${sel.conf}%`, background: confColor(sel.conf), boxShadow: `0 0 6px ${confColor(sel.conf)}` }} />
            </div>
          </div>
        </div>

        {/* kinematics */}
        <div style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)' }}>▸ TRACK / KINEMATICS</span>
            <span style={{ fontSize: 9, color: di.color, fontWeight: 600, letterSpacing: '.06em' }}>▲ {di.label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['GRID (MGRS)', mgrs(sel)],
              ['ELEV', sel.elev],
              ['COURSE', sel.speed > 0 ? `${String(sel.course).padStart(3, '0')}°` : 'STATIC'],
              ['SPEED', sel.speed > 0 ? `${sel.speed} KT` : '0 KT'],
            ].map(([label, val]) => (
              <div key={label} style={{ border: '1px solid var(--hairline-subtle2)', padding: '7px 8px' }}>
                <div style={{ fontSize: 8.5, letterSpacing: '.12em', color: 'var(--ink-faint)' }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-bright)', marginTop: 3 }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
              <span style={{ letterSpacing: '.1em' }}>TRACK QUALITY</span>
              <span style={{ color: trkColorFor(sel.trkQ), fontWeight: 600 }}>TQ {sel.trkQ}</span>
            </div>
            <div style={{ height: 5, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${sel.trkQ}%`, background: trkColorFor(sel.trkQ) }} />
            </div>
          </div>
        </div>

        {/* lifecycle */}
        <div style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>▸ TARGET LIFECYCLE</div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 3 }}>
            {STAGES.map((st, idx) => (
              <div key={st.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: 4, background: idx <= sel.stage ? st.color : '#16201f' }} />
                <div style={{ fontSize: 7.5, letterSpacing: '.04em', color: idx === sel.stage ? st.color : idx < sel.stage ? 'var(--ink-mute)' : '#46554f', textAlign: 'center', fontWeight: idx === sel.stage ? 700 : 400 }}>{st.name}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
            <div onClick={retreatStage} style={{ flex: 1, textAlign: 'center', padding: 6, border: '1px solid #2a3d3a', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-mute)', cursor: 'pointer', fontWeight: 600 }}>
              ◂ REGRESS
            </div>
            <div onClick={advanceStage} style={{ flex: 1, textAlign: 'center', padding: 6, border: '1px solid var(--amber)', background: 'rgba(255,171,56,.1)', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700 }}>
              ADVANCE ▸
            </div>
          </div>
        </div>

        {/* effector pairing */}
        <div style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)' }}>▸ EFFECTOR PAIRING · AGM</span>
            <span style={{ fontSize: 8.5, color: 'var(--ink-faint)' }}>PK / TOT / RANGE</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((x, idx) => {
              const pkPct = Math.round(x.pk * 100);
              const pkColor = x.pk >= 0.7 ? C.green : x.pk >= 0.5 ? C.amber : C.red;
              const recommended = !x.assigned && idx === 0 && x.suited;
              const border = x.assigned ? C.green : recommended ? '#5a4420' : 'var(--hairline-subtle)';
              const bg = x.assigned ? 'rgba(95,227,154,.07)' : 'var(--panel-3)';
              const dot = x.data.kinetic ? (x.data.status === 'AIRBORNE' ? C.green : x.data.status === 'ON STATION' ? C.cyan : C.amber) : C.blue;
              return (
                <div key={x.data.id} onClick={() => assignEffector(x.data.id)} style={{ border: `1px solid ${border}`, background: bg, padding: '8px 9px', cursor: 'pointer', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, background: dot, flexShrink: 0, ...(x.data.stealth ? { transform: 'rotate(45deg)' } : {}) }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-brighter)' }}>{x.data.callsign}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--ink-mute2)' }}>{x.data.platform}</span>
                    <span style={{ flex: 1 }} />
                    {recommended && <span style={{ fontSize: 7.5, letterSpacing: '.08em', padding: '1px 5px', background: 'var(--amber)', color: '#06090a', fontWeight: 700 }}>REC</span>}
                    {x.assigned && <span style={{ fontSize: 7.5, letterSpacing: '.08em', padding: '1px 5px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>PAIRED</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>{x.data.weapon}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: x.inRange ? C.green : C.red }}>{x.inRange ? `IN RANGE · ${x.data.rng}NM` : 'OUT OF RANGE'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                    <span style={{ fontSize: 8, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>PK</span>
                    <div style={{ width: 54, height: 4, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pkPct}%`, background: pkColor }} />
                    </div>
                    <span style={{ fontSize: 9, color: pkColor, fontWeight: 600 }}>{x.pk.toFixed(2)}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: 'var(--ink-dim2)' }}>TOT {x.data.tot}m</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* weaponeering */}
        <div style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>▸ WEAPONEERING / CDE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 12, fontSize: 11 }}>
            <span style={{ color: 'var(--ink-dim2)' }}>METHOD</span>
            <span style={{ color: 'var(--ink-bright)', textAlign: 'right' }}>{sel.method}</span>
            <span style={{ color: 'var(--ink-dim2)' }}>CDE LEVEL</span>
            <span style={{ color: cdeColorFor(sel.cde), textAlign: 'right', fontWeight: 600 }}>{sel.cde}</span>
            <span style={{ color: 'var(--ink-dim2)' }}>NO-STRIKE PROX</span>
            <span style={{ color: nsl.color, textAlign: 'right' }}>{nsl.label}</span>
          </div>
        </div>

        {/* engagement authorization */}
        <div style={{ padding: '11px 14px' }}>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>▸ ENGAGEMENT AUTHORIZATION</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {APPR_DEFS.map((a) => {
              const on = sel.appr[a.k];
              const boxColor = on ? C.green : 'var(--ink-faint)';
              return (
                <div key={a.k} onClick={() => toggleAppr(a.k)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', border: `1px solid ${on ? '#244536' : 'var(--hairline-mid)'}`, background: on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)', cursor: 'pointer' }}>
                  <span style={{ width: 14, height: 14, border: `1.5px solid ${boxColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: boxColor, fontWeight: 700, flexShrink: 0 }}>{on ? '✓' : ''}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink)', letterSpacing: '.04em', flex: 1 }}>{a.l}</span>
                  <span style={{ fontSize: 8.5, letterSpacing: '.08em', color: on ? C.green : C.amber, fontWeight: 600 }}>{on ? 'MET' : 'PENDING'}</span>
                </div>
              );
            })}
          </div>
          <div onClick={engage} style={{ marginTop: 11, textAlign: 'center', padding: 13, border: `1.5px solid ${btn.border}`, background: btn.bg, cursor: btn.cursor, position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '.18em', color: btn.color }}>{btn.label}</div>
            <div style={{ fontSize: 8.5, letterSpacing: '.14em', color: btn.subColor, marginTop: 4 }}>{btn.sub}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

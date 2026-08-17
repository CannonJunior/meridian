import { useStore } from '../store';
import { affColor } from '../selectors';
import type { Sensor, Target } from '../types';

const W = 1000;
const H = 620;
const px = (v: number) => (v / 100) * W;
const py = (v: number) => (v / 100) * H;

function SensorCoverage({ s }: { s: Sensor }) {
  const sx = px(s.x);
  const sy = py(s.y);
  if (s.cov === 'cone') {
    const a = ((s.covDir ?? 120) * Math.PI) / 180;
    const sp = 0.5;
    const len = 240;
    const x1 = sx + Math.cos(a - sp) * len;
    const y1 = sy + Math.sin(a - sp) * len;
    const x2 = sx + Math.cos(a + sp) * len;
    const y2 = sy + Math.sin(a + sp) * len;
    return <polygon points={`${sx},${sy} ${x1},${y1} ${x2},${y2}`} fill="rgba(63,210,230,.045)" stroke="rgba(63,210,230,.18)" strokeWidth={1} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />;
  }
  if (s.cov === 'wide') {
    return <ellipse cx={sx} cy={sy + 30} rx={230} ry={120} fill="rgba(63,210,230,.035)" stroke="rgba(63,210,230,.14)" strokeWidth={1} strokeDasharray="4 5" style={{ pointerEvents: 'none' }} />;
  }
  if (s.cov === 'area') {
    return <circle cx={sx} cy={sy} r={200} fill="rgba(91,157,255,.03)" stroke="rgba(91,157,255,.12)" strokeWidth={1} strokeDasharray="3 6" style={{ pointerEvents: 'none' }} />;
  }
  return null;
}

function TrackSymbol({ t, selected, onSelect, onOpen }: { t: Target; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  if (t.stage === 4 && t.id !== 'T2198') return null;
  const x = px(t.x);
  const y = py(t.y);
  const col = affColor(t.aff);
  const stale = t.decay >= 35 && t.stage < 4;
  const lock = t.stage === 3 || t.engagedAt != null;
  const labelW = selected ? 112 : 62;
  const labelH = selected ? 26 : 13;

  return (
    <g style={{ cursor: 'pointer' }} onClick={onSelect} onDoubleClick={onOpen}>
      {t.speed > 0 && t.stage < 4 && (() => {
        const a = ((t.course - 90) * Math.PI) / 180;
        const len = Math.min(46, 14 + t.speed * 0.28);
        return <line x1={x} y1={y} x2={x + Math.cos(a) * len} y2={y + Math.sin(a) * len} stroke={col} strokeWidth={1.5} opacity={0.7} />;
      })()}

      {t.aff === 'HOS' && <polygon points={`${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}`} fill={selected ? '#16100e' : '#0c1416'} stroke={col} strokeWidth={2} />}
      {t.aff === 'FRD' && <circle cx={x} cy={y} r={11} fill="#0c1416" stroke={col} strokeWidth={2} />}
      {t.aff !== 'HOS' && t.aff !== 'FRD' && <rect x={x - 11} y={y - 11} width={22} height={22} fill="#0c1416" stroke={col} strokeWidth={2} />}

      {t.stage === 4 ? (
        <text x={x} y={y + 5} fill={col} fontSize={15} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ╳
        </text>
      ) : (
        <circle cx={x} cy={y} r={2} fill={col} />
      )}

      <rect x={x + 15} y={y - 12} width={labelW} height={labelH} fill="rgba(7,11,12,.72)" />
      <text x={x + 17} y={y - 2} fill={col} fontSize={10} fontWeight={700} fontFamily="Chakra Petch" letterSpacing={0.5}>
        {t.id.slice(1)} {t.name}
      </text>
      {selected && (
        <text x={x + 17} y={y + 9} fill="#8aa09c" fontSize={8.5} fontFamily="IBM Plex Mono">
          {t.type}
        </text>
      )}
      {stale && (
        <text x={x - 12} y={y + 24} fill={affColor('HOS')} fontSize={8} fontFamily="IBM Plex Mono" fontWeight={600}>
          ◬ STALE
        </text>
      )}

      {selected && (
        <>
          <g style={{ transformOrigin: `${x}px ${y}px`, animation: 'twbspin 7s linear infinite' }}>
            <circle cx={x} cy={y} r={24} fill="none" stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.4} strokeDasharray="4 6" />
            <line x1={x} y1={y - 30} x2={x} y2={y - 20} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line x1={x} y1={y + 20} x2={x} y2={y + 30} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line x1={x - 30} y1={y} x2={x - 20} y2={y} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
            <line x1={x + 20} y1={y} x2={x + 30} y2={y} stroke={lock ? 'var(--red)' : 'var(--amber)'} strokeWidth={1.6} />
          </g>
          {lock && (
            <text x={x} y={y - 34} fill="var(--red)" fontSize={9} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch" letterSpacing={1}>
              {t.engagedAt != null ? 'ENGAGED' : 'LOCKED'}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function MapSvg() {
  const nais = useStore((s) => s.nais);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);
  const targets = useStore((s) => s.targets);
  const selectedId = useStore((s) => s.selectedId);
  const selectTarget = useStore((s) => s.selectTarget);
  const openCard = useStore((s) => s.openCard);
  const openEntity = useStore((s) => s.openEntity);

  const drift = targets.find((t) => t.id === 'T2210');
  const gridXs: number[] = [];
  for (let gx = 0; gx <= W; gx += 125) gridXs.push(gx);
  const gridYs: number[] = [];
  for (let gy = 0; gy <= H; gy += 124) gridYs.push(gy);
  const gridRefXs: number[] = [];
  for (let gx = 125; gx < W; gx += 250) gridRefXs.push(gx);

  const ox = px(12);
  const oy = py(86);
  const bx = px(50);
  const by = py(46);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {gridXs.map((gx, i) => (
        <line key={`gvx${i}`} x1={gx} y1={0} x2={gx} y2={H} stroke="rgba(90,120,116,.09)" strokeWidth={1} />
      ))}
      {gridYs.map((gy, i) => (
        <line key={`gvy${i}`} x1={0} y1={gy} x2={W} y2={gy} stroke="rgba(90,120,116,.09)" strokeWidth={1} />
      ))}
      {gridRefXs.map((gx, i) => (
        <text key={`gr${i}`} x={gx + 4} y={14} fill="#33433f" fontSize={9} fontFamily="IBM Plex Mono">
          CK{30 + gx / 25}
        </text>
      ))}

      {[120, 230, 340, 460].map((r) => (
        <circle key={`ring${r}`} cx={ox} cy={oy} r={r} fill="none" stroke="rgba(63,210,230,.10)" strokeWidth={1} strokeDasharray="2 7" />
      ))}

      {[16, 38, 66].map((r) => (
        <circle key={`bulls${r}`} cx={bx} cy={by} r={r} fill="none" stroke="rgba(255,171,56,.18)" strokeWidth={1} />
      ))}
      <line x1={bx} y1={by - 72} x2={bx} y2={by + 72} stroke="rgba(255,171,56,.16)" strokeWidth={1} />
      <line x1={bx - 72} y1={by} x2={bx + 72} y2={by} stroke="rgba(255,171,56,.16)" strokeWidth={1} />
      <text x={bx + 70} y={by - 50} fill="#7a5e24" fontSize={9} fontFamily="IBM Plex Mono" letterSpacing={1}>
        BULLSEYE
      </text>

      {nais.map((n) => {
        const x = px(n.x);
        const y = py(n.y);
        const w = px(n.w);
        const hh = py(n.h);
        return (
          <g key={n.id}>
            <rect x={x} y={y} width={w} height={hh} fill={n.color === '#ff5a47' ? 'rgba(255,90,71,.04)' : 'rgba(255,171,56,.03)'} stroke={n.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.5} style={{ pointerEvents: 'none' }} />
            <g style={{ cursor: 'pointer' }} onClick={() => openEntity('nai', n.id)} onDoubleClick={() => openEntity('nai', n.id)}>
              <rect x={x + 2} y={y + 5} width={50} height={15} fill="rgba(7,11,12,.65)" />
              <text x={x + 6} y={y + 16} fill={n.color} fontSize={11} fontFamily="Chakra Petch" fontWeight={700}>
                {n.id}
              </text>
            </g>
          </g>
        );
      })}

      {sensors.map((s) => (
        <SensorCoverage key={`cov-${s.id}`} s={s} />
      ))}

      {sensors.map((s) => {
        const sx = px(s.x);
        const sy = py(s.y);
        const col = s.status === 'DEGRADED' ? 'var(--red)' : 'var(--cyan)';
        return (
          <g key={s.id} style={{ cursor: 'pointer' }} onClick={() => openEntity('sensor', s.id)} onDoubleClick={() => openEntity('sensor', s.id)}>
            <rect x={sx - 6} y={sy - 6} width={12} height={12} fill="#0a1316" stroke={col} strokeWidth={1.5} transform={`rotate(45 ${sx} ${sy})`} />
            <circle cx={sx} cy={sy} r={2} fill={col} />
            <text x={sx + 11} y={sy + 3} fill={col} fontSize={9} fontFamily="IBM Plex Mono" opacity={0.85}>
              {s.callsign}
            </text>
          </g>
        );
      })}

      {drift && (
        <>
          <circle cx={px(drift.x)} cy={py(drift.y)} r={62} fill="rgba(95,227,154,.04)" stroke="rgba(95,227,154,.45)" strokeWidth={1.5} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
          <g style={{ cursor: 'pointer' }} onClick={() => openEntity('zone', 'NSZ')} onDoubleClick={() => openEntity('zone', 'NSZ')}>
            <rect x={px(drift.x) - 47} y={py(drift.y) - 60} width={94} height={14} fill="rgba(7,11,12,.65)" />
            <text x={px(drift.x) - 44} y={py(drift.y) - 50} fill="#4fae7e" fontSize={9} fontFamily="IBM Plex Mono" letterSpacing={1}>
              NO-STRIKE ZONE
            </text>
          </g>
        </>
      )}

      {units.map((u) => {
        const fx = px(u.x);
        const fy = py(u.y);
        return (
          <g key={u.id} style={{ cursor: 'pointer' }} onClick={() => openEntity('unit', u.id)} onDoubleClick={() => openEntity('unit', u.id)}>
            <circle cx={fx} cy={fy} r={9} fill="#0a1316" stroke="var(--cyan)" strokeWidth={1.5} />
            <circle cx={fx} cy={fy} r={2.5} fill="var(--cyan)" />
            <text x={fx + 13} y={fy + 3} fill="var(--cyan)" fontSize={9} fontFamily="IBM Plex Mono" opacity={0.8}>
              {u.callsign}
            </text>
          </g>
        );
      })}

      {targets.map((t) => (
        <TrackSymbol key={t.id} t={t} selected={t.id === selectedId} onSelect={() => selectTarget(t.id)} onOpen={() => openCard(t.id)} />
      ))}
    </svg>
  );
}

export default function TacticalMap() {
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 40%,#0a1416 0%,#070b0c 55%,#05080a 100%)' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapSvg />
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, background: 'linear-gradient(180deg,rgba(63,210,230,0),rgba(63,210,230,.05))', pointerEvents: 'none', animation: 'twbscan 9s linear infinite' }} />

      <div style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderTop: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderLeft: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 22, height: 22, borderBottom: '2px solid var(--amber)', borderRight: '2px solid var(--amber)', opacity: 0.7, pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(8,13,14,.82)', border: '1px solid var(--hairline-mid)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
        <div style={{ fontSize: 8.5, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 1 }}>TRACK AFFILIATION</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--red)', transform: 'rotate(45deg)' }} />
          <span style={{ fontSize: 9, color: 'var(--ink-mute)' }}>HOSTILE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--yellow)' }} />
          <span style={{ fontSize: 9, color: 'var(--ink-mute)' }}>UNKNOWN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--cyan)', borderRadius: '50%' }} />
          <span style={{ fontSize: 9, color: 'var(--ink-mute)' }}>FRIENDLY</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, background: '#0c1416', border: '1.5px solid var(--green)' }} />
          <span style={{ fontSize: 9, color: 'var(--ink-mute)' }}>NEUTRAL / NSL</span>
        </div>
      </div>

      <div style={{ position: 'absolute', right: 14, top: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, pointerEvents: 'none' }}>
        <div style={{ width: 32, height: 32, border: '1px solid #2a3d3a', borderRadius: '50%', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: 1, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--amber)', fontWeight: 700 }}>N</div>
          <div style={{ position: 'absolute', left: '50%', top: 3, bottom: '50%', width: 1, background: 'var(--amber)', transform: 'translateX(-50%)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 60, height: 5, border: '1px solid var(--ink-faint)', borderTop: 'none' }} />
        </div>
        <span style={{ fontSize: 8.5, color: 'var(--ink-dim2)', letterSpacing: '.1em' }}>0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;25 NM</span>
      </div>
    </div>
  );
}

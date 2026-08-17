import { useStore } from '../../store';
import {
  C,
  catFull,
  cdeColorFor,
  computeAssoc,
  confColor,
  decayInfo,
  effFor,
  fmtLogTime,
  mgrs,
  nslDistFor,
  obsFor,
  physFor,
  rationaleFor,
  sensorName,
  sigFor,
  sourcesFor,
  statusColorFor,
  STAGES,
  trkColorFor,
  unitFor,
} from '../../selectors';
import { APPR_DEFS, EmptyNote, KV, KVGrid, LinkRow, ProgressRow, SectionLabel } from './shared';

export default function TargetCardBody({ id, tab }: { id: string; tab: number }) {
  const state = useStore((s) => s);
  const t = state.targets.find((x) => x.id === id);
  const openCard = useStore((s) => s.openCard);
  const assignEffector = useStore((s) => s.assignEffector);
  const toggleAppr = useStore((s) => s.toggleAppr);

  if (!t) return null;

  if (tab === 0) {
    const stage = STAGES[t.stage];
    return (
      <>
        <KVGrid>
          <KV label="TYPE" value={t.type} />
          <KV label="CATEGORY" value={catFull(t.cat)} />
          <KV label="SIDC" value={t.sidc} color="var(--ink-mute)" />
          <KV label="PARENT UNIT" value={unitFor(t)} />
          <KV label="FIRST DETECTED" value="D-1 · 280214Z" color="var(--ink-mute)" />
          <KV label="CUSTODY" value={sensorName(state.sensors, t.custody)} color="var(--cyan)" />
          <KV label="LIFECYCLE" value={stage.name} color={stage.color} />
          <KV label="STATUS" value={t.status} color={statusColorFor(t)} />
        </KVGrid>
        <ProgressRow label="CLASSIFICATION CONFIDENCE" value={t.conf} color={confColor(t.conf)} />
        <ProgressRow label="TRACK QUALITY" value={t.trkQ} color={trkColorFor(t.trkQ)} />
        <SectionLabel top={14}>KINEMATICS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            ['MGRS', mgrs(t), 'var(--ink-bright)'],
            ['ELEV', t.elev, 'var(--ink-bright)'],
            ['DECAY', decayInfo(t.decay).label, decayInfo(t.decay).color],
            ['COURSE', t.speed > 0 ? `${String(t.course).padStart(3, '0')}°` : 'STATIC', 'var(--ink-bright)'],
            ['SPEED', t.speed > 0 ? `${t.speed} KT` : '0 KT', 'var(--ink-bright)'],
            ['HPTL', `#${t.pri ?? '—'}`, 'var(--amber)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ border: '1px solid var(--hairline-subtle2)', padding: '7px 8px' }}>
              <div style={{ fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>{label}</div>
              <div style={{ fontSize: 10.5, color, marginTop: 3 }}>{val}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (tab === 1) {
    const sources = sourcesFor(t, state.sensors);
    const obs = obsFor(t, state.t, state.sensors);
    return (
      <>
        <SectionLabel>COLLECTION SOURCES</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sources.map((src, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--hairline-subtle)', background: 'var(--panel-3)', padding: '6px 9px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--cyan)', width: 50 }}>{src.int}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>{src.sensor}</span>
              <span style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '1px 6px', border: `1px solid ${src.relColor}`, color: src.relColor, fontWeight: 600 }}>REL {src.rel}</span>
              <span style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 34, textAlign: 'right' }}>{src.recency}</span>
            </div>
          ))}
        </div>
        <SectionLabel top={16}>OBSERVATION HISTORY</SectionLabel>
        {obs.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderLeft: '1px solid var(--hairline-mid)', marginLeft: 4, paddingLeft: 12, position: 'relative' }}>
            <span style={{ position: 'absolute', left: -4, top: 9, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />
            <span style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 54, flexShrink: 0 }}>{o.time}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: 'var(--cyan)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>{o.sensor}</span> · {o.int}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink)', marginTop: 2, lineHeight: 1.4 }}>{o.note}</div>
            </div>
          </div>
        ))}
        <SectionLabel top={16}>ANALYST ASSESSMENT</SectionLabel>
        <div style={{ fontSize: 10.5, color: 'var(--ink-mute)', lineHeight: 1.55, borderLeft: '2px solid #2a3d3a', paddingLeft: 10 }}>{rationaleFor(t)}</div>
      </>
    );
  }

  if (tab === 2) {
    const assoc = computeAssoc(t, state);
    return (
      <>
        <SectionLabel>LINKED ENTITIES · NETWORK</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {assoc.map((a, i) => (
            <LinkRow key={i} affColor={a.affColor} affShape={a.affShape} idShort={a.idShort} name={a.name} pillLabel={a.rel} pillColor={a.relColor} dist={a.dist || undefined} onClick={a.clickable && a.oid ? () => openCard(a.oid!) : undefined} />
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>▸ Click a linked track to open its object card. Relationships derived from geospatial proximity, order-of-battle, and IADS topology.</div>
      </>
    );
  }

  if (tab === 3) {
    const effTop = effFor(t, state.effectors).slice(0, 4);
    const nsl = nslDistFor(t);
    const effects = t.bda ? t.bda : t.engagedAt != null ? 'WEAPONS IN FLIGHT — TOF RUNNING' : 'NO EFFECTS EXECUTED';
    const effectsColor = t.bda ? C.green : t.engagedAt != null ? C.red : 'var(--ink-dim2)';
    const fires = state.log.filter((l) => l.text.indexOf(t.name) >= 0).slice(0, 7);
    const stage = STAGES[t.stage];
    const tagColors: Record<string, string> = { det: C.cyan, trk: '#9fb2ae', pair: C.amber, fire: C.red, bda: C.green, warn: C.yellow, sys: '#6f8480' };
    return (
      <>
        <KVGrid>
          <KV label="LIFECYCLE" value={stage.name} color={stage.color} />
          <KV label="METHOD" value={t.method} />
          <KV label="CDE LEVEL" value={t.cde} color={cdeColorFor(t.cde)} />
          <KV label="NO-STRIKE PROX" value={nsl.label} color={nsl.color} />
        </KVGrid>
        <SectionLabel top={14}>EFFECTOR OPTIONS · AGM</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {effTop.map((x, idx) => {
            const pkPct = Math.round(x.pk * 100);
            const pkColor = x.pk >= 0.7 ? C.green : x.pk >= 0.5 ? C.amber : C.red;
            const recommended = idx === 0 && x.suited && !x.assigned;
            const border = x.assigned ? C.green : recommended ? '#5a4420' : 'var(--hairline-subtle)';
            const bg = x.assigned ? 'rgba(95,227,154,.07)' : 'var(--panel-3)';
            return (
              <div key={x.data.id} onClick={() => assignEffector(x.data.id)} style={{ border: `1px solid ${border}`, background: bg, padding: '7px 9px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>{x.data.callsign}</span>
                  <span style={{ fontSize: 9, color: 'var(--ink-mute2)' }}>{x.data.platform}</span>
                  <span style={{ flex: 1 }} />
                  {recommended && <span style={{ fontSize: 7.5, padding: '1px 5px', background: 'var(--amber)', color: '#06090a', fontWeight: 700 }}>REC</span>}
                  {x.assigned && <span style={{ fontSize: 7.5, padding: '1px 5px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>PAIRED</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>{x.data.weapon}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 8, color: 'var(--ink-faint)' }}>PK</span>
                  <div style={{ width: 46, height: 4, background: 'var(--hairline-subtle2)' }}>
                    <div style={{ height: '100%', width: `${pkPct}%`, background: pkColor }} />
                  </div>
                  <span style={{ fontSize: 9, color: pkColor, fontWeight: 600 }}>{x.pk.toFixed(2)}</span>
                  <span style={{ fontSize: 9, color: 'var(--ink-dim2)' }}>TOT {x.data.tot}</span>
                </div>
              </div>
            );
          })}
        </div>
        <SectionLabel top={14}>AUTHORIZATION</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {APPR_DEFS.map((a) => {
            const on = t.appr[a.k];
            const boxColor = on ? C.green : 'var(--ink-faint)';
            return (
              <div key={a.k} onClick={() => toggleAppr(a.k)} style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? '#244536' : 'var(--hairline-mid)'}`, background: on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)', padding: '5px 7px', cursor: 'pointer' }}>
                <span style={{ width: 13, height: 13, border: `1.5px solid ${boxColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: boxColor, fontWeight: 700, flexShrink: 0 }}>{on ? '✓' : ''}</span>
                <span style={{ fontSize: 9, color: 'var(--ink)', flex: 1 }}>{a.l}</span>
              </div>
            );
          })}
        </div>
        <SectionLabel top={14}>EFFECTS / BDA</SectionLabel>
        <div style={{ fontSize: 11, color: effectsColor, border: '1px solid var(--hairline-subtle)', background: 'var(--panel-3)', padding: '8px 10px' }}>{effects}</div>
        <SectionLabel top={14}>RELATED FIRES</SectionLabel>
        {fires.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, padding: '3px 0', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9, color: 'var(--ink-faint)', flexShrink: 0 }}>{fmtLogTime(f.t)}</span>
            <span style={{ fontSize: 8, color: tagColors[f.tag2] || 'var(--ink-dim)', fontWeight: 700, width: 30, flexShrink: 0 }}>{f.tag}</span>
            <span style={{ fontSize: 9.5, color: 'var(--ink-mute)', lineHeight: 1.4 }}>{f.text}</span>
          </div>
        ))}
        {fires.length === 0 && <EmptyNote>No fires logged against this track.</EmptyNote>}
      </>
    );
  }

  // SIGNATURES
  const sig = sigFor(t);
  const phys = physFor(t);
  return (
    <>
      <SectionLabel>EMITTERS · ELINT</SectionLabel>
      <KVGrid>
        <KV label="EMCON" value={sig.emcon} color={sig.sigColor} />
        <KV label="BAND" value={sig.band} />
        <KV label="FREQUENCY" value={sig.freq} />
        <KV label="PRF" value={sig.prf} color="var(--ink-mute)" />
        <KV label="MODE" value={sig.mode} />
        <KV label="LAST INTERCEPT" value={sig.intercept} color="var(--ink-mute)" />
      </KVGrid>
      <SectionLabel top={14}>PHYSICAL SIGNATURE</SectionLabel>
      <KVGrid>
        <KV label="RCS" value={phys.rcs} />
        <KV label="DIMENSIONS" value={phys.dims} />
        <KV label="MOBILITY" value={phys.mob} />
      </KVGrid>
      <SectionLabel top={14}>SENSOR IMAGERY</SectionLabel>
      <div
        style={{
          height: 150,
          border: '1px solid var(--hairline-mid)',
          background: 'repeating-linear-gradient(45deg,#0a1011,#0a1011 9px,#0c1416 9px,#0c1416 18px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>{sensorName(state.sensors, t.custody)} · EO/IR FRAME</div>
        <div style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTop: '1.5px solid var(--amber)', borderLeft: '1.5px solid var(--amber)' }} />
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottom: '1.5px solid var(--amber)', borderRight: '1.5px solid var(--amber)' }} />
        <span style={{ fontSize: 10, color: 'var(--ink-dim2)', letterSpacing: '.14em' }}>NO IMAGERY ON FILE</span>
        <span style={{ fontSize: 8.5, color: '#46554f' }}>DROP EO/IR FRAME OR TASK SENSOR</span>
      </div>
    </>
  );
}

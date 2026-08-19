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
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const effectors = useStore((s) => s.effectors);
  const log = useStore((s) => s.log);
  const tick = useStore((s) => s.t);
  const t = targets.find((x) => x.id === id);
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
          <KV label="CUSTODY" value={sensorName(sensors, t.custody)} color="var(--cyan)" />
          <KV label="LIFECYCLE" value={stage.name} color={stage.color} />
          <KV label="STATUS" value={t.status} color={statusColorFor(t)} />
        </KVGrid>
        <ProgressRow label="CLASSIFICATION CONFIDENCE" value={t.conf} color={confColor(t.conf)} />
      </>
    );
  }

  if (tab === 1) {
    const sources = sourcesFor(t, sensors);
    const obs = obsFor(t, tick, sensors);
    return (
      <>
        <SectionLabel>COLLECTION SOURCES</SectionLabel>
        <div className="target-card-sources-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sources.map((src, i) => (
            <div key={i} className="target-card-source-row" style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--hairline-subtle)', background: 'var(--panel-3)', padding: '6px 9px' }}>
              <span className="target-card-source-int" style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--cyan)', width: 50 }}>
                {src.int}
              </span>
              <span className="target-card-source-sensor" style={{ fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>
                {src.sensor}
              </span>
              <span className="target-card-source-rel" style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '1px 6px', border: `1px solid ${src.relColor}`, color: src.relColor, fontWeight: 600 }}>
                REL {src.rel}
              </span>
              <span className="target-card-source-recency" style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 34, textAlign: 'right' }}>
                {src.recency}
              </span>
            </div>
          ))}
        </div>
        <SectionLabel top={16}>OBSERVATION HISTORY</SectionLabel>
        {obs.map((o, i) => (
          <div key={i} className="target-card-observation-row" style={{ display: 'flex', gap: 10, padding: '6px 0', borderLeft: '1px solid var(--hairline-mid)', marginLeft: 4, paddingLeft: 12, position: 'relative' }}>
            <span className="target-card-observation-dot" style={{ position: 'absolute', left: -4, top: 9, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />
            <span className="target-card-observation-time" style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 54, flexShrink: 0 }}>
              {o.time}
            </span>
            <div className="target-card-observation-body" style={{ flex: 1 }}>
              <div className="target-card-observation-source" style={{ fontSize: 9, color: 'var(--cyan)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>{o.sensor}</span> · {o.int}
              </div>
              <div className="target-card-observation-note" style={{ fontSize: 10, color: 'var(--ink)', marginTop: 2, lineHeight: 1.4 }}>
                {o.note}
              </div>
            </div>
          </div>
        ))}
        <SectionLabel top={16}>ANALYST ASSESSMENT</SectionLabel>
        <div className="target-card-analyst-assessment" style={{ fontSize: 10.5, color: 'var(--ink-mute)', lineHeight: 1.55, borderLeft: '2px solid #2a3d3a', paddingLeft: 10 }}>
          {rationaleFor(t)}
        </div>
      </>
    );
  }

  if (tab === 2) {
    const assoc = computeAssoc(t, { targets, sensors, effectors });
    return (
      <>
        <SectionLabel>LINKED ENTITIES · NETWORK</SectionLabel>
        <div className="target-card-assoc-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {assoc.map((a, i) => (
            <LinkRow key={i} affColor={a.affColor} affShape={a.affShape} idShort={a.idShort} name={a.name} pillLabel={a.rel} pillColor={a.relColor} dist={a.dist || undefined} onClick={a.clickable && a.oid ? () => openCard(a.oid!) : undefined} />
          ))}
        </div>
        <div className="target-card-assoc-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>
          ▸ Click a linked track to open its object card. Relationships derived from geospatial proximity, order-of-battle, and IADS topology.
        </div>
      </>
    );
  }

  if (tab === 3) {
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
          className="target-card-imagery-frame"
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
          <div className="target-card-imagery-source-label" style={{ position: 'absolute', top: 6, left: 8, fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>
            {sensorName(sensors, t.custody)} · EO/IR FRAME
          </div>
          <div className="target-card-imagery-corner target-card-imagery-corner-tl" style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTop: '1.5px solid var(--amber)', borderLeft: '1.5px solid var(--amber)' }} />
          <div className="target-card-imagery-corner target-card-imagery-corner-br" style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottom: '1.5px solid var(--amber)', borderRight: '1.5px solid var(--amber)' }} />
          <span className="target-card-imagery-placeholder-title" style={{ fontSize: 10, color: 'var(--ink-dim2)', letterSpacing: '.14em' }}>
            NO IMAGERY ON FILE
          </span>
          <span className="target-card-imagery-placeholder-sub" style={{ fontSize: 8.5, color: '#46554f' }}>
            DROP EO/IR FRAME OR TASK SENSOR
          </span>
        </div>
      </>
    );
  }

  // TARGET WORKUP — identification/kinematics/track-quality (mirrors the
  // right-rail workup panel) plus the targeting/engagement workflow, merged
  // into one tab. Long, so it scrolls in its own region.
  const di = decayInfo(t.decay);
  const stage = STAGES[t.stage];
  const effTop = effFor(t, effectors).slice(0, 4);
  const nsl = nslDistFor(t);
  const effects = t.bda ? t.bda : t.engagedAt != null ? 'WEAPONS IN FLIGHT — TOF RUNNING' : 'NO EFFECTS EXECUTED';
  const effectsColor = t.bda ? C.green : t.engagedAt != null ? C.red : 'var(--ink-dim2)';
  const fires = log.filter((l) => l.text.indexOf(t.name) >= 0).slice(0, 7);
  const tagColors: Record<string, string> = { det: C.cyan, trk: '#9fb2ae', pair: C.amber, fire: C.red, bda: C.green, warn: C.yellow, sys: '#6f8480' };

  return (
    <div className="target-card-workup-tab" style={{ maxHeight: 460, overflowY: 'auto', overflowX: 'hidden', paddingRight: 6 }}>
      <SectionLabel>IDENTIFICATION</SectionLabel>
      <KVGrid>
        <KV label="TYPE" value={t.type} />
        <KV label="CATEGORY" value={catFull(t.cat)} />
        <KV label="SIDC" value={t.sidc} color="var(--ink-mute)" />
        <KV label="CLASSIFIED BY" value={sensorName(sensors, t.custody)} color="var(--cyan)" />
      </KVGrid>
      <ProgressRow label="CLASSIFICATION CONFIDENCE" value={t.conf} color={confColor(t.conf)} />

      <SectionLabel top={16}>TRACK / KINEMATICS</SectionLabel>
      <div className="target-card-kinematics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['GRID (MGRS)', mgrs(t)],
          ['ELEV', t.elev],
          ['COURSE', t.speed > 0 ? `${String(t.course).padStart(3, '0')}°` : 'STATIC'],
          ['SPEED', t.speed > 0 ? `${t.speed} KT` : '0 KT'],
        ].map(([label, val]) => (
          <div key={label} className="target-card-kinematics-cell" style={{ border: '1px solid var(--hairline-subtle2)', padding: '7px 8px' }}>
            <div className="target-card-kinematics-cell-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              {label}
            </div>
            <div className="target-card-kinematics-cell-value" style={{ fontSize: 11, color: 'var(--ink-bright)', marginTop: 3 }}>
              {val}
            </div>
          </div>
        ))}
      </div>
      <div className="target-card-decay-row" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 7 }}>
        <span className="target-card-decay-label" style={{ fontSize: 9, color: di.color, fontWeight: 600, letterSpacing: '.06em' }}>
          ▲ {di.label}
        </span>
      </div>
      <ProgressRow label="TRACK QUALITY" value={t.trkQ} color={trkColorFor(t.trkQ)} />

      <SectionLabel top={16}>TARGETING</SectionLabel>
      <KVGrid>
        <KV label="LIFECYCLE" value={stage.name} color={stage.color} />
        <KV label="METHOD" value={t.method} />
        <KV label="CDE LEVEL" value={t.cde} color={cdeColorFor(t.cde)} />
        <KV label="NO-STRIKE PROX" value={nsl.label} color={nsl.color} />
      </KVGrid>
      <SectionLabel top={14}>EFFECTOR OPTIONS · AGM</SectionLabel>
      <div className="target-card-effector-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {effTop.map((x, idx) => {
          const pkPct = Math.round(x.pk * 100);
          const pkColor = x.pk >= 0.7 ? C.green : x.pk >= 0.5 ? C.amber : C.red;
          const recommended = idx === 0 && x.suited && !x.assigned;
          const border = x.assigned ? C.green : recommended ? '#5a4420' : 'var(--hairline-subtle)';
          const bg = x.assigned ? 'rgba(95,227,154,.07)' : 'var(--panel-3)';
          return (
            <div key={x.data.id} className="target-card-effector-row" onClick={() => assignEffector(x.data.id)} style={{ border: `1px solid ${border}`, background: bg, padding: '7px 9px', cursor: 'pointer' }}>
              <div className="target-card-effector-row-header" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="target-card-effector-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>
                  {x.data.callsign}
                </span>
                <span className="target-card-effector-platform" style={{ fontSize: 9, color: 'var(--ink-mute2)' }}>
                  {x.data.platform}
                </span>
                <span className="target-card-effector-spacer" style={{ flex: 1 }} />
                {recommended && (
                  <span className="target-card-effector-rec-pill" style={{ fontSize: 7.5, padding: '1px 5px', background: 'var(--amber)', color: '#06090a', fontWeight: 700 }}>
                    REC
                  </span>
                )}
                {x.assigned && (
                  <span className="target-card-effector-paired-pill" style={{ fontSize: 7.5, padding: '1px 5px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>
                    PAIRED
                  </span>
                )}
              </div>
              <div className="target-card-effector-detail-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span className="target-card-effector-weapon" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                  {x.data.weapon}
                </span>
                <span className="target-card-effector-spacer" style={{ flex: 1 }} />
                <span className="target-card-effector-pk-label" style={{ fontSize: 8, color: 'var(--ink-faint)' }}>
                  PK
                </span>
                <div className="target-card-effector-pk-track" style={{ width: 46, height: 4, background: 'var(--hairline-subtle2)' }}>
                  <div className="target-card-effector-pk-fill" style={{ height: '100%', width: `${pkPct}%`, background: pkColor }} />
                </div>
                <span className="target-card-effector-pk-value" style={{ fontSize: 9, color: pkColor, fontWeight: 600 }}>
                  {x.pk.toFixed(2)}
                </span>
                <span className="target-card-effector-tot" style={{ fontSize: 9, color: 'var(--ink-dim2)' }}>
                  TOT {x.data.tot}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <SectionLabel top={14}>AUTHORIZATION</SectionLabel>
      <div className="target-card-authorization-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {APPR_DEFS.map((a) => {
          const on = t.appr[a.k];
          const boxColor = on ? C.green : 'var(--ink-faint)';
          return (
            <div key={a.k} className="target-card-authorization-row" onClick={() => toggleAppr(a.k)} style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${on ? '#244536' : 'var(--hairline-mid)'}`, background: on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)', padding: '5px 7px', cursor: 'pointer' }}>
              <span className="target-card-authorization-checkbox" style={{ width: 13, height: 13, border: `1.5px solid ${boxColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: boxColor, fontWeight: 700, flexShrink: 0 }}>
                {on ? '✓' : ''}
              </span>
              <span className="target-card-authorization-label" style={{ fontSize: 9, color: 'var(--ink)', flex: 1 }}>
                {a.l}
              </span>
            </div>
          );
        })}
      </div>
      <SectionLabel top={14}>EFFECTS / BDA</SectionLabel>
      <div className="target-card-effects" style={{ fontSize: 11, color: effectsColor, border: '1px solid var(--hairline-subtle)', background: 'var(--panel-3)', padding: '8px 10px' }}>
        {effects}
      </div>
      <SectionLabel top={14}>RELATED FIRES</SectionLabel>
      {fires.map((f, i) => (
        <div key={i} className="target-card-fire-row" style={{ display: 'flex', gap: 9, padding: '3px 0', alignItems: 'baseline' }}>
          <span className="target-card-fire-time" style={{ fontSize: 9, color: 'var(--ink-faint)', flexShrink: 0 }}>
            {fmtLogTime(f.t)}
          </span>
          <span className="target-card-fire-tag" style={{ fontSize: 8, color: tagColors[f.tag2] || 'var(--ink-dim)', fontWeight: 700, width: 30, flexShrink: 0 }}>
            {f.tag}
          </span>
          <span className="target-card-fire-text" style={{ fontSize: 9.5, color: 'var(--ink-mute)', lineHeight: 1.4 }}>
            {f.text}
          </span>
        </div>
      ))}
      {fires.length === 0 && <EmptyNote>No fires logged against this track.</EmptyNote>}
    </div>
  );
}

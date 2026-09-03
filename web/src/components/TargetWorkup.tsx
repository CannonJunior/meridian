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
  fmtLogTime,
  isEngageReady,
  mgrs,
  nslDistFor,
  sensorName,
  STAGES,
  threatColor,
  trkColorFor,
} from '../selectors';
import type { Approvals, Sortie, Target } from '../types';
import { orgById } from '../assets/staff';
import { hasActiveReattackRecommendation, reattackNoteFor } from '../assets/targetLists';
import RightRailResizeHandle from './RightRailResizeHandle';
import { ClickableDiv, ClickableSpan } from './Clickable';
import { APPR_DEFS, KV, KVGrid } from './cards/shared';
import ManagerHeader from './ManagerHeader';

function engageButtonProps(sel: Target, effCallsign: string, sorties: Sortie[]) {
  const ready = isEngageReady(sel);
  const engaged = sel.engagedAt != null;
  const done = sel.stage === 4;
  if (done) {
    // Phase F — an open reattack recommendation (from a sortie's own BDA,
    // not this field) keeps a "complete" target reading as unfinished
    // rather than closed out, mirroring the same fact that keeps it on
    // the HPTL (assets/targetLists.ts). Acting on it is the existing
    // REGRESS control below, not a new re-engagement path — this button
    // stays informational either way, the same as the plain-complete case.
    if (hasActiveReattackRecommendation(sel.id, sorties)) {
      return {
        label: '⚠ REATTACK RECOMMENDED',
        sub: reattackNoteFor(sel.id, sorties) || 'Open reattack call — see linked sortie BDA',
        color: C.amber,
        bg: 'rgba(255,171,56,.1)',
        border: C.amber,
        subColor: 'var(--ink-dim2)',
        cursor: 'default',
      };
    }
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
  const sorties = useStore((s) => s.sorties);
  const selectedId = useStore((s) => s.selectedId);
  const advanceStage = useStore((s) => s.advanceStage);
  const retreatStage = useStore((s) => s.retreatStage);
  const assignEffector = useStore((s) => s.assignEffector);
  const toggleAppr = useStore((s) => s.toggleAppr);
  const submitApproval = useStore((s) => s.submitApproval);
  const openChat = useStore((s) => s.openChat);
  const pendingActions = useStore((s) => s.pendingActions);
  const engage = useStore((s) => s.engage);

  const sel = targets.find((t) => t.id === selectedId) ?? targets[0];
  if (!sel)
    return (
      <div className="target-workup target-workup-empty" style={{ position: 'relative', borderLeft: '1px solid var(--hairline)', background: 'var(--panel-1)' }}>
        <RightRailResizeHandle />
      </div>
    );

  const di = decayInfo(sel.decay);
  const candidates = effFor(sel, effectors);
  const effCallsign = effName(effectors, sel.effector);
  const btn = engageButtonProps(sel, effCallsign, sorties);

  const affWash = sel.aff === 'HOS' ? 'rgba(255,90,71,.07)' : sel.aff === 'UNK' ? 'rgba(255,210,63,.06)' : 'rgba(95,227,154,.05)';
  const nsl = nslDistFor(sel);
  const approvalPending = (key: keyof Approvals) => pendingActions.find((p) => p.targetId === sel.id && p.kind === `toggleAppr:${key}` && p.status === 'pending');

  return (
    <div className="target-workup" style={{ position: 'relative', borderLeft: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <RightRailResizeHandle />
      <ManagerHeader
        className="target-workup-header"
        accentClassName="target-workup-header-accent"
        titleClassName="target-workup-title"
        accentColor="var(--amber)"
        title="TARGET WORKUP"
        titleGrow
      >
        <span className="target-workup-mode-label" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>
          TWB / SINGLE
        </span>
      </ManagerHeader>

      <div className="target-workup-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* identity header */}
        <div className="target-workup-identity" style={{ padding: '12px 14px', borderBottom: '1px solid var(--hairline)', background: `linear-gradient(180deg,${affWash},transparent)` }}>
          <div className="target-workup-identity-row" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="target-workup-identity-shape" style={{ width: 18, height: 18, background: '#0c1416', border: `2px solid ${affColor(sel.aff)}`, flexShrink: 0, boxShadow: `0 0 10px ${affColor(sel.aff)}`, ...affShapeStyle(sel.aff) }} />
            <span className="target-workup-identity-id" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '.04em', color: 'var(--ink-warm)', lineHeight: 1 }}>
              {sel.id.slice(1)}
            </span>
            <span className="target-workup-identity-name" style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: affColor(sel.aff), letterSpacing: '.06em' }}>
              {sel.name}
            </span>
          </div>
          <div className="target-workup-identity-pills" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
            <span className="target-workup-pill-aff" style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', background: affColor(sel.aff), color: '#06090a', fontWeight: 700 }}>
              {affFull(sel.aff)}
            </span>
            <span className="target-workup-pill-threat" style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', border: `1px solid ${threatColor(sel.threat)}`, color: threatColor(sel.threat), fontWeight: 700 }}>
              {sel.threat || '—'} THREAT
            </span>
            <span className="target-workup-pill-hptl" style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', border: '1px solid #2a3d3a', color: 'var(--ink-mute)' }}>
              HPTL #{sel.pri ?? '—'}
            </span>
            {sel.nsl && (
              <span className="target-workup-pill-nsl" style={{ fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>
                ⚠ NSL PROXIMITY
              </span>
            )}
          </div>
        </div>

        {/* identification */}
        <div className="target-workup-identification" style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>
            ▸ IDENTIFICATION
          </div>
          <KVGrid>
            <KV label="TYPE" value={sel.type} />
            <KV label="CATEGORY" value={catFull(sel.cat)} />
            <KV label="SIDC" value={sel.sidc} color="var(--ink-mute)" fontSize={10} />
            <KV label="CLASSIFIED BY" value={sensorName(sensors, sel.custody)} color="var(--cyan)" />
          </KVGrid>
          <div className="target-workup-confidence" style={{ marginTop: 10 }}>
            <div className="target-workup-confidence-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
              <span className="target-workup-confidence-label" style={{ letterSpacing: '.1em' }}>
                CLASSIFICATION CONFIDENCE
              </span>
              <span className="target-workup-confidence-value" style={{ color: confColor(sel.conf), fontWeight: 600 }}>
                {sel.conf}%
              </span>
            </div>
            <div className="target-workup-confidence-track" style={{ height: 5, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
              <div className="target-workup-confidence-fill" style={{ height: '100%', width: `${sel.conf}%`, background: confColor(sel.conf), boxShadow: `0 0 6px ${confColor(sel.conf)}` }} />
            </div>
          </div>
        </div>

        {/* kinematics */}
        <div className="target-workup-kinematics" style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div className="target-workup-kinematics-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)' }}>
              ▸ TRACK / KINEMATICS
            </span>
            <span className="target-workup-decay-label" style={{ fontSize: 9, color: di.color, fontWeight: 600, letterSpacing: '.06em' }}>
              ▲ {di.label}
            </span>
          </div>
          <div className="target-workup-kinematics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['GRID (MGRS)', mgrs(sel)],
              ['ELEV', sel.elev],
              ['COURSE', sel.speed > 0 ? `${String(sel.course).padStart(3, '0')}°` : 'STATIC'],
              ['SPEED', sel.speed > 0 ? `${sel.speed} KT` : '0 KT'],
            ].map(([label, val]) => (
              <div key={label} className="target-workup-kinematics-cell" style={{ border: '1px solid var(--hairline-subtle2)', padding: '7px 8px' }}>
                <div className="target-workup-kinematics-cell-label" style={{ fontSize: 8.5, letterSpacing: '.12em', color: 'var(--ink-faint)' }}>
                  {label}
                </div>
                <div className="target-workup-kinematics-cell-value" style={{ fontSize: 11, color: 'var(--ink-bright)', marginTop: 3 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
          <div className="target-workup-track-quality" style={{ marginTop: 9 }}>
            <div className="target-workup-track-quality-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
              <span className="target-workup-track-quality-label" style={{ letterSpacing: '.1em' }}>
                TRACK QUALITY
              </span>
              <span className="target-workup-track-quality-value" style={{ color: trkColorFor(sel.trkQ), fontWeight: 600 }}>
                TQ {sel.trkQ}
              </span>
            </div>
            <div className="target-workup-track-quality-track" style={{ height: 5, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
              <div className="target-workup-track-quality-fill" style={{ height: '100%', width: `${sel.trkQ}%`, background: trkColorFor(sel.trkQ) }} />
            </div>
          </div>
        </div>

        {/* lifecycle */}
        <div className="target-workup-lifecycle" style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>
            ▸ TARGET LIFECYCLE
          </div>
          <div className="target-workup-lifecycle-stages" style={{ display: 'flex', alignItems: 'stretch', gap: 3 }}>
            {STAGES.map((st, idx) => (
              <div key={st.key} className="target-workup-lifecycle-stage" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div className="target-workup-lifecycle-stage-bar" style={{ width: '100%', height: 4, background: idx <= sel.stage ? st.color : '#16201f' }} />
                <div
                  className="target-workup-lifecycle-stage-label"
                  style={{ fontSize: 7.5, letterSpacing: '.04em', color: idx === sel.stage ? st.color : idx < sel.stage ? 'var(--ink-mute)' : '#46554f', textAlign: 'center', fontWeight: idx === sel.stage ? 700 : 400 }}
                >
                  {st.name}
                </div>
              </div>
            ))}
          </div>
          <div className="target-workup-lifecycle-controls" style={{ display: 'flex', gap: 7, marginTop: 11 }}>
            <ClickableDiv
              className="target-workup-regress-button"
              onClick={retreatStage}
              style={{ flex: 1, textAlign: 'center', padding: 6, border: '1px solid #2a3d3a', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', color: 'var(--ink-mute)', cursor: 'pointer', fontWeight: 600 }}
            >
              ◂ REGRESS
            </ClickableDiv>
            <ClickableDiv
              className="target-workup-advance-button"
              onClick={advanceStage}
              style={{ flex: 1, textAlign: 'center', padding: 6, border: '1px solid var(--amber)', background: 'rgba(255,171,56,.1)', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700 }}
            >
              ADVANCE ▸
            </ClickableDiv>
          </div>
        </div>

        {/* effector pairing */}
        <div className="target-workup-effector-pairing" style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div className="target-workup-effector-pairing-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)' }}>
              ▸ EFFECTOR PAIRING · AGM
            </span>
            <span className="target-workup-effector-pairing-columns" style={{ fontSize: 8.5, color: 'var(--ink-faint)' }}>
              PK / TOT / RANGE
            </span>
          </div>
          <div className="target-workup-effector-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((x, idx) => {
              const pkPct = Math.round(x.pk * 100);
              const pkColor = x.pk >= 0.7 ? C.green : x.pk >= 0.5 ? C.amber : C.red;
              const recommended = !x.assigned && idx === 0 && x.suited;
              const border = x.assigned ? C.green : recommended ? '#5a4420' : 'var(--hairline-subtle)';
              const bg = x.assigned ? 'rgba(95,227,154,.07)' : 'var(--panel-3)';
              const dot = x.data.kinetic ? (x.data.status === 'AIRBORNE' ? C.green : x.data.status === 'ON STATION' ? C.cyan : C.amber) : C.blue;
              return (
                <ClickableDiv key={x.data.id} className="target-workup-effector-row" onClick={() => assignEffector(x.data.id)} style={{ border: `1px solid ${border}`, background: bg, padding: '8px 9px', cursor: 'pointer', position: 'relative' }}>
                  <div className="target-workup-effector-row-header" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className="target-workup-effector-dot" style={{ width: 7, height: 7, background: dot, flexShrink: 0, ...(x.data.stealth ? { transform: 'rotate(45deg)' } : {}) }} />
                    <span className="target-workup-effector-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-brighter)' }}>
                      {x.data.callsign}
                    </span>
                    <span className="target-workup-effector-platform" style={{ fontSize: 9.5, color: 'var(--ink-mute2)' }}>
                      {x.data.platform}
                    </span>
                    <span className="target-workup-effector-spacer" style={{ flex: 1 }} />
                    {recommended && (
                      <span className="target-workup-effector-rec-pill" style={{ fontSize: 7.5, letterSpacing: '.08em', padding: '1px 5px', background: 'var(--amber)', color: '#06090a', fontWeight: 700 }}>
                        REC
                      </span>
                    )}
                    {x.assigned && (
                      <span className="target-workup-effector-paired-pill" style={{ fontSize: 7.5, letterSpacing: '.08em', padding: '1px 5px', background: 'var(--green)', color: '#06090a', fontWeight: 700 }}>
                        PAIRED
                      </span>
                    )}
                  </div>
                  <div className="target-workup-effector-weapon-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span className="target-workup-effector-weapon" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                      {x.data.weapon}
                    </span>
                    <span className="target-workup-effector-spacer" style={{ flex: 1 }} />
                    <span className="target-workup-effector-range" style={{ fontSize: 9, color: x.inRange ? C.green : C.red }}>
                      {x.inRange ? `IN RANGE · ${x.data.rng}NM` : 'OUT OF RANGE'}
                    </span>
                  </div>
                  <div className="target-workup-effector-pk-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                    <span className="target-workup-effector-pk-label" style={{ fontSize: 8, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
                      PK
                    </span>
                    <div className="target-workup-effector-pk-track" style={{ width: 54, height: 4, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
                      <div className="target-workup-effector-pk-fill" style={{ height: '100%', width: `${pkPct}%`, background: pkColor }} />
                    </div>
                    <span className="target-workup-effector-pk-value" style={{ fontSize: 9, color: pkColor, fontWeight: 600 }}>
                      {x.pk.toFixed(2)}
                    </span>
                    <span className="target-workup-effector-spacer" style={{ flex: 1 }} />
                    <span className="target-workup-effector-tot" style={{ fontSize: 9, color: 'var(--ink-dim2)' }}>
                      TOT {x.data.tot}m
                    </span>
                  </div>
                </ClickableDiv>
              );
            })}
          </div>
        </div>

        {/* weaponeering */}
        <div className="target-workup-weaponeering" style={{ padding: '11px 14px', borderBottom: '1px solid #131e1d' }}>
          <div className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>
            ▸ WEAPONEERING / CDE
          </div>
          <KVGrid>
            <KV label="METHOD" value={sel.method} />
            <KV label="CDE LEVEL" value={sel.cde} color={cdeColorFor(sel.cde)} fontWeight={600} />
            <KV label="NO-STRIKE PROX" value={nsl.label} color={nsl.color} />
          </KVGrid>
        </div>

        {/* engagement authorization */}
        <div className="target-workup-authorization" style={{ padding: '11px 14px' }}>
          <div className="target-workup-section-label" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-faint)', marginBottom: 9 }}>
            ▸ ENGAGEMENT AUTHORIZATION
          </div>
          <div className="target-workup-authorization-list" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {APPR_DEFS.map((a) => {
              const on = sel.appr[a.k];
              const pending = approvalPending(a.k);
              const pendingOrg = pending ? orgById(pending.orgId) : undefined;
              const boxColor = pending ? 'var(--amber)' : on ? C.green : 'var(--ink-faint)';
              return (
                <ClickableDiv
                  key={a.k}
                  className="target-workup-authorization-row"
                  onClick={() => {
                    if (pending) return;
                    if (!on) submitApproval(a.k, sel.id);
                    else toggleAppr(a.k, sel.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '6px 8px',
                    border: `1px solid ${pending ? '#5a4420' : on ? '#244536' : 'var(--hairline-mid)'}`,
                    background: pending ? 'rgba(255,171,56,.06)' : on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)',
                    cursor: pending ? 'default' : 'pointer',
                  }}
                >
                  <span className="target-workup-authorization-checkbox" style={{ width: 14, height: 14, border: `1.5px solid ${boxColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: boxColor, fontWeight: 700, flexShrink: 0 }}>
                    {pending ? '…' : on ? '✓' : ''}
                  </span>
                  <span className="target-workup-authorization-label" style={{ fontSize: 10.5, color: 'var(--ink)', letterSpacing: '.04em', flex: 1 }}>
                    {a.l}
                  </span>
                  <span className="target-workup-authorization-status" style={{ fontSize: 8.5, letterSpacing: '.08em', color: pending ? 'var(--amber)' : on ? C.green : C.amber, fontWeight: 600 }}>
                    {pending ? `${pendingOrg?.acronym ?? pending.orgId.toUpperCase()} · ${fmtLogTime(pending.adjudicationDueAt)}` : on ? 'MET' : 'PENDING'}
                  </span>
                  {pending && (
                    <ClickableSpan
                      className="target-workup-authorization-discuss-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openChat(pending.orgId, sel.id);
                      }}
                      style={{ fontSize: 8, letterSpacing: '.04em', color: 'var(--red)', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
                    >
                      ▸ DISCUSS
                    </ClickableSpan>
                  )}
                </ClickableDiv>
              );
            })}
          </div>
          <ClickableDiv className="target-workup-engage-button" onClick={engage} style={{ marginTop: 11, textAlign: 'center', padding: 13, border: `1.5px solid ${btn.border}`, background: btn.bg, cursor: btn.cursor, position: 'relative', overflow: 'hidden' }}>
            <div className="target-workup-engage-button-label" style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '.18em', color: btn.color }}>
              {btn.label}
            </div>
            <div className="target-workup-engage-button-sub" style={{ fontSize: 8.5, letterSpacing: '.14em', color: btn.subColor, marginTop: 4 }}>
              {btn.sub}
            </div>
          </ClickableDiv>
        </div>
      </div>
    </div>
  );
}

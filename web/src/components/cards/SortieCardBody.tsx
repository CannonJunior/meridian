import { useStore } from '../../store';
import { atoDayFor, atoDayPhaseLabel, fmtSortieTime, sortieStatusColor } from '../../selectors';
import type { BdaPhaseStatus } from '../../types';
import { EmptyNote, KV, KVGrid, SectionLabel } from './shared';
import { ClickableDiv } from '../Clickable';

const BDA_PHASE_COLOR: Record<BdaPhaseStatus, string> = {
  PENDING: 'var(--ink-faint)',
  ASSESSED: 'var(--green)',
  INCONCLUSIVE: 'var(--yellow)',
};

function BdaPhaseChip({ label, status }: { label: string; status: BdaPhaseStatus }) {
  const color = BDA_PHASE_COLOR[status];
  return (
    <div className="sortie-card-bda-phase-chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, border: `1px solid ${color}`, padding: '7px 6px' }}>
      <span className="sortie-card-bda-phase-chip-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
        {label}
      </span>
      <span className="sortie-card-bda-phase-chip-status" style={{ fontSize: 9.5, fontWeight: 700, color, letterSpacing: '.04em' }}>
        {status}
      </span>
    </div>
  );
}

export default function SortieCardBody({ id, tab }: { id: string; tab: number }) {
  const sorties = useStore((s) => s.sorties);
  const targets = useStore((s) => s.targets);
  const openEntity = useStore((s) => s.openEntity);

  const sortie = sorties.find((s) => s.id === id);
  if (!sortie) return null;

  if (tab === 0) {
    const day = atoDayFor(sortie.totWindowStart);
    return (
      <>
        <KVGrid>
          <KV label="CALLSIGN" value={sortie.callsign} />
          <KV label="PLATFORM" value={sortie.platform} />
          <KV label="MISSION TYPE" value={sortie.missionType} color="var(--cyan)" />
          <KV label="PACKAGE" value={sortie.packageId ?? '— UNPACKAGED —'} />
          <KV label="STATUS" value={sortie.status} color={sortieStatusColor(sortie.status)} />
          <KV label="ATO DAY" value={`${day} · ${atoDayPhaseLabel(day)}`} />
          <KV label="TOT WINDOW" value={`${fmtSortieTime(sortie.totWindowStart)} – ${fmtSortieTime(sortie.totWindowEnd)}`} color="var(--ink-bright)" />
        </KVGrid>
        <div
          className="sortie-card-status-box"
          style={{ marginTop: 14, padding: '9px 10px', border: `1px solid ${sortieStatusColor(sortie.status)}`, background: 'rgba(255,255,255,.02)' }}
        >
          <div className="sortie-card-status-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sortie-card-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: sortieStatusColor(sortie.status), boxShadow: `0 0 6px ${sortieStatusColor(sortie.status)}` }} />
            <span className="sortie-card-status-label" style={{ fontSize: 9, letterSpacing: '.12em', color: sortieStatusColor(sortie.status), fontWeight: 600 }}>
              {sortie.status}
            </span>
          </div>
          <div className="sortie-card-status-note" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 6, lineHeight: 1.5 }}>
            {sortie.linkedPlatformId
              ? `Tail also tracked live as ${sortie.linkedPlatformId} — see this sortie's LINKAGE tab or that entity's own card.`
              : 'No live Effector/Sensor entity tracks this tail yet.'}
          </div>
        </div>
      </>
    );
  }

  if (tab === 1) {
    const linkedTargets = sortie.targetIds.map((tid) => targets.find((t) => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    const supported = sortie.supportedSortieIds.map((sid) => sorties.find((s) => s.id === sid)).filter((s): s is NonNullable<typeof s> => s != null);
    return (
      <>
        <SectionLabel>LINKED TARGETS</SectionLabel>
        <div className="sortie-card-target-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linkedTargets.map((t) => (
            <ClickableDiv key={t.id} className="sortie-card-target-row" onClick={() => openEntity('target', t.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: 'pointer' }}>
              <span className="sortie-card-target-row-id" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink-brighter)' }}>
                {t.id.slice(1)}
              </span>
              <span className="sortie-card-target-row-name" style={{ fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>
                {t.name} · {t.type}
              </span>
            </ClickableDiv>
          ))}
          {sortie.targetIds.length === 0 && <EmptyNote>No targets linked — {sortie.missionType} sorties task against supported sorties or a collection requirement instead (see below).</EmptyNote>}
        </div>

        <SectionLabel top={16}>SUPPORTS</SectionLabel>
        <div className="sortie-card-supported-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {supported.map((s) => (
            <ClickableDiv key={s.id} className="sortie-card-supported-row" onClick={() => openEntity('sortie', s.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: 'pointer' }}>
              <span className="sortie-card-supported-row-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
                {s.callsign}
              </span>
              <span className="sortie-card-supported-row-mission-type" style={{ fontSize: 9.5, color: 'var(--cyan)' }}>
                {s.missionType}
              </span>
            </ClickableDiv>
          ))}
          {sortie.supportedSortieIds.length === 0 && <EmptyNote>Not in support of another sortie.</EmptyNote>}
        </div>

        <SectionLabel top={16}>COLLECTION REQUIREMENTS</SectionLabel>
        <div className="sortie-card-collection-requirement-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sortie.collectionRequirementIds.map((cid) => (
            <div key={cid} className="sortie-card-collection-requirement-row" style={{ border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', fontSize: 10, color: 'var(--ink-mute)' }}>
              {cid}
            </div>
          ))}
          {sortie.collectionRequirementIds.length === 0 && <EmptyNote>No collection requirement tasked.</EmptyNote>}
        </div>
        {sortie.collectionRequirementIds.length > 0 && (
          <div className="sortie-card-collection-requirement-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 10, lineHeight: 1.5 }}>
            ▸ CPCL/JIPCL ids don't resolve to a collection-requirement list yet — that's Phase E.
          </div>
        )}
      </>
    );
  }

  if (tab === 2) {
    return (
      <>
        <SectionLabel>ROUTE</SectionLabel>
        <div className="sortie-card-route-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--hairline-mid)', background: 'var(--panel-3)', padding: '11px 12px' }}>
          <div className="sortie-card-route-origin" style={{ flex: 1 }}>
            <div className="sortie-card-route-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              ORIGIN
            </div>
            <div className="sortie-card-route-value" style={{ fontSize: 11, color: 'var(--ink-bright)', marginTop: 3 }}>
              {sortie.originAirfield}
            </div>
          </div>
          <span className="sortie-card-route-arrow" style={{ color: 'var(--ink-faint)', fontSize: 14 }}>
            →
          </span>
          <div className="sortie-card-route-recovery" style={{ flex: 1, textAlign: 'right' }}>
            <div className="sortie-card-route-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              RECOVERY
            </div>
            <div className="sortie-card-route-value" style={{ fontSize: 11, color: 'var(--ink-bright)', marginTop: 3 }}>
              {sortie.recoveryAirfield}
            </div>
          </div>
        </div>
        <div className="sortie-card-route-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 10, lineHeight: 1.5 }}>
          ▸ Display names only — not yet bound to real airfield features or a flight-line on the map. That's Phase C.
        </div>
      </>
    );
  }

  // BDA
  return (
    <>
      <SectionLabel>COMBAT ASSESSMENT</SectionLabel>
      {sortie.targetIds.length === 0 && <EmptyNote>Not applicable — this sortie has no linked targets.</EmptyNote>}
      {sortie.targetIds.length > 0 && !sortie.bda && <EmptyNote>BDA pending — sortie not yet reported complete.</EmptyNote>}
      {sortie.targetIds.length > 0 &&
        sortie.bda &&
        sortie.targetIds.map((tid) => {
          const t = targets.find((x) => x.id === tid);
          const b = sortie.bda?.[tid];
          if (!b) return <EmptyNote key={tid}>BDA pending for {t ? t.name : tid}.</EmptyNote>;
          return (
            <div key={tid} className="sortie-card-bda-target-block" style={{ marginBottom: 14 }}>
              <div className="sortie-card-bda-target-name" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-bright)', marginBottom: 7 }}>
                {t ? `${t.id.slice(1)} · ${t.name}` : tid}
              </div>
              <div className="sortie-card-bda-phase-row" style={{ display: 'flex', gap: 6 }}>
                <BdaPhaseChip label="PDA" status={b.pda} />
                <BdaPhaseChip label="FDA" status={b.fda} />
                <BdaPhaseChip label="TSA" status={b.tsa} />
              </div>
              {b.reattackRecommended && (
                <div className="sortie-card-bda-reattack-flag" style={{ marginTop: 7, fontSize: 9, letterSpacing: '.06em', color: 'var(--red)', fontWeight: 700 }}>
                  ⚠ REATTACK RECOMMENDED
                </div>
              )}
              {b.note && (
                <div className="sortie-card-bda-note" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 7, lineHeight: 1.5 }}>
                  {b.note}
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

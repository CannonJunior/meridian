import { useMemo } from 'react';
import { useStore } from '../store';
import { ATO_DAYS, atoDayFor, atoDayPhaseColor, atoDayPhaseLabel, fmtSortieTime, sortieStatusColor } from '../selectors';
import type { AtoDay, Sortie, SortieMissionType } from '../types';

const GRID_COLS = '78px 96px 84px 84px 1fr 96px';

function DayCell({ day, count, selected, onClick }: { day: AtoDay; count: number; selected: boolean; onClick: () => void }) {
  const color = atoDayPhaseColor(day);
  return (
    <div
      className="ato-manager-day-cell"
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 4px',
        cursor: 'pointer',
        border: `1px solid ${selected ? color : 'var(--hairline-mid)'}`,
        background: selected ? `${color}1c` : 'var(--panel-3)',
      }}
    >
      <span className="ato-manager-day-cell-label" style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: day === 'D0' ? 'var(--ink-bright)' : 'var(--ink-mute)', letterSpacing: '.04em' }}>
        {day}
      </span>
      <span className="ato-manager-day-cell-phase" style={{ fontSize: 7.5, letterSpacing: '.08em', color, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
        {atoDayPhaseLabel(day)}
      </span>
      <span className="ato-manager-day-cell-count" style={{ fontSize: 9.5, color: 'var(--ink-dim2)', fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </span>
    </div>
  );
}

function MissionTypeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span
      className="ato-manager-mission-type-chip"
      onClick={onClick}
      style={{
        fontSize: 9,
        letterSpacing: '.06em',
        padding: '3px 8px',
        border: `1px solid ${active ? 'var(--amber)' : 'var(--hairline-mid)'}`,
        background: active ? 'rgba(255,171,56,.12)' : 'transparent',
        color: active ? 'var(--amber)' : 'var(--ink-mute)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function SortieRow({ sortie, selected, onClick }: { sortie: Sortie; selected: boolean; onClick: () => void }) {
  const color = sortieStatusColor(sortie.status);
  return (
    <div
      className="ato-manager-sortie-row"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        gap: 6,
        padding: '6px 12px',
        borderBottom: '1px solid #0e1716',
        cursor: 'pointer',
        alignItems: 'center',
        background: selected ? 'rgba(255,171,56,.07)' : 'transparent',
        borderLeft: `2px solid ${selected ? 'var(--amber)' : 'transparent'}`,
      }}
    >
      <span className="ato-manager-sortie-row-tot" style={{ fontSize: 10, color: 'var(--ink-mute)', fontVariantNumeric: 'tabular-nums' }}>
        {fmtSortieTime(sortie.totWindowStart)}
      </span>
      <span className="ato-manager-sortie-row-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)' }}>
        {sortie.callsign}
      </span>
      <span className="ato-manager-sortie-row-mission-type" style={{ fontSize: 9.5, color: 'var(--cyan)', fontWeight: 600 }}>
        {sortie.missionType}
      </span>
      <span className="ato-manager-sortie-row-package" style={{ fontSize: 9.5, color: 'var(--ink-dim2)' }}>
        {sortie.packageId ? `PKG ${sortie.packageId}` : '—'}
      </span>
      <span className="ato-manager-sortie-row-platform" style={{ fontSize: 9.5, color: 'var(--ink-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sortie.platform}
      </span>
      <span className="ato-manager-sortie-row-status" style={{ fontSize: 8.5, letterSpacing: '.04em', color, fontWeight: 600, textAlign: 'right' }}>
        {sortie.status}
      </span>
    </div>
  );
}

export default function AtoManager() {
  const sorties = useStore((s) => s.sorties);
  const selectedAtoDay = useStore((s) => s.selectedAtoDay);
  const setSelectedAtoDay = useStore((s) => s.setSelectedAtoDay);
  const sortieMissionTypeFilter = useStore((s) => s.sortieMissionTypeFilter);
  const setSortieMissionTypeFilter = useStore((s) => s.setSortieMissionTypeFilter);
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const openEntity = useStore((s) => s.openEntity);

  // AtoManager also re-renders on cardKind/cardId changes anywhere in the
  // app (for its own selection highlighting below), not just on sortie/day/
  // filter changes — without memoizing here, every one of those unrelated
  // re-renders redid this whole day-count + filter + sort chain from
  // scratch, even while this panel isn't the active manager.
  const dayCounts = useMemo(
    () => Object.fromEntries(ATO_DAYS.map((d) => [d, sorties.filter((s) => atoDayFor(s.totWindowStart) === d).length])) as Record<AtoDay, number>,
    [sorties],
  );
  const sortiesForDay = useMemo(() => sorties.filter((s) => atoDayFor(s.totWindowStart) === selectedAtoDay), [sorties, selectedAtoDay]);
  const missionTypesToday = useMemo(() => Array.from(new Set(sortiesForDay.map((s) => s.missionType))) as SortieMissionType[], [sortiesForDay]);
  const visibleSorties = useMemo(
    () =>
      sortiesForDay
        .filter((s) => sortieMissionTypeFilter === 'ALL' || s.missionType === sortieMissionTypeFilter)
        .slice()
        .sort((a, b) => a.totWindowStart.localeCompare(b.totWindowStart)),
    [sortiesForDay, sortieMissionTypeFilter],
  );

  return (
    <div className="ato-manager" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--hairline)', overflow: 'hidden', background: 'var(--panel-1)' }}>
      <div className="ato-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="ato-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />
        <span className="ato-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--amber)', fontWeight: 600 }}>
          AIR TASKING
        </span>
        <span className="ato-manager-header-spacer" style={{ flex: 1 }} />
        <span className="ato-manager-header-summary" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.08em' }}>
          {sortiesForDay.length} SORTIES · {selectedAtoDay}
        </span>
      </div>

      <div className="ato-manager-timeline-strip" style={{ display: 'flex', gap: 4, padding: '10px 10px 8px' }}>
        {ATO_DAYS.map((d) => (
          <DayCell key={d} day={d} count={dayCounts[d]} selected={d === selectedAtoDay} onClick={() => setSelectedAtoDay(d)} />
        ))}
      </div>

      <div className="ato-manager-mission-type-filter-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 12px 10px', borderBottom: '1px solid #131e1d' }}>
        <MissionTypeChip label="ALL" active={sortieMissionTypeFilter === 'ALL'} onClick={() => setSortieMissionTypeFilter('ALL')} />
        {missionTypesToday.map((mt) => (
          <MissionTypeChip key={mt} label={mt} active={sortieMissionTypeFilter === mt} onClick={() => setSortieMissionTypeFilter(mt)} />
        ))}
      </div>

      <div className="ato-manager-column-headers" style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 6, padding: '6px 12px', borderBottom: '1px solid #131e1d', fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
        <span className="ato-manager-column-header">TOT</span>
        <span className="ato-manager-column-header">CALLSIGN</span>
        <span className="ato-manager-column-header">TYPE</span>
        <span className="ato-manager-column-header">PACKAGE</span>
        <span className="ato-manager-column-header">PLATFORM</span>
        <span className="ato-manager-column-header" style={{ textAlign: 'right' }}>
          STATUS
        </span>
      </div>

      <div className="ato-manager-sortie-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {visibleSorties.length === 0 && (
          <div className="ato-manager-empty" style={{ padding: '18px 12px', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.08em', textAlign: 'center' }}>
            NO SORTIES {sortieMissionTypeFilter === 'ALL' ? 'THIS DAY' : `OF THIS TYPE ON ${selectedAtoDay}`}
          </div>
        )}
        {visibleSorties.map((s) => (
          <SortieRow key={s.id} sortie={s} selected={cardKind === 'sortie' && cardId === s.id} onClick={() => openEntity('sortie', s.id)} />
        ))}
      </div>
    </div>
  );
}

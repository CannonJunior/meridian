import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';
import { C, DOMAIN_META, DOMAINS, domainForSensor, domainForTarget, domainForUnit, fmtSortieTime } from '../selectors';
import type { Domain } from '../types';
import { entityStatesAtTime, extentOfFeatures, groupByEntity, MAX_TIMELAPSE_FEATURES, TIMELAPSE_LAYER_BY_DOMAIN } from '../timelapse';
import type { EntityState, TimelapseLayerId } from '../timelapse';
import { ClickableDiv, ClickableSpan } from './Clickable';

const AFFILIATION_OPTIONS = ['ANY', 'HOS', 'UNK', 'FRD', 'NEU'] as const;
const SPEED_OPTIONS = [1, 5, 15, 60] as const;

function affiliationColor(a: string | null): string {
  return a === 'HOS' ? C.red : a === 'UNK' ? C.yellow : a === 'FRD' ? C.cyan : a === 'NEU' ? C.green : C.dim;
}

function msFromIso(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="layer-manager-timelapse-field-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)', display: 'block', marginBottom: 3 }}>
      {children}
    </span>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--panel-1)',
  border: '1px solid var(--hairline-mid)',
  color: 'var(--ink-bright)',
  fontSize: 10,
  padding: '5px 7px',
  fontFamily: 'var(--font-mono)',
  boxSizing: 'border-box',
};

function EntityRow({ e }: { e: EntityState }) {
  const color = affiliationColor(e.current.affiliation);
  return (
    <div
      className="layer-manager-timelapse-entity-row"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid #0e1716' }}
    >
      <span className="layer-manager-timelapse-entity-row-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
      <span className="layer-manager-timelapse-entity-row-name" style={{ fontSize: 10, color: 'var(--ink-bright)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {e.name}
      </span>
      <span className="layer-manager-timelapse-entity-row-kind" style={{ fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
        {e.entityKind.toUpperCase()}
      </span>
      <span className="layer-manager-timelapse-entity-row-speed" style={{ fontSize: 8.5, color: 'var(--ink-dim2)', fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }}>
        {e.current.speedKn != null ? `${e.current.speedKn.toFixed(0)} KN` : '—'}
      </span>
    </div>
  );
}

// Playback ticking lives here (component-owned side effect over
// store-owned data), the same split LayerFilterInput's debounce effect
// uses — the store has no mechanism of its own for a repeating timer, and
// nothing outside this panel needs to observe "is a tick due." Scoped to
// one layerId: TimelapseControls mounts one of these per expanded domain,
// so AIR and MARITIME playing simultaneously run two independent
// intervals, each only ever touching its own layer's slot.
function usePlaybackTick(layerId: TimelapseLayerId) {
  const playing = useStore((s) => s.timelapseByLayer[layerId].playing);
  const speedMinPerSec = useStore((s) => s.timelapseByLayer[layerId].speedMinPerSec);
  const cursor = useStore((s) => s.timelapseByLayer[layerId].cursor);
  const timeEnd = useStore((s) => s.timelapseByLayer[layerId].filter.timeEnd);
  const setTimelapseCursor = useStore((s) => s.setTimelapseCursor);
  const setTimelapsePlaying = useStore((s) => s.setTimelapsePlaying);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || cursor == null) {
      lastTickRef.current = null;
      return;
    }
    const TICK_MS = 200;
    const id = setInterval(() => {
      const now = performance.now();
      const elapsedMs = lastTickRef.current == null ? TICK_MS : now - lastTickRef.current;
      lastTickRef.current = now;
      const current = useStore.getState().timelapseByLayer[layerId].cursor;
      if (current == null) return;
      const nextMs = msFromIso(current) + speedMinPerSec * 60_000 * (elapsedMs / 1000);
      const endMs = msFromIso(timeEnd);
      if (nextMs >= endMs) {
        setTimelapseCursor(layerId, new Date(endMs).toISOString());
        setTimelapsePlaying(layerId, false);
      } else {
        setTimelapseCursor(layerId, new Date(nextMs).toISOString());
      }
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, playing, speedMinPerSec, timeEnd]);
}

// The timelapse query-builder/playback controls for one layer, nested
// inside its domain's expanded TIMELAPSE row (see DomainSection below).
// One of these is mounted per expanded domain that has a layer — AIR's and
// MARITIME's are two fully independent instances, each reading and writing
// only its own slot of timelapseByLayer[layerId], which is what keeps
// expanding/loading/playing one from ever affecting the other.
function TimelapseControls({ layerId }: { layerId: TimelapseLayerId }) {
  const timelapse = useStore((s) => s.timelapseByLayer[layerId]);
  const setTimelapseFilter = useStore((s) => s.setTimelapseFilter);
  const previewTimelapseCount = useStore((s) => s.previewTimelapseCount);
  const loadTimelapseFeatures = useStore((s) => s.loadTimelapseFeatures);
  const setTimelapseCursor = useStore((s) => s.setTimelapseCursor);
  const setTimelapsePlaying = useStore((s) => s.setTimelapsePlaying);
  const setTimelapseSpeed = useStore((s) => s.setTimelapseSpeed);
  const requestTimelapseBboxFromView = useStore((s) => s.requestTimelapseBboxFromView);
  const clearTimelapseBbox = useStore((s) => s.clearTimelapseBbox);

  usePlaybackTick(layerId);

  const { filter, features, loading, error, previewCount, previewing, truncated, cursor, playing, speedMinPerSec } = timelapse;

  // Split the same way TimelapseMapLayer's does — `grouped` only rebuilds
  // when `features` changes (once per Load), not on every 200ms playback
  // tick, which is what `cursor` alone changing would otherwise trigger.
  const grouped = useMemo(() => groupByEntity(features), [features]);
  const visible = useMemo(
    () => (cursor ? entityStatesAtTime(grouped, cursor).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [grouped, cursor],
  );

  const startMs = msFromIso(filter.timeStart);
  const endMs = msFromIso(filter.timeEnd);
  const cursorMs = cursor ? msFromIso(cursor) : startMs;

  return (
    <div className="layer-manager-timelapse-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {features.length > 0 && (
        <div className="layer-manager-timelapse-summary" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.08em' }}>
          {visible.length} VISIBLE · {features.length} LOADED
        </div>
      )}

      <div className="layer-manager-timelapse-filter-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-time-start">
          <FieldLabel>TIME START (UTC)</FieldLabel>
          <input
            className="layer-manager-timelapse-field-time-start-input"
            style={inputStyle}
            value={filter.timeStart}
            onChange={(e) => setTimelapseFilter(layerId, { timeStart: e.target.value })}
            placeholder="2026-08-20T08:00:00Z"
          />
        </div>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-time-end">
          <FieldLabel>TIME END (UTC)</FieldLabel>
          <input
            className="layer-manager-timelapse-field-time-end-input"
            style={inputStyle}
            value={filter.timeEnd}
            onChange={(e) => setTimelapseFilter(layerId, { timeEnd: e.target.value })}
            placeholder="2026-08-21T00:00:00Z"
          />
        </div>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-entity-kind">
          <FieldLabel>ENTITY KIND</FieldLabel>
          <input
            className="layer-manager-timelapse-field-entity-kind-input"
            style={inputStyle}
            value={filter.entityKind ?? ''}
            onChange={(e) => setTimelapseFilter(layerId, { entityKind: e.target.value || undefined })}
            placeholder="vessel, aircraft…"
          />
        </div>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-affiliation">
          <FieldLabel>AFFILIATION</FieldLabel>
          <select
            className="layer-manager-timelapse-field-affiliation-select"
            style={inputStyle}
            value={filter.affiliation ?? 'ANY'}
            onChange={(e) => setTimelapseFilter(layerId, { affiliation: e.target.value === 'ANY' ? undefined : e.target.value })}
          >
            {AFFILIATION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-speed-min">
          <FieldLabel>SPEED MIN (KN)</FieldLabel>
          <input
            className="layer-manager-timelapse-field-speed-min-input"
            type="number"
            style={inputStyle}
            value={filter.speedMin ?? ''}
            onChange={(e) => setTimelapseFilter(layerId, { speedMin: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
        <div className="layer-manager-timelapse-field layer-manager-timelapse-field-speed-max">
          <FieldLabel>SPEED MAX (KN)</FieldLabel>
          <input
            className="layer-manager-timelapse-field-speed-max-input"
            type="number"
            style={inputStyle}
            value={filter.speedMax ?? ''}
            onChange={(e) => setTimelapseFilter(layerId, { speedMax: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="layer-manager-timelapse-field layer-manager-timelapse-field-bbox">
        <FieldLabel>MAP AREA</FieldLabel>
        {filter.bbox ? (
          <div className="layer-manager-timelapse-bbox-summary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="layer-manager-timelapse-bbox-summary-text" style={{ fontSize: 9.5, color: 'var(--ink-mute)', letterSpacing: '.02em', flex: 1, fontVariantNumeric: 'tabular-nums' }}>
              {filter.bbox.south.toFixed(2)}, {filter.bbox.west.toFixed(2)} — {filter.bbox.north.toFixed(2)}, {filter.bbox.east.toFixed(2)}
            </span>
            <ClickableSpan
              className="layer-manager-timelapse-bbox-update-button"
              onClick={() => requestTimelapseBboxFromView(layerId)}
              style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '3px 8px', border: '1px solid var(--hairline-mid)', color: 'var(--ink-mute)', cursor: 'pointer', flexShrink: 0 }}
            >
              UPDATE
            </ClickableSpan>
            <ClickableSpan
              className="layer-manager-timelapse-bbox-clear-button"
              onClick={() => clearTimelapseBbox(layerId)}
              style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '3px 8px', border: '1px solid var(--hairline-mid)', color: 'var(--amber)', cursor: 'pointer', flexShrink: 0 }}
            >
              CLEAR
            </ClickableSpan>
          </div>
        ) : (
          <ClickableSpan
            className="layer-manager-timelapse-bbox-use-view-button"
            onClick={() => requestTimelapseBboxFromView(layerId)}
            style={{
              display: 'inline-block',
              fontSize: 9.5,
              letterSpacing: '.06em',
              padding: '5px 9px',
              border: '1px solid var(--hairline-mid)',
              color: 'var(--ink-mute)',
              cursor: 'pointer',
            }}
          >
            USE CURRENT MAP VIEW
          </ClickableSpan>
        )}
      </div>

      <div className="layer-manager-timelapse-action-row" style={{ display: 'flex', gap: 8 }}>
        <button
          className="layer-manager-timelapse-preview-button"
          onClick={() => previewTimelapseCount(layerId)}
          disabled={previewing}
          style={{ flex: 1, padding: '7px 0', fontSize: 9.5, letterSpacing: '.1em', fontWeight: 700, background: 'transparent', border: '1px solid var(--hairline-mid)', color: 'var(--ink-mute)', cursor: previewing ? 'default' : 'pointer' }}
        >
          {previewing ? 'COUNTING…' : 'PREVIEW COUNT'}
        </button>
        <button
          className="layer-manager-timelapse-load-button"
          onClick={() => loadTimelapseFeatures(layerId)}
          disabled={loading}
          style={{ flex: 1, padding: '7px 0', fontSize: 9.5, letterSpacing: '.1em', fontWeight: 700, background: 'rgba(79,174,126,.12)', border: '1px solid var(--green-alt)', color: 'var(--green-alt)', cursor: loading ? 'default' : 'pointer' }}
        >
          {loading ? 'LOADING…' : 'LOAD'}
        </button>
      </div>

      {error && (
        <div className="layer-manager-timelapse-error" style={{ fontSize: 9.5, color: 'var(--red)', letterSpacing: '.04em', lineHeight: 1.4 }}>
          {error}
        </div>
      )}
      {previewCount != null && !error && (
        <div className="layer-manager-timelapse-preview-count" style={{ fontSize: 9.5, color: previewCount > MAX_TIMELAPSE_FEATURES ? 'var(--amber)' : 'var(--ink-mute)', letterSpacing: '.04em' }}>
          {previewCount.toLocaleString()} EVENT{previewCount === 1 ? '' : 'S'} MATCH
          {previewCount > MAX_TIMELAPSE_FEATURES && ` — narrow the range, only the first ${MAX_TIMELAPSE_FEATURES.toLocaleString()} will load`}
        </div>
      )}
      {truncated && (
        <div className="layer-manager-timelapse-truncated-warning" style={{ fontSize: 9.5, color: 'var(--amber)', letterSpacing: '.04em' }}>
          TRUNCATED — showing the first {MAX_TIMELAPSE_FEATURES.toLocaleString()} of {timelapse.totalMatched?.toLocaleString()} events.
        </div>
      )}

      {features.length > 0 && cursor && (
        <div className="layer-manager-timelapse-playback" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #131e1d', paddingTop: 10 }}>
          <div className="layer-manager-timelapse-playback-controls" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClickableSpan
              className="layer-manager-timelapse-play-pause-button"
              onClick={() => setTimelapsePlaying(layerId, !playing)}
              style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${playing ? 'var(--amber)' : 'var(--green-alt)'}`,
                color: playing ? 'var(--amber)' : 'var(--green-alt)',
                fontSize: 11,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {playing ? '❚❚' : '▶'}
            </ClickableSpan>
            <input
              className="layer-manager-timelapse-scrubber"
              type="range"
              min={startMs}
              max={endMs}
              value={cursorMs}
              onChange={(e) => setTimelapseCursor(layerId, new Date(Number(e.target.value)).toISOString())}
              style={{ flex: 1 }}
            />
            <span className="layer-manager-timelapse-cursor-readout" style={{ fontSize: 10, color: 'var(--ink-bright)', fontVariantNumeric: 'tabular-nums', width: 68, textAlign: 'right' }}>
              {fmtSortieTime(cursor)}
            </span>
          </div>
          <div className="layer-manager-timelapse-speed-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="layer-manager-timelapse-speed-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              SPEED
            </span>
            {SPEED_OPTIONS.map((s) => (
              <ClickableSpan
                key={s}
                className="layer-manager-timelapse-speed-chip"
                onClick={() => setTimelapseSpeed(layerId, s)}
                style={{
                  fontSize: 9,
                  letterSpacing: '.04em',
                  padding: '3px 8px',
                  border: `1px solid ${speedMinPerSec === s ? 'var(--green-alt)' : 'var(--hairline-mid)'}`,
                  color: speedMinPerSec === s ? 'var(--green-alt)' : 'var(--ink-mute)',
                  fontWeight: speedMinPerSec === s ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {s}m/s
              </ClickableSpan>
            ))}
          </div>

          <div className="layer-manager-timelapse-entity-list" style={{ border: '1px solid var(--hairline-mid)', maxHeight: 220, overflowY: 'auto' }}>
            {visible.length === 0 && (
              <div className="layer-manager-timelapse-entity-list-empty" style={{ padding: '14px 8px', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.06em', textAlign: 'center' }}>
                NO ENTITIES YET AT THIS TIME
              </div>
            )}
            {visible.map((e) => (
              <EntityRow key={e.entityId} e={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The small square glyph both SectionRow and DomainSection's own checkbox
// share — a plain on/off box, filled with `color` when checked.
function CheckboxGlyph({ checked, color }: { checked: boolean; color: string }) {
  return (
    <span
      className="layer-manager-checkbox-glyph"
      style={{
        width: 13,
        height: 13,
        border: `1.5px solid ${checked ? color : 'var(--ink-faint)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        color,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {checked ? '✓' : ''}
    </span>
  );
}

// Same glyph ObjectCard.tsx's "Center map on this object" button uses —
// duplicated locally rather than imported since that one is private to
// ObjectCard.tsx and this app's small icon components are conventionally
// kept local to whichever file renders them (see e.g. IconSidebar.tsx's
// own icon set).
// pointerEvents: 'none' on the svg is load-bearing, not decorative: without
// it, hit-testing for a click inside this glyph's box is decided shape by
// shape (each circle/line's own `fill`/stroke geometry), which is exactly
// the kind of thing that varies across browser engines for a fill:none
// ring with a transparent interior — a click that lands in the gap
// between the ring and the center dot can validly resolve to "no element
// hit" in one engine and "falls through to the ancestor" in another.
// Disabling pointer events on the whole icon makes the *wrapping button*
// the hit target for 100% of its box, unconditionally, in every browser.
function CrosshairsIcon({ color }: { color: string }) {
  return (
    <svg className="layer-manager-crosshairs-glyph" width="12" height="12" viewBox="0 0 20 20" fill="none" style={{ pointerEvents: 'none' }}>
      <circle className="layer-manager-crosshairs-glyph-ring" cx="10" cy="10" r="6" stroke={color} strokeWidth="1.6" />
      <circle className="layer-manager-crosshairs-glyph-dot" cx="10" cy="10" r="1.1" fill={color} />
      <line className="layer-manager-crosshairs-glyph-tick-top" x1="10" y1="0" x2="10" y2="2.5" stroke={color} strokeWidth="1.6" />
      <line className="layer-manager-crosshairs-glyph-tick-bottom" x1="10" y1="17.5" x2="10" y2="20" stroke={color} strokeWidth="1.6" />
      <line className="layer-manager-crosshairs-glyph-tick-left" x1="0" y1="10" x2="2.5" y2="10" stroke={color} strokeWidth="1.6" />
      <line className="layer-manager-crosshairs-glyph-tick-right" x1="17.5" y1="10" x2="20" y2="10" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

// The clickable wrapper both the LIVE TRACKS and TIMELAPSE rows' "center on
// this data" buttons use. A real <button>, not a styled <span> — buttons
// get correct default hit-testing/focus/keyboard-activation from the
// browser for free, instead of depending on this app re-deriving all of
// that from a div's onClick. onPointerDown's stopPropagation matches
// ObjectCard.tsx's own crosshairs button precedent: without it, the
// pointerdown half of the click can still reach the row's own handler
// underneath on browsers/pointer types that dispatch it before React
// resolves which element the eventual click targets.
function CenterOnDataButton({ enabled, title, color, onClick }: { enabled: boolean; title: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="layer-manager-center-on-data-button"
      onClick={(e) => {
        e.stopPropagation();
        if (enabled) onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      disabled={!enabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.35,
        flexShrink: 0,
      }}
    >
      <CrosshairsIcon color={color} />
    </button>
  );
}

function applyMinSpanPadding(extent: { west: number; south: number; east: number; north: number }, minSpan: number) {
  let { west, south, east, north } = extent;
  if (east - west < minSpan) {
    const cx = (east + west) / 2;
    west = cx - minSpan / 2;
    east = cx + minSpan / 2;
  }
  if (north - south < minSpan) {
    const cy = (north + south) / 2;
    south = cy - minSpan / 2;
    north = cy + minSpan / 2;
  }
  return { west, south, east, north };
}

// Feeds each domain's LIVE TRACKS center-on-data button — same shape as
// timelapse.ts's extentOfFeatures, over plain lng/lat pairs instead of
// GeoJSON Features (targets/sensors/units aren't features, just objects
// with those two fields).
function extentOfPoints(points: { lng: number; lat: number }[]): { west: number; south: number; east: number; north: number } | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  return { west, south, east, north };
}

// One row inside an expanded domain section — LIVE TRACKS or TIMELAPSE —
// each with its own checkbox toggling that sub-layer's visibility on the
// map independently of the other. `labelAction`, when given, renders next
// to the label (currently just the TIMELAPSE row's "center on this data"
// button) — stopPropagation'd so clicking it doesn't also flip the row's
// own checkbox underneath.
function SectionRow({
  className,
  checked,
  color,
  label,
  labelAction,
  detail,
  onClick,
}: {
  className: string;
  checked: boolean;
  color: string;
  label: string;
  labelAction?: ReactNode;
  detail: string;
  onClick: () => void;
}) {
  return (
    <ClickableDiv className={className} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <CheckboxGlyph checked={checked} color={color} />
      <div className={`${className}-text`} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div className={`${className}-label-row`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`${className}-label`} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.06em', color: checked ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
            {label}
          </span>
          {labelAction}
        </div>
        <span className={`${className}-detail`} style={{ fontSize: 8.5, color: 'var(--ink-faint2)', letterSpacing: '.04em' }}>
          {detail}
        </span>
      </div>
    </ClickableDiv>
  );
}

// One expandable section per physical domain. The header (name/count/
// chevron) only expands/collapses — the LIVE TRACKS and TIMELAPSE rows
// inside each carry their own checkbox, toggling that sub-layer's map
// visibility independently: LIVE TRACKS controls domainVisibility (the
// SVG overlay in TacticalMap.tsx), TIMELAPSE controls this domain's own
// timelapseByLayer[layerId].visible (TimelapseMapLayer.tsx) — VESSEL
// TRACKS under MARITIME/SEA, AIR TRACKS under AIR, see timelapse.ts's
// TIMELAPSE_LAYERS. Every layer keeps its own filter/features/cursor/
// playback permanently (no shared "active layer" to switch), so expanding
// or playing one domain's timelapse never affects another's.
function DomainSection({
  domain,
  count,
  liveExtent,
}: {
  domain: Domain;
  count: number;
  liveExtent: { west: number; south: number; east: number; north: number } | null;
}) {
  const on = useStore((s) => s.domainVisibility[domain]);
  const toggleDomainVisibility = useStore((s) => s.toggleDomainVisibility);
  const setTimelapseVisible = useStore((s) => s.setTimelapseVisible);
  const fitBounds = useStore((s) => s.fitBounds);
  const [expanded, setExpanded] = useState(false);
  const meta = DOMAIN_META[domain];
  // Every domain has exactly one layer (see TIMELAPSE_LAYER_BY_DOMAIN's own
  // doc comment) — no optional/"unmapped domain" branch needed here.
  const timelapseLayer = TIMELAPSE_LAYER_BY_DOMAIN[domain];
  const timelapseVisible = useStore((s) => s.timelapseByLayer[timelapseLayer.id].visible);

  // Feeds the TIMELAPSE row's crosshairs button — centers the map on
  // wherever this layer's data is, which is the whole point of that button
  // (hard to spot a loaded layer's markers otherwise). Deliberately the
  // extent of every loaded point, not just what's visible at the current
  // cursor: right after Load the cursor sits at filter.timeStart, which
  // for most layers is *before* the actual data window (see
  // defaultTimelapseFilter's per-layer doc comments), so nothing would be
  // "visible" yet even though features are loaded — a button that only
  // works once you've scrubbed forward reads as broken the first time
  // someone reaches for it.
  const timelapseFeatures = useStore((s) => s.timelapseByLayer[timelapseLayer.id].features);
  const timelapseExtent = useMemo(() => extentOfFeatures(timelapseFeatures), [timelapseFeatures]);

  // Fits the view to the data's actual spread rather than centering on a
  // point at a fixed zoom — a fixed zoom that suits a tightly-clustered
  // layer would push a widely-spread one off-screen instead of bringing it
  // into view (applyMinSpanPadding pads a near-zero-size box — one lone
  // entity, or several right on top of each other — so `view.fit` doesn't
  // try to zoom in on a degenerate extent). Shared by both this domain's
  // LIVE TRACKS and TIMELAPSE center-on-data buttons below.
  function centerOn(extent: { west: number; south: number; east: number; north: number }) {
    fitBounds(applyMinSpanPadding(extent, 0.1));
  }

  return (
    <div
      className={`layer-manager-domain-section layer-manager-domain-section-${domain.toLowerCase()}`}
      style={{ border: `1px solid ${on ? '#1f4a44' : 'var(--hairline-mid)'}`, background: on ? 'rgba(95,227,154,.05)' : 'var(--panel-3)' }}
    >
      <ClickableDiv
        className="layer-manager-domain-section-header"
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', cursor: 'pointer' }}
      >
        <span className="layer-manager-domain-section-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', color: on ? 'var(--ink-bright)' : 'var(--ink-mute)' }}>
          {meta.label}
        </span>
        <span className="layer-manager-domain-section-spacer" style={{ flex: 1 }} />
        <span className="layer-manager-domain-section-count" style={{ fontSize: 9, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {count} TRACK{count === 1 ? '' : 'S'}
        </span>
        <span
          className="layer-manager-domain-section-chevron"
          style={{ fontSize: 9, color: 'var(--ink-faint)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
        >
          ▸
        </span>
      </ClickableDiv>

      {expanded && (
        <div className="layer-manager-domain-section-body" style={{ padding: '0 9px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionRow
            className="layer-manager-domain-section-live-row"
            checked={on}
            color={meta.color}
            label="LIVE TRACKS"
            labelAction={
              <CenterOnDataButton
                enabled={liveExtent != null}
                title={liveExtent ? 'Center map on this domain’s live tracks' : 'No live tracks in this domain right now'}
                color={meta.color}
                onClick={() => centerOn(liveExtent!)}
              />
            }
            detail={`KAFKA · meridian.live.${domain.toLowerCase()}.v1 → GeoServer`}
            onClick={() => toggleDomainVisibility(domain)}
          />
          <div className="layer-manager-domain-section-timelapse" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
            <SectionRow
              className="layer-manager-domain-section-timelapse-row"
              checked={timelapseVisible}
              color={meta.color}
              label={`TIMELAPSE · ${timelapseLayer.label}`}
              labelAction={
                <CenterOnDataButton
                  enabled={timelapseExtent != null}
                  title={timelapseExtent ? 'Center map on this layer’s data' : 'No data loaded yet — LOAD first'}
                  color={meta.color}
                  onClick={() => centerOn(timelapseExtent!)}
                />
              }
              detail="Shown on the map when checked."
              onClick={() => setTimelapseVisible(timelapseLayer.id, !timelapseVisible)}
            />
            <TimelapseControls layerId={timelapseLayer.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function LayerManager() {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);

  // Live per-domain track counts — recomputed only when the underlying
  // arrays actually change reference (sim-tick jitter on unrelated fields
  // doesn't reallocate these arrays' identity, see store.ts's mergeById/
  // update() reference-equality discipline elsewhere in this app).
  const domainCounts = useMemo(() => {
    const counts: Record<Domain, number> = { AIR: 0, SEA: 0, GROUND: 0, SPACE: 0 };
    for (const t of targets) counts[domainForTarget(t)]++;
    for (const s of sensors) counts[domainForSensor(s)]++;
    for (const u of units) counts[domainForUnit(u)]++;
    return counts;
  }, [targets, sensors, units]);

  // Feeds each domain's LIVE TRACKS "center on this data" button — the
  // bounding box of that domain's own targets/sensors/units right now,
  // same "fit the actual spread" reasoning as the TIMELAPSE button below
  // (a fixed-zoom flyTo would push a widely-spread domain off-screen).
  const domainLiveExtents = useMemo(() => {
    const points: Record<Domain, { lng: number; lat: number }[]> = { AIR: [], SEA: [], GROUND: [], SPACE: [] };
    for (const t of targets) points[domainForTarget(t)].push(t);
    for (const s of sensors) points[domainForSensor(s)].push(s);
    for (const u of units) points[domainForUnit(u)].push(u);
    const extents = {} as Record<Domain, { west: number; south: number; east: number; north: number } | null>;
    for (const d of DOMAINS) extents[d] = extentOfPoints(points[d]);
    return extents;
  }, [targets, sensors, units]);

  return (
    <div className="layer-manager" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--hairline)', overflow: 'hidden', background: 'var(--panel-1)' }}>
      <div className="layer-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="layer-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--green-alt)', boxShadow: '0 0 8px var(--green-alt)' }} />
        <span className="layer-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--green-alt)', fontWeight: 600 }}>
          LAYER MANAGER
        </span>
      </div>

      <div className="layer-manager-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="layer-manager-intro" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px', lineHeight: 1.5 }}>
          DOMAINS — the checkbox toggles this domain's live overlay on the map; expand a domain for its timelapse layer.
        </div>
        {DOMAINS.map((d) => (
          <DomainSection key={d} domain={d} count={domainCounts[d]} liveExtent={domainLiveExtents[d]} />
        ))}
      </div>
    </div>
  );
}

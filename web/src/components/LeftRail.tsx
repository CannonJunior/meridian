import { useMemo } from 'react';
import { useStore } from '../store';
import { C, indexSortiesByCollectionRequirement } from '../selectors';
import { COLLECTION_REQUIREMENTS, naiForRequirement } from '../assets/collectionRequirements';
import type { Sensor, Sortie } from '../types';
import ManagerHeader from './ManagerHeader';
import { ClickableDiv, ClickableSpan } from './Clickable';

function sensorColors(s: Sensor) {
  const statusColor = s.status === 'ON STATION' ? C.green : s.status === 'TASKED' ? C.amber : s.status === 'DEGRADED' ? C.red : C.dim;
  const endColor = s.endur > 60 ? C.green : s.endur > 35 ? C.amber : C.red;
  const taskColor = s.status === 'DEGRADED' ? C.red : '#9fb2ae';
  const border = s.status === 'DEGRADED' ? '#3a2422' : 'var(--hairline-subtle)';
  return { statusColor, endColor, taskColor, border };
}

function SensorCard({ s }: { s: Sensor }) {
  const retaskSensor = useStore((st) => st.retaskSensor);
  const { statusColor, endColor, taskColor, border } = sensorColors(s);

  return (
    <ClickableDiv className="sensor-card" onClick={() => retaskSensor(s.id)} title="Retask sensor" style={{ border: `1px solid ${border}`, background: 'var(--panel-3)', padding: '8px 9px', cursor: 'pointer', position: 'relative' }}>
      <div className="sensor-card-header" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="sensor-card-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0 }} />
        <span className="sensor-card-callsign" style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: 'var(--ink-bright)' }}>
          {s.callsign}
        </span>
        <span className="sensor-card-spacer" style={{ flex: 1 }} />
        <span className="sensor-card-status-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: statusColor, fontWeight: 600 }}>
          {s.status}
        </span>
      </div>
      <div className="sensor-card-platform-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <span className="sensor-card-platform" style={{ fontSize: 9.5, color: 'var(--ink-mute2)' }}>
          {s.platform}
        </span>
        <span className="sensor-card-platform-sep" style={{ width: 3, height: 3, borderRadius: '50%', background: '#3a4a47' }} />
        <span className="sensor-card-int-type" style={{ fontSize: 9.5, color: 'var(--ink-dim2)' }}>
          {s.intType}
        </span>
      </div>
      <div className="sensor-card-task-row" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className="sensor-card-task-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
          TASK
        </span>
        <span className="sensor-card-task-value" style={{ fontSize: 9.5, color: taskColor, fontWeight: 500 }}>
          {s.tasking}
        </span>
      </div>
      <div className="sensor-card-endurance-row" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className="sensor-card-endurance-label" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
          END
        </span>
        <div className="sensor-card-endurance-track" style={{ flex: 1, height: 3, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
          <div className="sensor-card-endurance-fill" style={{ height: '100%', width: `${s.endur}%`, background: endColor }} />
        </div>
        <span className="sensor-card-endurance-value" style={{ fontSize: 8.5, color: 'var(--ink-dim2)', fontVariantNumeric: 'tabular-nums' }}>
          {s.endur}%
        </span>
      </div>
    </ClickableDiv>
  );
}

// Phase E — one CPCL row. `dimmed` is true while an NAI is focused and
// this requirement isn't tied to it, rather than removing the row
// outright: the point of the NAI→CPCL link is "what does this NAI need,"
// not "hide everything else," so the rest of the list stays visible but
// recedes.
function CollectionRequirementRow({ requirementId, priority, pir, description, naiName, naiColor, dimmed, tasked, onFocusNai }: {
  requirementId: string;
  priority: number;
  pir: string;
  description: string;
  naiName: string | null;
  naiColor: string | null;
  dimmed: boolean;
  // Precomputed by the parent from one indexSortiesByCollectionRequirement
  // build (see LeftRail below) rather than each row filtering the full
  // sorties array for itself.
  tasked: Sortie[];
  onFocusNai: () => void;
}) {
  const openEntity = useStore((s) => s.openEntity);
  const satisfied = tasked.some((s) => s.status === 'AIRBORNE' || s.status === 'TOT');
  const statusColor = satisfied ? C.green : tasked.length > 0 ? C.amber : C.red;
  const statusLabel = satisfied ? 'COLLECTING' : tasked.length > 0 ? 'TASKED' : 'UNTASKED';

  return (
    <div
      className="left-rail-cpcl-row"
      style={{
        borderTop: '1px solid var(--hairline-mid)',
        borderRight: '1px solid var(--hairline-mid)',
        borderBottom: '1px solid var(--hairline-mid)',
        borderLeft: `2px solid ${statusColor}`,
        background: 'var(--panel-3)',
        padding: '7px 9px',
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <div className="left-rail-cpcl-row-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="left-rail-cpcl-row-id" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink-brighter)' }}>
          {requirementId}
        </span>
        <span className="left-rail-cpcl-row-priority" style={{ fontSize: 8.5, letterSpacing: '.08em', color: 'var(--ink-faint)' }}>
          PRI #{priority}
        </span>
        <span className="left-rail-cpcl-row-spacer" style={{ flex: 1 }} />
        {naiName && (
          <ClickableSpan
            className="left-rail-cpcl-row-nai-tag"
            onClick={onFocusNai}
            style={{ fontSize: 8, letterSpacing: '.06em', padding: '1px 5px', border: `1px solid ${naiColor}`, color: naiColor ?? undefined, cursor: 'pointer' }}
          >
            {naiName}
          </ClickableSpan>
        )}
        <span className="left-rail-cpcl-row-status" style={{ fontSize: 8, letterSpacing: '.06em', color: statusColor, fontWeight: 700 }}>
          {statusLabel}
        </span>
      </div>
      <div className="left-rail-cpcl-row-desc" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 5, lineHeight: 1.4 }}>
        {description}
      </div>
      <div className="left-rail-cpcl-row-pir" style={{ fontSize: 8.5, letterSpacing: '.08em', color: 'var(--ink-faint)', marginTop: 5 }}>
        {pir}
      </div>
      {tasked.length > 0 && (
        <div className="left-rail-cpcl-row-tasked-sorties" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
          {tasked.map((s) => (
            <ClickableSpan
              key={s.id}
              className="left-rail-cpcl-row-tasked-sortie-chip"
              onClick={() => openEntity('sortie', s.id)}
              style={{ fontSize: 8.5, letterSpacing: '.04em', padding: '2px 6px', border: '1px solid var(--hairline-mid)', color: 'var(--cyan)', cursor: 'pointer' }}
            >
              {s.callsign} · {s.status}
            </ClickableSpan>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeftRail() {
  const sensors = useStore((s) => s.sensors);
  const nais = useStore((s) => s.nais);
  const sorties = useStore((s) => s.sorties);
  const sensorsOn = sensors.filter((s) => s.status === 'ON STATION' || s.status === 'TASKED').length;
  // Store state, not a local useState (moved during the ATO tutorials'
  // groundwork — see store.ts's focusedNaiId doc comment): a future
  // tutorial's run() needs to be able to drive this focus itself, the way
  // every other interactive step in this app already can.
  const focusedNaiId = useStore((s) => s.focusedNaiId);
  const setFocusedNaiId = useStore((s) => s.setFocusedNaiId);
  const requirementIndex = useMemo(() => indexSortiesByCollectionRequirement(sorties), [sorties]);

  return (
    <div className="left-rail" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <ManagerHeader
        className="left-rail-header"
        accentClassName="left-rail-header-accent"
        titleClassName="left-rail-title"
        accentColor="var(--cyan)"
        title="ISR · COLLECTION"
      >
        <span className="left-rail-spacer" style={{ flex: 1 }} />
        <span className="left-rail-on-station-count" style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>
          {sensorsOn}/{sensors.length} ON STN
        </span>
      </ManagerHeader>

      <div className="left-rail-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="left-rail-section-label" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px' }}>
          SENSOR LAYDOWN
        </div>
        {sensors.map((s) => (
          <SensorCard key={s.id} s={s} />
        ))}

        <div className="left-rail-section-label" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '6px 2px 0' }}>
          NAMED AREAS OF INTEREST
        </div>
        {nais.map((n) => {
          const focused = focusedNaiId === n.id;
          return (
            <ClickableDiv
              key={n.id}
              className="left-rail-nai-row"
              onClick={() => setFocusedNaiId(focusedNaiId === n.id ? null : n.id)}
              title="Show this NAI's collection requirements below"
              style={{
                borderTop: `1px solid ${focused ? n.color : 'var(--hairline-mid)'}`,
                borderRight: `1px solid ${focused ? n.color : 'var(--hairline-mid)'}`,
                borderBottom: `1px solid ${focused ? n.color : 'var(--hairline-mid)'}`,
                borderLeft: `2px solid ${n.color}`,
                background: focused ? `${n.color}14` : 'var(--panel-3)',
                padding: '7px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                cursor: 'pointer',
              }}
            >
              <span className="left-rail-nai-id" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: n.color }}>
                {n.id}
              </span>
              <span className="left-rail-nai-desc" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', flex: 1 }}>
                {n.desc}
              </span>
              <span className="left-rail-nai-pir" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
                {n.pir}
              </span>
            </ClickableDiv>
          );
        })}

        <div className="left-rail-section-label" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '6px 2px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="left-rail-cpcl-section-title">CPCL · COLLECTION REQUIREMENTS</span>
          {focusedNaiId && (
            <ClickableSpan className="left-rail-cpcl-clear-focus" onClick={() => setFocusedNaiId(null)} style={{ color: 'var(--amber)', letterSpacing: '.04em', cursor: 'pointer', fontWeight: 700 }}>
              ✕ {focusedNaiId} ONLY
            </ClickableSpan>
          )}
        </div>
        {COLLECTION_REQUIREMENTS.slice()
          .sort((a, b) => a.priority - b.priority)
          .map((req) => {
            const nai = naiForRequirement(req, nais);
            return (
              <CollectionRequirementRow
                key={req.id}
                requirementId={req.id}
                priority={req.priority}
                pir={req.pir}
                description={req.description}
                naiName={nai?.id ?? null}
                naiColor={nai?.color ?? null}
                dimmed={focusedNaiId != null && req.naiId !== focusedNaiId}
                tasked={requirementIndex.get(req.id) ?? []}
                onFocusNai={() => req.naiId && setFocusedNaiId(focusedNaiId === req.naiId ? null : req.naiId)}
              />
            );
          })}
      </div>
    </div>
  );
}

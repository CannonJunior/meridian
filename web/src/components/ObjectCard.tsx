import { useRef } from 'react';
import { useStore } from '../store';
import { affColor, affFull, affShapeStyle, sortieStatusColor, threatColor } from '../selectors';
import { effectiveStatus, findOobNode, kindLabel, oobTabNames, statusMeta } from '../oobSelectors';
import { VESSEL_PROFILES } from '../assets/vesselProfiles';
import { useKnowledgeGraph } from '../kb/deriveGraph';
import { KG_TYPE_LABEL, kgTabNames, kgTypeColor } from '../kb/ontology';
import type { KgDocument } from '../kb/ontology';
import TargetCardBody from './cards/TargetCardBody';
import SensorUnitCardBody from './cards/SensorUnitCardBody';
import NaiCardBody from './cards/NaiCardBody';
import ZoneCardBody from './cards/ZoneCardBody';
import OobObjectCardBody from './cards/OobObjectCardBody';
import PortCardBody from './cards/PortCardBody';
import AirfieldCardBody from './cards/AirfieldCardBody';
import KbEntityCardBody from './cards/KbEntityCardBody';
import SortieCardBody from './cards/SortieCardBody';
import type { CardKind } from '../types';
import { ClickableDiv } from './Clickable';

function CrosshairsIcon({ color }: { color: string }) {
  return (
    <svg className="object-card-crosshairs-glyph" width="13" height="13" viewBox="0 0 20 20" fill="none">
      <circle className="object-card-crosshairs-glyph-ring" cx="10" cy="10" r="6" stroke={color} strokeWidth="1.6" />
      <circle className="object-card-crosshairs-glyph-dot" cx="10" cy="10" r="1.1" fill={color} />
      <line className="object-card-crosshairs-glyph-tick-top" x1="10" y1="0" x2="10" y2="2.5" stroke={color} strokeWidth="1.6" />
      <line className="object-card-crosshairs-glyph-tick-bottom" x1="10" y1="17.5" x2="10" y2="20" stroke={color} strokeWidth="1.6" />
      <line className="object-card-crosshairs-glyph-tick-left" x1="0" y1="10" x2="2.5" y2="10" stroke={color} strokeWidth="1.6" />
      <line className="object-card-crosshairs-glyph-tick-right" x1="17.5" y1="10" x2="20" y2="10" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

// Filled when the card is pinned, outline otherwise — same two-state glyph
// idiom as the rest of this app's hand-drawn icons (see e.g. OobIcon's
// status dots switching fill/opacity by state).
function ThumbtackIcon({ color, pinned }: { color: string; pinned: boolean }) {
  return (
    <svg className="object-card-thumbtack-glyph" width="13" height="13" viewBox="0 0 20 20" fill="none">
      <path
        className="object-card-thumbtack-glyph-head"
        d="M7 3H13L12.3 8.2L15 10.5V12H10.6V17L10 18L9.4 17V12H5V10.5L7.7 8.2L7 3Z"
        fill={pinned ? color : 'none'}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useCardLocation(kind: CardKind, id: string | null, kg: KgDocument): { lng: number; lat: number } | null {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);
  const nais = useStore((s) => s.nais);
  const ports = useStore((s) => s.ports);
  const airfields = useStore((s) => s.airfields);
  const sorties = useStore((s) => s.sorties);

  if (kind === 'kbEntity') {
    if (id == null) return null;
    const node = kg['@graph'].find((n) => n['@id'] === id);
    const lat = node?.properties.lat;
    const lng = node?.properties.lng;
    return typeof lat === 'number' && typeof lng === 'number' ? { lng, lat } : null;
  }

  if (kind === 'zone') {
    const drift = targets.find((t) => t.id === 'T2210');
    return drift ? { lng: drift.lng, lat: drift.lat } : null;
  }

  if (id == null) return null;

  if (kind === 'target') {
    const t = targets.find((x) => x.id === id);
    return t ? { lng: t.lng, lat: t.lat } : null;
  }
  if (kind === 'sensor') {
    const s = sensors.find((x) => x.id === id);
    return s ? { lng: s.lng, lat: s.lat } : null;
  }
  if (kind === 'unit') {
    const u = units.find((x) => x.id === id);
    return u ? { lng: u.lng, lat: u.lat } : null;
  }
  if (kind === 'nai') {
    const n = nais.find((x) => x.id === id) ?? nais[0];
    return n ? { lng: (n.lngMin + n.lngMax) / 2, lat: (n.latMin + n.latMax) / 2 } : null;
  }
  if (kind === 'oobObject') {
    const n = findOobNode(id);
    return n?.lng != null && n.lat != null ? { lng: n.lng, lat: n.lat } : null;
  }
  if (kind === 'port') {
    const p = ports[id];
    return p ? { lng: p.lng, lat: p.lat } : null;
  }
  if (kind === 'airfield') {
    const a = airfields[id];
    return a ? { lng: a.lng, lat: a.lat } : null;
  }
  if (kind === 'sortie') {
    // Per the design brief's RT-08 finding, a sortie doesn't reduce to one
    // point the way a target/sensor/unit does — an AAR orbit or an
    // airlift route isn't a coordinate. The only honest position Phase B
    // can offer is a linked live Sensor's current position (e.g. an ISR
    // sortie flown by an MQ-9 that's also a tracked Sensor); Effector
    // entities carry no lng/lat in this app at all, and airfield-only
    // sorties (AAR, AIRLIFT, unlinked ISR/AEW) resolve to null until
    // Phase C gives airfields/orbits/routes real geometry.
    const so = sorties.find((x) => x.id === id);
    const sn = so?.linkedPlatformId ? sensors.find((x) => x.id === so.linkedPlatformId) : null;
    return sn ? { lng: sn.lng, lat: sn.lat } : null;
  }
  return null;
}

interface HeaderInfo {
  idShort: string;
  name: string;
  affColor: string;
  affShapeStyle: React.CSSProperties;
  affFull: string;
  affGlow: string;
  affWash: string;
  typePillLabel: string;
  typePillColor: string;
  typePillBorder: string;
  tabNames: string[];
}

function useHeaderInfo(kind: CardKind, id: string | null, kg: KgDocument): HeaderInfo | null {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);
  const nais = useStore((s) => s.nais);
  const ports = useStore((s) => s.ports);
  const airfields = useStore((s) => s.airfields);
  const sorties = useStore((s) => s.sorties);
  const contactIdentityAssignments = useStore((s) => s.contactIdentityAssignments);

  if (id == null) return null;

  if (kind === 'kbEntity') {
    const node = kg['@graph'].find((n) => n['@id'] === id);
    if (!node) return null;
    const color = kgTypeColor(node['@type']);
    return {
      idShort: KG_TYPE_LABEL[node['@type']],
      name: node.name,
      affColor: color,
      affShapeStyle: {},
      affFull: 'KNOWLEDGE BASE',
      affGlow: color,
      affWash: 'rgba(185,139,255,.08)',
      typePillLabel: KG_TYPE_LABEL[node['@type']],
      typePillColor: color,
      typePillBorder: color,
      tabNames: kgTabNames(node['@type']),
    };
  }

  if (kind === 'target') {
    const t = targets.find((x) => x.id === id);
    if (!t) return null;
    const wash = t.aff === 'HOS' ? 'rgba(255,90,71,.10)' : t.aff === 'UNK' ? 'rgba(255,210,63,.08)' : t.aff === 'FRD' ? 'rgba(63,210,230,.08)' : 'rgba(95,227,154,.07)';
    return {
      idShort: t.id.slice(1),
      name: t.name,
      affColor: affColor(t.aff),
      affShapeStyle: affShapeStyle(t.aff),
      affFull: affFull(t.aff),
      affGlow: affColor(t.aff),
      affWash: wash,
      typePillLabel: t.threat || '—',
      typePillColor: threatColor(t.threat),
      typePillBorder: threatColor(t.threat),
      tabNames: ['OVERVIEW', 'INTELLIGENCE', 'ASSOCIATIONS', 'SIGNATURES', 'TARGET WORKUP'],
    };
  }

  if (kind === 'sensor' || kind === 'unit') {
    const ae = kind === 'sensor' ? sensors.find((x) => x.id === id) : units.find((x) => x.id === id);
    if (!ae) return null;
    return {
      idShort: ae.callsign,
      name: ae.platform,
      affColor: 'var(--cyan)',
      affShapeStyle: { borderRadius: '50%' },
      affFull: 'FRIENDLY',
      affGlow: 'var(--cyan)',
      affWash: 'rgba(63,210,230,.08)',
      typePillLabel: kind === 'sensor' ? 'ISR ASSET' : 'FIRES / MANEUVER',
      typePillColor: 'var(--cyan)',
      typePillBorder: 'var(--cyan)',
      tabNames: ['OVERVIEW', 'TASKING', 'ASSOCIATIONS'],
    };
  }

  if (kind === 'nai') {
    const n = nais.find((x) => x.id === id) ?? nais[0];
    if (!n) return null;
    return {
      idShort: n.id,
      name: n.desc,
      affColor: n.color,
      affShapeStyle: {},
      affFull: 'NAI',
      affGlow: n.color,
      affWash: 'rgba(255,171,56,.07)',
      typePillLabel: n.pir,
      typePillColor: n.color,
      typePillBorder: n.color,
      tabNames: ['OVERVIEW', 'COLLECTION', 'TRACKS'],
    };
  }

  if (kind === 'oobObject') {
    const n = findOobNode(id);
    if (!n) return null;
    const tabNames = oobTabNames(n);
    if (n.kind === 'contact') {
      const assignedId = contactIdentityAssignments[n.id];
      const assigned = assignedId ? VESSEL_PROFILES.find((p) => p.id === assignedId) : null;
      const status = effectiveStatus(n, contactIdentityAssignments);
      const meta = statusMeta(status);
      return {
        idShort: n.name,
        name: assigned ? assigned.className : 'UNIDENTIFIED CONTACT',
        affColor: 'var(--yellow)',
        affShapeStyle: {},
        affFull: 'UNKNOWN',
        affGlow: 'var(--yellow)',
        affWash: 'rgba(255,210,63,.08)',
        typePillLabel: meta.label,
        typePillColor: meta.color,
        typePillBorder: meta.color,
        tabNames,
      };
    }
    if (n.entityType === 'object') {
      const meta = statusMeta(n.status);
      const hullMatch = n.name.match(/\(([^)]+)\)/);
      return {
        idShort: hullMatch ? hullMatch[1] : n.name,
        name: hullMatch ? n.name.slice(0, hullMatch.index).trim() : n.name,
        affColor: 'var(--cyan)',
        affShapeStyle: { borderRadius: '50%' },
        affFull: 'FRIENDLY',
        affGlow: 'var(--cyan)',
        affWash: 'rgba(63,210,230,.08)',
        typePillLabel: meta.label,
        typePillColor: meta.color,
        typePillBorder: meta.color,
        tabNames,
      };
    }
    // Organizational node (command / division / wing / squadron, etc.) — no
    // hull number, status, or position to show; a lighter header + no
    // SENSORS & ARMAMENT tab, since it isn't a single physical platform.
    return {
      idShort: kindLabel(n.kind),
      name: n.name,
      affColor: 'var(--cyan)',
      affShapeStyle: {},
      affFull: 'FRIENDLY',
      affGlow: 'var(--cyan)',
      affWash: 'rgba(63,210,230,.08)',
      typePillLabel: n.role || kindLabel(n.kind),
      typePillColor: 'var(--cyan)',
      typePillBorder: 'var(--cyan)',
      tabNames,
    };
  }

  if (kind === 'port') {
    const p = ports[id];
    if (!p) return null;
    return {
      idShort: p.wpiPortId != null ? `WPI ${p.wpiPortId}` : 'PORT',
      name: p.name,
      affColor: 'var(--green)',
      affShapeStyle: {},
      affFull: 'INFRASTRUCTURE',
      affGlow: 'var(--green)',
      affWash: 'rgba(95,227,154,.07)',
      typePillLabel: p.portSize ? `${p.portSize.toUpperCase()} PORT` : 'PORT',
      typePillColor: 'var(--green)',
      typePillBorder: 'var(--green)',
      tabNames: ['OVERVIEW'],
    };
  }

  if (kind === 'airfield') {
    const a = airfields[id];
    if (!a) return null;
    return {
      idShort: a.icao || 'AIRFIELD',
      name: a.name,
      affColor: 'var(--green)',
      affShapeStyle: {},
      affFull: 'INFRASTRUCTURE',
      affGlow: 'var(--green)',
      affWash: 'rgba(95,227,154,.07)',
      typePillLabel: 'AIRFIELD',
      typePillColor: 'var(--green)',
      typePillBorder: 'var(--green)',
      tabNames: ['OVERVIEW'],
    };
  }

  if (kind === 'sortie') {
    const so = sorties.find((x) => x.id === id);
    if (!so) return null;
    const color = sortieStatusColor(so.status);
    return {
      idShort: so.callsign,
      name: so.platform,
      affColor: color,
      affShapeStyle: {},
      affFull: 'FRIENDLY',
      affGlow: color,
      affWash: 'rgba(63,210,230,.08)',
      typePillLabel: so.missionType,
      typePillColor: 'var(--cyan)',
      typePillBorder: 'var(--cyan)',
      tabNames: ['OVERVIEW', 'LINKAGE', 'ROUTE', 'BDA'],
    };
  }

  // zone
  return {
    idShort: 'NSZ-01',
    name: 'NO-STRIKE ZONE',
    affColor: 'var(--green)',
    affShapeStyle: {},
    affFull: 'NO-STRIKE',
    affGlow: 'var(--green)',
    affWash: 'rgba(95,227,154,.07)',
    typePillLabel: 'ROE / NSL',
    typePillColor: 'var(--green)',
    typePillBorder: 'var(--green)',
    tabNames: ['OVERVIEW', 'PROTECTED', 'RESTRICTIONS'],
  };
}

interface ObjectCardShellProps {
  cardKind: CardKind;
  cardId: string;
  cardTab: number;
  cardX: number;
  cardY: number;
  pinned: boolean;
  zIndex: number;
  onSetTab: (i: number) => void;
  onMove: (x: number, y: number) => void;
  onClose: () => void;
  onTogglePin: () => void;
}

// Presentational: everything about how one card renders and behaves, keyed
// purely off (cardKind, cardId) — knows nothing about whether it's the
// single transient card or one of N pinned ones. See ObjectCard below for
// what actually feeds it props: the current card reads/writes the store's
// scalar cardKind/cardId/cardTab/cardX/cardY (unchanged from before pinning
// existed), while pinned cards read/write their own entry in
// store.pinnedCards by key.
function ObjectCardShell({ cardKind, cardId, cardTab, cardX, cardY, pinned, zIndex, onSetTab, onMove, onClose, onTogglePin }: ObjectCardShellProps) {
  const flyTo = useStore((s) => s.flyTo);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Computed once here and threaded into both hooks below — each used to
  // call useKnowledgeGraph() independently, rebuilding the graph (staticNodes
  // + live targets, keyed on targets so it reruns every sim tick) twice
  // every render of every open card, regardless of whether the card is even
  // a kbEntity card that reads it.
  const kg = useKnowledgeGraph();
  const info = useHeaderInfo(cardKind, cardId, kg);
  const location = useCardLocation(cardKind, cardId, kg);

  // Listeners live only for the duration of an actual drag (attached on
  // pointer down, removed on pointer up) rather than for the component's
  // whole mount lifetime — a card can stay open a long time, and there's
  // no reason to run a document-wide pointermove handler except while
  // something is actually being dragged.
  function startDrag(e: React.PointerEvent) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: cardX, oy: cardY };
    const onMoveEvt = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onMove(d.ox + ev.clientX - d.sx, d.oy + ev.clientY - d.sy);
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('pointermove', onMoveEvt);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMoveEvt);
    document.addEventListener('pointerup', onUp);
  }

  if (!info) return null;

  return (
    <div
      className="object-card"
      style={{
        position: 'fixed',
        left: cardX,
        top: cardY,
        width: 544,
        maxHeight: '80vh',
        zIndex,
        background: 'var(--panel-2)',
        border: '1px solid #2a3d3a',
        boxShadow: '0 28px 90px rgba(0,0,0,.72), 0 0 0 1px rgba(255,171,56,.12)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        className="object-card-header"
        onPointerDown={startDrag}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderBottom: '1px solid var(--hairline)', background: `linear-gradient(180deg,${info.affWash},#0c1315)`, cursor: 'move', position: 'relative' }}
      >
        <span className="object-card-aff-shape" style={{ width: 16, height: 16, background: '#0c1416', border: `2px solid ${info.affColor}`, flexShrink: 0, boxShadow: `0 0 8px ${info.affGlow}`, ...info.affShapeStyle }} />
        <span className="object-card-id-short" style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--ink-warm)', letterSpacing: '.04em' }}>
          {info.idShort}
        </span>
        <span className="object-card-name" style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: info.affColor }}>
          {info.name}
        </span>
        <span className="object-card-aff-pill" style={{ fontSize: 8.5, letterSpacing: '.1em', padding: '2px 6px', background: info.affColor, color: '#06090a', fontWeight: 700 }}>
          {info.affFull}
        </span>
        <span className="object-card-type-pill" style={{ fontSize: 8.5, letterSpacing: '.1em', padding: '2px 6px', border: `1px solid ${info.typePillBorder}`, color: info.typePillColor, fontWeight: 700 }}>
          {info.typePillLabel}
        </span>
        <span className="object-card-spacer" style={{ flex: 1 }} />
        <div className="object-card-capabilities" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {location && (
            <ClickableDiv
              className="object-card-capability-button object-card-capability-crosshairs"
              onClick={() => flyTo(location.lng, location.lat)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Center map on this object"
              style={{ width: 22, height: 22, border: '1px solid #2a3d3a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <CrosshairsIcon color="var(--ink-mute)" />
            </ClickableDiv>
          )}
        </div>
        <ClickableDiv
          className="object-card-pin-button"
          onClick={onTogglePin}
          onPointerDown={(e) => e.stopPropagation()}
          title={pinned ? 'Unpin this card' : 'Pin this card open'}
          style={{ width: 22, height: 22, border: `1px solid ${pinned ? 'var(--amber)' : '#2a3d3a'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <ThumbtackIcon color={pinned ? 'var(--amber)' : 'var(--ink-mute)'} pinned={pinned} />
        </ClickableDiv>
        <ClickableDiv
          className="object-card-close-button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          title="Close this card"
          style={{ width: 22, height: 22, border: '1px solid #2a3d3a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-mute)', cursor: 'pointer' }}
        >
          ✕
        </ClickableDiv>
      </div>

      <div className="object-card-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-1)' }}>
        {info.tabNames.map((name, i) => (
          <ClickableDiv
            key={name}
            className="object-card-tab"
            onClick={() => onSetTab(i)}
            style={{ padding: '8px 13px', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', fontWeight: 600, cursor: 'pointer', color: cardTab === i ? '#06090a' : 'var(--ink-mute)', background: cardTab === i ? 'var(--amber)' : 'transparent', borderRight: '1px solid #131e1d' }}
          >
            {name}
          </ClickableDiv>
        ))}
      </div>

      <div className="object-card-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 14 }}>
        {cardKind === 'target' && <TargetCardBody id={cardId} tab={cardTab} />}
        {(cardKind === 'sensor' || cardKind === 'unit') && <SensorUnitCardBody kind={cardKind} id={cardId} tab={cardTab} />}
        {cardKind === 'nai' && <NaiCardBody id={cardId} tab={cardTab} />}
        {cardKind === 'zone' && <ZoneCardBody tab={cardTab} />}
        {cardKind === 'oobObject' && <OobObjectCardBody id={cardId} tab={cardTab} />}
        {cardKind === 'port' && <PortCardBody id={cardId} />}
        {cardKind === 'airfield' && <AirfieldCardBody id={cardId} />}
        {cardKind === 'kbEntity' && <KbEntityCardBody uri={cardId} tab={cardTab} />}
        {cardKind === 'sortie' && <SortieCardBody id={cardId} tab={cardTab} />}
      </div>
    </div>
  );
}

export default function ObjectCard() {
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const cardTab = useStore((s) => s.cardTab);
  const cardX = useStore((s) => s.cardX);
  const cardY = useStore((s) => s.cardY);
  const setCardTab = useStore((s) => s.setCardTab);
  const closeCard = useStore((s) => s.closeCard);
  const moveCardTo = useStore((s) => s.moveCardTo);
  const pinCurrentCard = useStore((s) => s.pinCurrentCard);
  const pinnedCards = useStore((s) => s.pinnedCards);
  const unpinCard = useStore((s) => s.unpinCard);
  const closePinnedCard = useStore((s) => s.closePinnedCard);
  const setPinnedCardTab = useStore((s) => s.setPinnedCardTab);
  const movePinnedCardTo = useStore((s) => s.movePinnedCardTo);

  return (
    <>
      {pinnedCards.map((c, i) => (
        <ObjectCardShell
          key={c.key}
          cardKind={c.kind}
          cardId={c.id}
          cardTab={c.tab}
          cardX={c.x}
          cardY={c.y}
          pinned
          zIndex={150 + i}
          onSetTab={(tab) => setPinnedCardTab(c.key, tab)}
          onMove={(x, y) => movePinnedCardTo(c.key, x, y)}
          onClose={() => closePinnedCard(c.key)}
          onTogglePin={() => unpinCard(c.key)}
        />
      ))}
      {cardId != null && (
        <ObjectCardShell
          cardKind={cardKind}
          cardId={cardId}
          cardTab={cardTab}
          cardX={cardX}
          cardY={cardY}
          pinned={false}
          zIndex={200}
          onSetTab={setCardTab}
          onMove={moveCardTo}
          onClose={closeCard}
          onTogglePin={pinCurrentCard}
        />
      )}
    </>
  );
}

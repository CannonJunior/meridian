import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { affColor, affFull, affShapeStyle, threatColor } from '../selectors';
import TargetCardBody from './cards/TargetCardBody';
import SensorUnitCardBody from './cards/SensorUnitCardBody';
import NaiCardBody from './cards/NaiCardBody';
import ZoneCardBody from './cards/ZoneCardBody';
import type { CardKind } from '../types';

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

function useHeaderInfo(kind: CardKind, id: string | null): HeaderInfo | null {
  const targets = useStore((s) => s.targets);
  const sensors = useStore((s) => s.sensors);
  const units = useStore((s) => s.units);
  const nais = useStore((s) => s.nais);

  if (id == null) return null;

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
      tabNames: ['OVERVIEW', 'INTELLIGENCE', 'ASSOCIATIONS', 'TARGETING', 'SIGNATURES'],
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

export default function ObjectCard() {
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const cardTab = useStore((s) => s.cardTab);
  const cardX = useStore((s) => s.cardX);
  const cardY = useStore((s) => s.cardY);
  const setCardTab = useStore((s) => s.setCardTab);
  const closeCard = useStore((s) => s.closeCard);
  const moveCardTo = useStore((s) => s.moveCardTo);

  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const info = useHeaderInfo(cardKind, cardId);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      moveCardTo(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy);
    }
    function onUp() {
      dragRef.current = null;
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [moveCardTo]);

  if (!info || cardId == null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: cardX,
        top: cardY,
        width: 544,
        maxHeight: '80vh',
        zIndex: 200,
        background: 'var(--panel-2)',
        border: '1px solid #2a3d3a',
        boxShadow: '0 28px 90px rgba(0,0,0,.72), 0 0 0 1px rgba(255,171,56,.12)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        onPointerDown={(e) => {
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox: cardX, oy: cardY };
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderBottom: '1px solid var(--hairline)', background: `linear-gradient(180deg,${info.affWash},#0c1315)`, cursor: 'move', position: 'relative' }}
      >
        <span style={{ width: 16, height: 16, background: '#0c1416', border: `2px solid ${info.affColor}`, flexShrink: 0, boxShadow: `0 0 8px ${info.affGlow}`, ...info.affShapeStyle }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--ink-warm)', letterSpacing: '.04em' }}>{info.idShort}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: info.affColor }}>{info.name}</span>
        <span style={{ fontSize: 8.5, letterSpacing: '.1em', padding: '2px 6px', background: info.affColor, color: '#06090a', fontWeight: 700 }}>{info.affFull}</span>
        <span style={{ fontSize: 8.5, letterSpacing: '.1em', padding: '2px 6px', border: `1px solid ${info.typePillBorder}`, color: info.typePillColor, fontWeight: 700 }}>{info.typePillLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 8.5, letterSpacing: '.16em', color: 'var(--ink-faint)' }}>OBJECT CARD</span>
        <div
          onClick={closeCard}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ width: 22, height: 22, border: '1px solid #2a3d3a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-mute)', cursor: 'pointer' }}
        >
          ✕
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', background: 'var(--panel-1)' }}>
        {info.tabNames.map((name, i) => (
          <div
            key={name}
            onClick={() => setCardTab(i)}
            style={{ padding: '8px 13px', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.1em', fontWeight: 600, cursor: 'pointer', color: cardTab === i ? '#06090a' : 'var(--ink-mute)', background: cardTab === i ? 'var(--amber)' : 'transparent', borderRight: '1px solid #131e1d' }}
          >
            {name}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 14 }}>
        {cardKind === 'target' && cardId && <TargetCardBody id={cardId} tab={cardTab} />}
        {(cardKind === 'sensor' || cardKind === 'unit') && cardId && <SensorUnitCardBody kind={cardKind} id={cardId} tab={cardTab} />}
        {cardKind === 'nai' && cardId && <NaiCardBody id={cardId} tab={cardTab} />}
        {cardKind === 'zone' && <ZoneCardBody tab={cardTab} />}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../../store';
import { effectiveStatus, formatLatLng, kindLabel, oobTabKeys, parentOf, pathNodes, siblingObjectsOf, statusMeta } from '../../oobSelectors';
import { VESSEL_PROFILES } from '../../assets/vesselProfiles';
import { EmptyNote, KV, KVGrid, LinkRow, SectionLabel } from './shared';

const STATUS_NOTE: Record<string, string> = {
  VISIBLE: 'Positive custody held — track corroborated by current collection.',
  OBSCURED: 'Contact obscured (e.g. submerged, EMCON, or terrain/weather masking). Last known position shown.',
  MISIDENTIFIED: 'Classification unconfirmed — signature is ambiguous with another platform.',
  DESTROYED: 'Assessed destroyed. Retained on the order of battle for historical reference.',
  UNKNOWN: 'Contact lost — missing for reasons not yet established.',
  UNIDENTIFIED: 'No identity established yet — see the IDENTIFY tab to narrow candidates and assign a tentative classification.',
};

// The IDENTIFY workflow: an analyst filters the small VESSEL_PROFILES
// reference library (assets/vesselProfiles.ts) by whichever criteria are
// meaningful, and picks the best match. Country/band/length are backed by
// that library and fully functional; "last port visited" is left in the UI
// but disabled, since Meridian doesn't track contact-specific port-call
// history anywhere yet — that's the honest state of the data today, not a
// placeholder pretending otherwise.
function IdentifyContactPanel({ node }: { node: ReturnType<typeof pathNodes>[number] }) {
  const contactIdentityAssignments = useStore((s) => s.contactIdentityAssignments);
  const assignContactIdentity = useStore((s) => s.assignContactIdentity);
  const clearContactIdentity = useStore((s) => s.clearContactIdentity);
  const [country, setCountry] = useState('ANY');
  const [band, setBand] = useState('ANY');
  const [lenMin, setLenMin] = useState('');
  const [lenMax, setLenMax] = useState('');

  const p = node.parametrics ?? {};
  const assignedId = contactIdentityAssignments[node.id];
  const assignedProfile = assignedId ? VESSEL_PROFILES.find((v) => v.id === assignedId) : null;

  const countries = ['ANY', ...Array.from(new Set(VESSEL_PROFILES.map((v) => v.countryOfOrigin)))];
  const bands = ['ANY', ...Array.from(new Set(VESSEL_PROFILES.map((v) => v.radarBand)))];
  const min = lenMin ? Number(lenMin) : null;
  const max = lenMax ? Number(lenMax) : null;

  const candidates = VESSEL_PROFILES.filter((v) => {
    if (country !== 'ANY' && v.countryOfOrigin !== country) return false;
    if (band !== 'ANY' && v.radarBand !== band) return false;
    if (min != null && v.lengthMaxM < min) return false;
    if (max != null && v.lengthMinM > max) return false;
    return true;
  });

  return (
    <>
      <SectionLabel>KNOWN PARAMETRICS</SectionLabel>
      <KVGrid>
        <KV label="EST. LENGTH" value={p.estimatedLengthM != null ? `~${p.estimatedLengthM} M` : 'NO DATA'} color={p.estimatedLengthM != null ? 'var(--ink-bright)' : 'var(--ink-faint)'} />
        <KV label="RADAR BAND" value={p.radarBand ?? 'NO DATA'} color={p.radarBand ? 'var(--ink-bright)' : 'var(--ink-faint)'} />
        <KV label="OBSERVED FLAG" value={p.observedFlag ?? 'NO DATA'} color={p.observedFlag ? 'var(--ink-bright)' : 'var(--ink-faint)'} />
        <KV label="LAST PORT VISITED" value={p.lastPortVisited ?? 'NO DATA'} color={p.lastPortVisited ? 'var(--ink-bright)' : 'var(--ink-faint)'} />
        <KV label="FIRST DETECTED" value={p.firstDetected ?? 'NO DATA'} color={p.firstDetected ? 'var(--ink-bright)' : 'var(--ink-faint)'} />
      </KVGrid>

      {assignedProfile ? (
        <>
          <SectionLabel top={16}>ASSIGNED IDENTITY (TENTATIVE)</SectionLabel>
          <div className="oob-object-card-identify-assigned" style={{ border: `1px solid var(--yellow)`, background: 'rgba(255,210,63,.05)', padding: '9px 10px' }}>
            <div className="oob-object-card-identify-assigned-name" style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--ink-bright)' }}>
              {assignedProfile.className}
            </div>
            <div className="oob-object-card-identify-assigned-meta" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 4 }}>
              {assignedProfile.countryOfOrigin} · {assignedProfile.typicalRole}
            </div>
            <div className="oob-object-card-identify-revert-button" onClick={() => clearContactIdentity(node.id)} style={{ marginTop: 9, fontSize: 9, letterSpacing: '.1em', color: 'var(--red)', cursor: 'pointer', display: 'inline-block' }}>
              ✕ REVERT TO UNIDENTIFIED
            </div>
          </div>
        </>
      ) : (
        <>
          <SectionLabel top={16}>IDENTIFY CONTACT</SectionLabel>
          <div className="oob-object-card-identify-filters" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="oob-object-card-identify-filter-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              COUNTRY OF ORIGIN
              <select className="oob-object-card-identify-country-select" value={country} onChange={(e) => setCountry(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '4px 6px' }}>
                {countries.map((c) => (
                  <option className="oob-object-card-identify-country-option" key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="oob-object-card-identify-filter-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              RADAR BAND
              <select className="oob-object-card-identify-band-select" value={band} onChange={(e) => setBand(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '4px 6px' }}>
                {bands.map((b) => (
                  <option className="oob-object-card-identify-band-option" key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="oob-object-card-identify-filter-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              SHIP LENGTH MIN (M)
              <input className="oob-object-card-identify-length-min-input" type="number" value={lenMin} onChange={(e) => setLenMin(e.target.value)} placeholder="—" style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '4px 6px' }} />
            </label>
            <label className="oob-object-card-identify-filter-label" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
              SHIP LENGTH MAX (M)
              <input className="oob-object-card-identify-length-max-input" type="number" value={lenMax} onChange={(e) => setLenMax(e.target.value)} placeholder="—" style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '4px 6px' }} />
            </label>
            <label className="oob-object-card-identify-filter-label oob-object-card-identify-filter-label-disabled" style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint2)', gridColumn: '1 / -1' }}>
              PORTS VISITED — NO DATA SOURCE YET
              <input className="oob-object-card-identify-ports-input" type="text" disabled placeholder="Not yet tracked in Meridian" style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--panel-1)', border: '1px solid var(--hairline-subtle)', color: 'var(--ink-faint2)', fontSize: 10, padding: '4px 6px', cursor: 'not-allowed' }} />
            </label>
          </div>

          <SectionLabel top={16}>CANDIDATES ({candidates.length})</SectionLabel>
          <div className="oob-object-card-identify-candidate-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((c) => (
              <div
                key={c.id}
                className="oob-object-card-identify-candidate-row"
                onClick={() => assignContactIdentity(node.id, c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: 'pointer' }}
              >
                <span className="oob-object-card-identify-candidate-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
                  {c.className}
                </span>
                <span className="oob-object-card-identify-candidate-country" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                  {c.countryOfOrigin}
                </span>
                <span className="oob-object-card-identify-candidate-length" style={{ fontSize: 9, color: 'var(--ink-faint)', minWidth: 60, textAlign: 'right' }}>
                  {c.lengthMinM}–{c.lengthMaxM} M
                </span>
              </div>
            ))}
            {candidates.length === 0 && <EmptyNote>No reference profiles match these filters.</EmptyNote>}
          </div>
          <div className="oob-object-card-identify-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 10, lineHeight: 1.5 }}>
            ▸ Click a candidate to assign a tentative identity. This reference library is a small starter set, not a full recognition database — expect gaps.
          </div>
        </>
      )}
    </>
  );
}

export default function OobObjectCardBody({ id, tab }: { id: string; tab: number }) {
  const selectOob = useStore((s) => s.selectOob);
  const oobStyle = useStore((s) => s.oobStyle);
  const contactIdentityAssignments = useStore((s) => s.contactIdentityAssignments);

  const node = pathNodes(id).at(-1);
  if (!node) return null;

  const isObject = node.entityType === 'object';
  const status = effectiveStatus(node, contactIdentityAssignments);
  const meta = statusMeta(status);
  const parent = parentOf(id);
  const path = pathNodes(id);
  const siblings = siblingObjectsOf(id);
  const activeKey = oobTabKeys(node)[tab] ?? 'overview';

  if (activeKey === 'overview') {
    return (
      <>
        <KVGrid>
          <KV label="ECHELON" value={kindLabel(node.kind)} />
          <KV label="ROLE" value={node.role || '—'} />
          <KV label="PARENT COMMAND" value={parent?.name || '—'} />
          {isObject && <KV label="STATUS" value={meta.label} color={meta.color} />}
          {isObject && <KV label="POSITION" value={node.lat != null && node.lng != null ? formatLatLng(node.lat, node.lng) : '—'} color="var(--ink-mute)" />}
        </KVGrid>
        {isObject && (
          <div className="oob-object-card-status-box" style={{ marginTop: 14, padding: '9px 10px', border: `1px solid ${meta.color}`, background: 'rgba(255,255,255,.02)' }}>
            <div className="oob-object-card-status-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="oob-object-card-status-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
              <span className="oob-object-card-status-label" style={{ fontSize: 9, letterSpacing: '.12em', color: meta.color, fontWeight: 600 }}>
                {meta.label}
              </span>
            </div>
            <div className="oob-object-card-status-note" style={{ fontSize: 9.5, color: 'var(--ink-mute2)', marginTop: 6, lineHeight: 1.5 }}>
              {STATUS_NOTE[status ?? 'VISIBLE']}
            </div>
          </div>
        )}
      </>
    );
  }

  if (activeKey === 'identify') {
    return <IdentifyContactPanel node={node} />;
  }

  if (activeKey === 'hierarchy') {
    return (
      <>
        <SectionLabel>CHAIN OF COMMAND</SectionLabel>
        <div className="oob-object-card-chain" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {path.map((n, i) => (
            <div
              key={n.id}
              className="oob-object-card-chain-row"
              onClick={() => n.id !== id && selectOob(n.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 9px',
                paddingLeft: 9 + i * 14,
                cursor: n.id !== id ? 'pointer' : 'default',
                background: n.id === id ? 'rgba(63,210,230,.08)' : 'transparent',
                borderLeft: `2px solid ${n.id === id ? 'var(--cyan)' : 'transparent'}`,
              }}
            >
              <span className="oob-object-card-chain-dot" style={{ width: 5, height: 5, background: n.id === id ? 'var(--cyan)' : 'var(--ink-faint)', flexShrink: 0 }} />
              <span className="oob-object-card-chain-name" style={{ fontSize: 10, color: n.id === id ? 'var(--ink-brighter)' : 'var(--ink-mute)', fontWeight: n.id === id ? 700 : 500 }}>
                {n.name}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (activeKey === 'sensors') {
    const radars = node.radars ?? [];
    const weapons = node.weapons ?? [];
    return (
      <>
        <SectionLabel>RADARS / SENSORS</SectionLabel>
        <div className="oob-object-card-radar-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {radars.map((r) => (
            <div key={r.name} className="oob-object-card-radar-row" style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px' }}>
              <span className="oob-object-card-radar-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
                {r.name}
              </span>
              <span className="oob-object-card-radar-type" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                {r.type}
              </span>
              <span className="oob-object-card-radar-range" style={{ fontSize: 10.5, color: oobStyle.radarColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>
                {r.rangeNm} NM
              </span>
            </div>
          ))}
          {radars.length === 0 && <EmptyNote>No radar/sensor data documented for this class.</EmptyNote>}
        </div>

        <SectionLabel top={16}>WEAPON SYSTEMS</SectionLabel>
        <div className="oob-object-card-weapon-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weapons.map((w) => (
            <div key={w.name} className="oob-object-card-weapon-row" style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px' }}>
              <span className="oob-object-card-weapon-name" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--ink-brighter)', flex: 1 }}>
                {w.name}
              </span>
              <span className="oob-object-card-weapon-type" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                {w.type}
              </span>
              <span className="oob-object-card-weapon-range" style={{ fontSize: 10.5, color: oobStyle.weaponColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>
                {w.rangeNm} NM
              </span>
            </div>
          ))}
          {weapons.length === 0 && <EmptyNote>No armament data documented for this class.</EmptyNote>}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel>CO-LOCATED / SISTER UNITS</SectionLabel>
      <div className="oob-object-card-siblings-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {siblings.map((s) => {
          const sIsObject = s.entityType === 'object';
          const sMeta = statusMeta(effectiveStatus(s, contactIdentityAssignments));
          return (
            <LinkRow
              key={s.id}
              affColor="var(--cyan)"
              affShape={{ borderRadius: '50%' }}
              idShort={kindLabel(s.kind)}
              name={s.name}
              pillLabel={sIsObject ? sMeta.label : undefined}
              pillColor={sIsObject ? sMeta.color : undefined}
              onClick={() => selectOob(s.id)}
            />
          );
        })}
        {siblings.length === 0 && <EmptyNote>No other elements under {parent?.name ?? 'this command'}.</EmptyNote>}
      </div>
      <div className="oob-object-card-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 12, lineHeight: 1.5 }}>
        ▸ Click a linked object to open its card.
      </div>
    </>
  );
}

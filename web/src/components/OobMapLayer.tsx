import { useStore } from '../store';
import { effectiveStatus, flattenObjects, statusMeta } from '../oobSelectors';
import type { OobNode } from '../assets/oob';
import { hexToRgba } from '../assets/palette';

type ProjectLL = (lng: number, lat: number) => { x: number; y: number };

const OBJECTS = flattenObjects();

// Converts a real-world nm range into an on-screen pixel radius at the
// object's location: project the center and a point offset due north by
// that many nm (1 nm = 1/60 degree latitude), then measure the pixel
// distance between them. This tracks the map's current zoom/projection
// without needing direct access to the maplibre map instance.
function rangeRingRadiusPx(project: ProjectLL, lng: number, lat: number, rangeNm: number): number {
  const center = project(lng, lat);
  const edge = project(lng, lat + rangeNm / 60);
  return Math.hypot(edge.x - center.x, edge.y - center.y);
}

function RangeRings({ n, project, radarColor, weaponColor }: { n: OobNode; project: ProjectLL; radarColor: string; weaponColor: string }) {
  if (n.lng == null || n.lat == null) return null;
  const { x, y } = project(n.lng, n.lat);
  const radars = n.radars ?? [];
  const weapons = n.weapons ?? [];

  return (
    <g className="oob-range-rings">
      {radars.map((r) => (
        <circle
          key={`radar-${r.name}`}
          className="oob-range-ring-radar"
          cx={x}
          cy={y}
          r={rangeRingRadiusPx(project, n.lng!, n.lat!, r.rangeNm)}
          fill="none"
          stroke={hexToRgba(radarColor, 0.4)}
          strokeWidth={1}
          strokeDasharray="2 5"
        />
      ))}
      {weapons.map((w) => (
        <circle
          key={`weapon-${w.name}`}
          className="oob-range-ring-weapon"
          cx={x}
          cy={y}
          r={rangeRingRadiusPx(project, n.lng!, n.lat!, w.rangeNm)}
          fill="none"
          stroke={hexToRgba(weaponColor, 0.4)}
          strokeWidth={1}
          strokeDasharray="5 4"
        />
      ))}
    </g>
  );
}

function ObjectMarker({ n, project, selected, onSelect, contactIdentityAssignments }: { n: OobNode; project: ProjectLL; selected: boolean; onSelect: () => void; contactIdentityAssignments: Record<string, string> }) {
  if (n.lng == null || n.lat == null) return null;
  const { x, y } = project(n.lng, n.lat);
  const status = effectiveStatus(n, contactIdentityAssignments);
  const meta = statusMeta(status);

  return (
    <g className="oob-marker" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={onSelect} opacity={meta.opacity}>
      <rect className="oob-marker-shape" x={x - 6} y={y - 6} width={12} height={12} fill="#0a1316" stroke={meta.color} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={meta.dash} transform={`rotate(45 ${x} ${y})`} />
      {status === 'DESTROYED' ? (
        <text className="oob-marker-destroyed-glyph" x={x} y={y + 4} fill={meta.color} fontSize={12} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ╳
        </text>
      ) : (
        <circle className="oob-marker-dot" cx={x} cy={y} r={2} fill={meta.color} />
      )}
      {(status === 'MISIDENTIFIED' || status === 'UNKNOWN' || status === 'UNIDENTIFIED') && (
        <text className="oob-marker-status-glyph" x={x} y={y - 9} fill={meta.color} fontSize={9.5} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ?
        </text>
      )}
      <rect className="oob-marker-label-bg" x={x + 10} y={y - 10} width={Math.max(46, n.name.length * 4.6)} height={12} fill="rgba(7,11,12,.72)" />
      <text className="oob-marker-label" x={x + 12} y={y - 1} fill={meta.color} fontSize={8.5} fontFamily="IBM Plex Mono" opacity={0.92}>
        {n.name}
        {status !== 'VISIBLE' ? ` · ${meta.label}` : ''}
      </text>
    </g>
  );
}

export default function OobMapLayer({ project, width, height }: { project: ProjectLL; width: number; height: number }) {
  const selectedId = useStore((s) => s.oobSelectedId);
  const selectOob = useStore((s) => s.selectOob);
  const oobStyle = useStore((s) => s.oobStyle);
  const contactIdentityAssignments = useStore((s) => s.contactIdentityAssignments);
  const selected = OBJECTS.find((n) => n.id === selectedId);

  return (
    <svg className="oob-map-layer" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {selected && <RangeRings n={selected} project={project} radarColor={oobStyle.radarColor} weaponColor={oobStyle.weaponColor} />}
      {OBJECTS.map((n) => (
        <ObjectMarker key={n.id} n={n} project={project} selected={n.id === selectedId} onSelect={() => selectOob(n.id)} contactIdentityAssignments={contactIdentityAssignments} />
      ))}
    </svg>
  );
}

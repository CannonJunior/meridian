import { useStore } from '../store';
import { flattenObjects, statusMeta } from '../oobSelectors';
import type { OobNode } from '../assets/oob';

type ProjectLL = (lng: number, lat: number) => { x: number; y: number };

const OBJECTS = flattenObjects();

function ObjectMarker({ n, project, selected, onSelect }: { n: OobNode; project: ProjectLL; selected: boolean; onSelect: () => void }) {
  if (n.lng == null || n.lat == null) return null;
  const { x, y } = project(n.lng, n.lat);
  const meta = statusMeta(n.status);

  return (
    <g className="oob-marker" style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={onSelect} opacity={meta.opacity}>
      <rect className="oob-marker-shape" x={x - 6} y={y - 6} width={12} height={12} fill="#0a1316" stroke={meta.color} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={meta.dash} transform={`rotate(45 ${x} ${y})`} />
      {n.status === 'DESTROYED' ? (
        <text className="oob-marker-destroyed-glyph" x={x} y={y + 4} fill={meta.color} fontSize={12} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ╳
        </text>
      ) : (
        <circle className="oob-marker-dot" cx={x} cy={y} r={2} fill={meta.color} />
      )}
      {(n.status === 'MISIDENTIFIED' || n.status === 'UNKNOWN') && (
        <text className="oob-marker-status-glyph" x={x} y={y - 9} fill={meta.color} fontSize={9.5} fontWeight={700} textAnchor="middle" fontFamily="Chakra Petch">
          ?
        </text>
      )}
      <rect className="oob-marker-label-bg" x={x + 10} y={y - 10} width={Math.max(46, n.name.length * 4.6)} height={12} fill="rgba(7,11,12,.72)" />
      <text className="oob-marker-label" x={x + 12} y={y - 1} fill={meta.color} fontSize={8.5} fontFamily="IBM Plex Mono" opacity={0.92}>
        {n.name}
        {n.status !== 'VISIBLE' ? ` · ${meta.label}` : ''}
      </text>
    </g>
  );
}

export default function OobMapLayer({ project, width, height }: { project: ProjectLL; width: number; height: number }) {
  const selectedId = useStore((s) => s.oobSelectedId);
  const selectOob = useStore((s) => s.selectOob);

  return (
    <svg className="oob-map-layer" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {OBJECTS.map((n) => (
        <ObjectMarker key={n.id} n={n} project={project} selected={n.id === selectedId} onSelect={() => selectOob(n.id)} />
      ))}
    </svg>
  );
}

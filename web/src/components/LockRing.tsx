// The rotating dashed crosshair ring that marks "this is the selected
// object" — same tactical idiom as TacticalMap.tsx's track-symbol lock
// ring (see its TrackSymbol component), pulled out here as a standalone
// piece so other SVG-based views (KnowledgeGraphView) can mark a selection
// the same way without duplicating the markup. Positioned by the caller in
// whatever coordinate space its own SVG is already in — this component
// only draws the ring at (x, y), it doesn't know about map/graph
// projections. Spin animation reuses the `twbspin` keyframe already
// defined globally in theme.css.
export default function LockRing({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g className="lock-ring" style={{ transformOrigin: `${x}px ${y}px`, animation: 'twbspin 7s linear infinite' }}>
      <circle className="lock-ring-circle" cx={x} cy={y} r={24} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="4 6" />
      <line className="lock-ring-tick lock-ring-tick-top" x1={x} y1={y - 30} x2={x} y2={y - 20} stroke={color} strokeWidth={1.6} />
      <line className="lock-ring-tick lock-ring-tick-bottom" x1={x} y1={y + 20} x2={x} y2={y + 30} stroke={color} strokeWidth={1.6} />
      <line className="lock-ring-tick lock-ring-tick-left" x1={x - 30} y1={y} x2={x - 20} y2={y} stroke={color} strokeWidth={1.6} />
      <line className="lock-ring-tick lock-ring-tick-right" x1={x + 20} y1={y} x2={x + 30} y2={y} stroke={color} strokeWidth={1.6} />
    </g>
  );
}

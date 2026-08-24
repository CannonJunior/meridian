import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular } from 'cytoscape';
import { useStore } from '../store';
import { toCytoscapeElements, useKnowledgeGraph } from '../kb/deriveGraph';
import type { KgType } from '../kb/ontology';
import LockRing from './LockRing';

// Cytoscape renders to canvas, which can't resolve CSS custom properties —
// theme.css stays the single source of truth for these hues, resolved to
// raw values once here rather than duplicating hex codes.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function KnowledgeGraphView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const doc = useKnowledgeGraph();
  const kbSelectedUri = useStore((s) => s.kbSelectedUri);
  const selectKbEntity = useStore((s) => s.selectKbEntity);
  // On-screen (rendered, not graph-space) position of the selected node's
  // lock ring — null while nothing is selected or the graph hasn't laid
  // out yet. Kept in sync with pan/zoom below so the ring stays glued to
  // the node exactly like TacticalMap's track-symbol lock ring does.
  const [lockRingPos, setLockRingPos] = useState<{ x: number; y: number } | null>(null);

  // Live targets move every simulation tick (~1s), which changes `doc`'s
  // identity every tick too — rebuilding the whole Cytoscape instance and
  // rerunning its (non-deterministic) cose layout that often made the graph
  // visibly jump between different layouts once a second. The graph only
  // needs to rebuild when the actual set of nodes/edges changes (an entity
  // or relationship appearing/disappearing) — not when an already-shown
  // node's data (like a target's lat/lng) just moved. This key captures
  // only the structural shape; per-node display data staleness between
  // rebuilds is harmless here since the graph doesn't render live position.
  const structuralKey = useMemo(() => {
    return toCytoscapeElements(doc)
      .map((el) => el.data.id)
      .sort()
      .join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => {
    if (!containerRef.current) return;

    const typeColor: Record<KgType, string> = {
      NavalVessel: cssVar('--cyan'),
      Unit: cssVar('--cyan'),
      Contact: cssVar('--yellow'),
      Command: cssVar('--blue'),
      RadarSystem: cssVar('--violet'),
      WeaponSystem: cssVar('--red'),
      ContextLayer: cssVar('--green'),
      GeoFeature: cssVar('--green'),
      TargetList: cssVar('--amber'),
      Target: cssVar('--ink-mute'),
    };
    const fallbackColor = cssVar('--ink-faint');

    const elements = toCytoscapeElements(doc).map((el) => {
      if (el.data.source) return el; // edge — no @type to color
      return { data: { ...el.data, color: (el.data.type && typeColor[el.data.type]) || fallbackColor } };
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: cssVar('--ink-mute'),
            'font-size': 7,
            'font-family': 'IBM Plex Mono, monospace',
            width: 10,
            height: 10,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'border-width': 1,
            'border-color': cssVar('--hairline-mid'),
          },
        },
        {
          selector: 'edge',
          style: {
            width: 0.6,
            'line-color': cssVar('--hairline-mid'),
            'curve-style': 'haystack',
            'haystack-radius': 0,
            opacity: 0.5,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 2, 'border-color': cssVar('--ink-warm'), 'font-size': 9 },
        },
      ],
      // Concentric rings by depth in the OOB command hierarchy (walked via
      // partOf edges only — hasRadar/hasWeapon/memberOfList/relatedTo/
      // associatedWith are still drawn as edges, just don't affect ring
      // placement) — countries at the center, ships/units on the
      // outermost ring. Tried first: 'cose' (the previous default) is a
      // force-directed hairball at this node count, illegible. 'breadthfirst'
      // (tree layout, also built into cytoscape core) turned into an
      // unreadable thin horizontal strip — this data is a very wide,
      // shallow tree (~5 levels, ~90 leaf ships), and a straight-line tree
      // layout wastes almost all the panel's height on that shape.
      // 'dagre' (a real dependency, tried and reverted) had the same
      // problem plus poor handling of the many nodes with no partOf at all
      // (radar/weapon/context-layer/target-list roots). Concentric turns
      // "wide" into "ring circumference" instead of "line width", which
      // fits this shape well and needs no extra dependency.
      layout: {
        name: 'concentric',
        concentric: (node: NodeSingular) => {
          let depth = 0;
          let cur = node;
          while (cur.outgoers('edge[label="partOf"]').length) {
            cur = cur.outgoers('edge[label="partOf"]').targets()[0];
            depth++;
            if (depth > 20) break; // guards against a malformed/cyclic partOf chain
          }
          return 100 - depth; // cytoscape centers the highest value, so root (depth 0) sorts innermost
        },
        levelWidth: () => 1,
        animate: false,
        fit: true,
        padding: 40,
        spacingFactor: 0.9,
      },
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
    });

    cy.on('tap', 'node', (evt) => selectKbEntity(evt.target.id()));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // Deliberately keyed on structuralKey, not doc — see the comment above
    // structuralKey's definition. `doc` is still read from the closure, so
    // this always builds from the render that actually changed the shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey, selectKbEntity]);

  // Keep the graph's own selection/focus in sync when a node is selected
  // elsewhere (the KB manager rail, or an entity card's RELATIONSHIPS tab),
  // and track that node's on-screen position for the lock ring overlay
  // below — 'pan'/'zoom'/'position' cover both the centering animate()
  // just below and any manual pan/zoom/drag the user does afterward.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (!kbSelectedUri) {
      setLockRingPos(null);
      return;
    }
    const node = cy.getElementById(kbSelectedUri);
    if (!node.length) {
      setLockRingPos(null);
      return;
    }
    node.select();
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.2) }, { duration: 250 });

    const updateRingPos = () => {
      const p = node.renderedPosition();
      setLockRingPos({ x: p.x, y: p.y });
    };
    updateRingPos();
    cy.on('pan zoom position', updateRingPos);
    return () => {
      cy.off('pan zoom position', updateRingPos);
    };
  }, [kbSelectedUri]);

  return (
    <div className="knowledge-graph-view-wrap" style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <div className="knowledge-graph-view" ref={containerRef} style={{ position: 'absolute', inset: 0, background: 'var(--map-bg)' }} />
      {lockRingPos && (
        <svg className="knowledge-graph-view-lock-ring-svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <LockRing x={lockRingPos.x} y={lockRingPos.y} color="var(--violet)" />
        </svg>
      )}
    </div>
  );
}

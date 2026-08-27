import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, LayoutOptions, NodeSingular, Stylesheet } from 'cytoscape';
import { useStore } from '../store';
import { ORG_CHART_BOX_H, ORG_CHART_BOX_W, buildOrgChart, toCytoscapeElements, useKnowledgeGraph } from '../kb/deriveGraph';
import type { CytoscapeElement, OrgChartPosition } from '../kb/deriveGraph';
import type { KgType } from '../kb/ontology';
import LockRing from './LockRing';

// Cytoscape renders to canvas, which can't resolve CSS custom properties —
// theme.css stays the single source of truth for these hues, resolved to
// raw values once here rather than duplicating hex codes.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 'orgchart' is the odd one out — the rest are common node-link layouts
// cytoscape ships with core (no extra dependency, same reasoning the
// concentric-vs-dagre comment below already applies); it filters to just
// Command/NavalVessel/Unit/Contact and lays them out as a top-down command
// chart via a hand-computed 'preset' position map (see buildOrgChart in
// kb/deriveGraph.ts), modeled on real numbered-fleet composition charts —
// boxes by echelon, not a node-link hairball.
type KgLayoutMode = 'concentric' | 'cose' | 'breadthfirst' | 'circle' | 'grid' | 'orgchart';

const LAYOUT_MODES: { value: KgLayoutMode; label: string }[] = [
  { value: 'concentric', label: 'CONCENTRIC (HIERARCHY)' },
  { value: 'cose', label: 'FORCE-DIRECTED' },
  { value: 'breadthfirst', label: 'TREE (BREADTHFIRST)' },
  { value: 'circle', label: 'CIRCLE' },
  { value: 'grid', label: 'GRID' },
  { value: 'orgchart', label: 'OOB ORG CHART' },
];

// Depth walk shared by the concentric layout below — countries/root orgs at
// the center, ships/units on the outermost ring, following partOf edges
// only (hasRadar/hasWeapon/memberOfList/relatedTo/associatedWith are still
// drawn as edges, just don't affect ring placement).
function concentricDepth(node: NodeSingular): number {
  let depth = 0;
  let cur = node;
  while (cur.outgoers('edge[label="partOf"]').length) {
    cur = cur.outgoers('edge[label="partOf"]').targets()[0];
    depth++;
    if (depth > 20) break; // guards against a malformed/cyclic partOf chain
  }
  return 100 - depth; // cytoscape centers the highest value, so root (depth 0) sorts innermost
}

// One layout per dropdown entry, for every mode except 'orgchart' (which
// needs the precomputed position map from buildOrgChart — built separately,
// see the 'preset' branch in the effect below). Tried first, for this full
// graph: 'cose' is a force-directed hairball at this node count, illegible.
// 'breadthfirst' (tree layout, also built into cytoscape core) turned into
// an unreadable thin horizontal strip — this data is a very wide, shallow
// tree (~5 levels, ~90 leaf ships), and a straight-line rank layout wastes
// almost all the panel's height on that shape (every node at a given depth,
// across every branch, shares one rank — a squadron's ships end up sharing
// a row with every *other* squadron's ships). 'dagre' (a real dependency,
// tried and reverted) had the same problem plus poor handling of the many
// nodes with no partOf at all (radar/weapon/context-layer/target-list
// roots). 'concentric' turns "wide" into "ring circumference" instead of
// "line width", which fits that shape well and needs no extra dependency —
// so it stays the default. All of these are still offered as explicit
// choices (this is what was asked for: common layout options); 'breadthfirst'
// remains a poor fit even for 'orgchart' for the same reason, which is why
// that mode gets its own hand-rolled tidy-tree instead (see buildOrgChart).
function layoutForMode(mode: Exclude<KgLayoutMode, 'orgchart'>): LayoutOptions {
  switch (mode) {
    case 'cose':
      // numIter capped well below cose's default (1000): at ~800+ nodes the
      // default count made this option freeze the tab for 10-15s before
      // ever painting — a real problem once it's a one-click dropdown pick
      // rather than something only ever tried once during development (see
      // the "hairball" note above; this data was already known to render
      // poorly here, just not known to also render *slowly*).
      return { name: 'cose', animate: false, fit: true, padding: 40, numIter: 120 };
    case 'circle':
      return { name: 'circle', fit: true, padding: 40 };
    case 'grid':
      return { name: 'grid', fit: true, padding: 40 };
    case 'breadthfirst':
      return { name: 'breadthfirst', directed: true, circle: false, fit: true, padding: 40, spacingFactor: 1.1, avoidOverlap: true, nodeDimensionsIncludeLabels: true };
    case 'concentric':
    default:
      return { name: 'concentric', concentric: concentricDepth, levelWidth: () => 1, animate: false, fit: true, padding: 40, spacingFactor: 0.9 };
  }
}

export default function KnowledgeGraphView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const doc = useKnowledgeGraph();
  const kbSelectedUri = useStore((s) => s.kbSelectedUri);
  const selectKbEntity = useStore((s) => s.selectKbEntity);
  const [layoutMode, setLayoutMode] = useState<KgLayoutMode>('concentric');
  // On-screen (rendered, not graph-space) position of the selected node's
  // lock ring — null while nothing is selected or the graph hasn't laid
  // out yet. Kept in sync with pan/zoom below so the ring stays glued to
  // the node exactly like TacticalMap's track-symbol lock ring does.
  const [lockRingPos, setLockRingPos] = useState<{ x: number; y: number } | null>(null);

  // buildOrgChart computes both the filtered element set and their fixed
  // {x,y} positions together (the positions depend on exactly which nodes
  // are in the tree), so it's only run for 'orgchart' and only once per
  // doc/mode change — not re-derived a second time down in the effect.
  const orgChart = useMemo(() => (layoutMode === 'orgchart' ? buildOrgChart(doc) : null), [doc, layoutMode]);
  const rawElements = useMemo<CytoscapeElement[]>(() => orgChart?.elements ?? toCytoscapeElements(doc), [orgChart, doc]);

  // Live targets move every simulation tick (~1s), which changes `doc`'s
  // identity every tick too — rebuilding the whole Cytoscape instance and
  // rerunning its (non-deterministic) cose layout that often made the graph
  // visibly jump between different layouts once a second. The graph only
  // needs to rebuild when the actual set of nodes/edges changes (an entity
  // or relationship appearing/disappearing) — not when an already-shown
  // node's data (like a target's lat/lng) just moved. This key captures
  // only the structural shape; per-node display data staleness between
  // rebuilds is harmless here since the graph doesn't render live position.
  // The mode is folded into the key too, since switching layouts must
  // rebuild even when the node/edge set is unchanged (e.g. cose → circle).
  const structuralKey = useMemo(() => {
    return `${layoutMode}::${rawElements
      .map((el) => el.data.id)
      .sort()
      .join('|')}`;
  }, [rawElements, layoutMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const isOrgChart = layoutMode === 'orgchart';

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

    const elements = rawElements.map((el) => {
      if (el.data.source) return el; // edge — no @type to color
      return { data: { ...el.data, color: (el.data.type && typeColor[el.data.type]) || fallbackColor } };
    });

    // The org chart reads as a command chart (boxes by echelon, connected
    // by orthogonal lines) rather than a node-link diagram — everything
    // else keeps the small dot-plus-label-below look.
    const style: Stylesheet[] = isOrgChart
      ? [
          {
            selector: 'node',
            style: {
              shape: 'round-rectangle',
              'background-color': cssVar('--panel-2'),
              'border-color': 'data(color)',
              'border-width': 2,
              label: 'data(label)',
              color: cssVar('--ink-warm'),
              'font-size': 7.5,
              'font-family': 'IBM Plex Mono, monospace',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-wrap': 'wrap',
              'text-max-width': `${ORG_CHART_BOX_W - 12}px`,
              width: ORG_CHART_BOX_W,
              height: ORG_CHART_BOX_H,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1,
              'line-color': cssVar('--hairline-mid'),
              'curve-style': 'taxi',
              'target-arrow-shape': 'none',
              opacity: 0.7,
            },
          },
          {
            selector: 'node:selected',
            style: { 'border-width': 3, 'border-color': cssVar('--ink-warm') },
          },
        ]
      : [
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
        ];

    // Org chart positions are precomputed (see buildOrgChart) — 'preset'
    // just places each node at its fixed {x,y} rather than running a
    // cytoscape layout algorithm over the element set.
    const layout: LayoutOptions =
      layoutMode === 'orgchart'
        ? {
            name: 'preset',
            positions: (node: NodeSingular): OrgChartPosition => orgChart?.positions[node.id()] ?? { x: 0, y: 0 },
            fit: true,
            padding: 50,
          }
        : layoutForMode(layoutMode);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style,
      layout,
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
    // Deliberately keyed on structuralKey, not doc/rawElements — see the
    // comment above structuralKey's definition. rawElements is still read
    // from the closure, so this always builds from the render that actually
    // changed the shape (or the layout mode).
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
      <div
        className="knowledge-graph-view-layout-picker"
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
      >
        <label
          className="knowledge-graph-view-layout-picker-label"
          htmlFor="knowledge-graph-view-layout-select"
          style={{ fontSize: 8, letterSpacing: '.18em', color: 'var(--ink-faint)', marginBottom: 3 }}
        >
          LAYOUT
        </label>
        <select
          id="knowledge-graph-view-layout-select"
          className="knowledge-graph-view-layout-select"
          value={layoutMode}
          onChange={(e) => setLayoutMode(e.target.value as KgLayoutMode)}
          style={{
            background: 'rgba(8,13,14,.82)',
            border: '1px solid var(--hairline-mid)',
            color: 'var(--ink-mute)',
            fontFamily: 'var(--font-display)',
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '.08em',
            padding: '3px 6px',
            cursor: 'pointer',
          }}
        >
          {LAYOUT_MODES.map((m) => (
            <option className="knowledge-graph-view-layout-option" key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {lockRingPos && (
        <svg className="knowledge-graph-view-lock-ring-svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <LockRing x={lockRingPos.x} y={lockRingPos.y} color="var(--violet)" />
        </svg>
      )}
    </div>
  );
}

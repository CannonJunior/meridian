import { useEffect, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { useStore } from '../store';
import { toCytoscapeElements, useKnowledgeGraph } from '../kb/deriveGraph';
import type { KgType } from '../kb/ontology';

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
      Contact: cssVar('--yellow'),
      Command: cssVar('--blue'),
      RadarSystem: cssVar('--violet'),
      WeaponSystem: cssVar('--red'),
      ContextLayer: cssVar('--green'),
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
      layout: { name: 'cose', animate: false, fit: true, padding: 40 },
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
  // elsewhere (the KB manager rail, or an entity card's RELATIONSHIPS tab).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (!kbSelectedUri) return;
    const node = cy.getElementById(kbSelectedUri);
    if (node.length) {
      node.select();
      cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.2) }, { duration: 250 });
    }
  }, [kbSelectedUri]);

  return <div className="knowledge-graph-view" ref={containerRef} style={{ flex: 1, minHeight: 0, background: 'var(--map-bg)' }} />;
}

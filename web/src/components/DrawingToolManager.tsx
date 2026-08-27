// Drawing-tool panel (see CommandBar.tsx's command-bar-draw-tool-toggle and
// App.tsx's app-manager-slot-draw) — replaces the old approach of hand-
// coding a port outline straight into a TypeScript file
// (assets/portOutlines.ts, removed) with an in-app tool: preview then
// capture a Google Static Maps image at the map's current center (see
// googleStaticMap.ts — its geographic bounds are computed directly from the
// request parameters, no landmark-matching needed), trace a polygon
// directly on the map (TacticalMap.tsx attaches an OL Draw interaction
// while drawTool.phase === 'polygon'), then associate the finished shape
// with a real layer + object, a kind (outline vs. reporting point), and
// save it — durably, via POST /api/drawn-shapes (see store.ts's
// saveDrawnShape and server/src/drawnShapes.ts). Already-saved shapes for
// whichever object's card is open can be reopened here and re-edited (OL's
// Modify interaction, see TacticalMap.tsx's shapeEditing effect) via
// PATCH /api/drawn-shapes/:id.
//
// An earlier version of this tool had the user upload their own screenshot
// and manually register it by clicking matching landmarks on the image and
// on the map — that control-point UI was ripped out (see git history) for
// being fiddly and error-prone; fetching an already-georectified Google
// image for the exact viewport the user is already looking at removes the
// registration step entirely.
import { useEffect, useMemo, useState } from 'react';
import type { Feature, Polygon as GeoJSONPolygon } from 'geojson';
import { useStore } from '../store';
import type { DrawLayerId, DrawnShapeKind, DrawToolPhase } from '../store';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import { loadContextLayerData } from '../contextLayerData';
import { flattenObjects } from '../oobSelectors';
import { GOOGLE_STATIC_MAP_SCALE_OPTIONS, GOOGLE_STATIC_MAP_SIZE } from '../googleStaticMap';

interface ObjectOption {
  id: string;
  label: string;
}

const DRAW_LAYER_OPTIONS: { id: DrawLayerId; label: string }[] = [
  { id: 'maritime-ports', label: 'MARITIME PORTS' },
  { id: 'airfields', label: 'AIRFIELDS' },
  { id: 'oob', label: 'ORDER OF BATTLE' },
];

const STEP_LABELS: Record<DrawToolPhase, string> = {
  capture: 'STEP 1 OF 3 — CAPTURE GOOGLE IMAGERY',
  polygon: 'STEP 2 OF 3 — TRACE THE SHAPE ON THE MAP',
  associate: 'STEP 3 OF 3 — ASSOCIATE & SAVE',
};

const SHAPE_KIND_OPTIONS: { id: DrawnShapeKind; label: string }[] = [
  { id: 'outline', label: 'OUTLINE' },
  { id: 'reporting-point', label: 'REPORTING POINT' },
];

// Mirrors portFeature.ts / airfieldFeature.ts's own id scheme exactly (same
// fallback order: raw feature id, then a source-specific property, then a
// coordinate string) so a shape saved against e.g. "port-ports.44" resolves
// to the same objectId TacticalMap.tsx uses once that port's card is open —
// see its loadDrawnShapes effect.
function objectIdForFeature(f: Feature, prefix: string, fallbackProperty: string): string {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const coords = f.geometry.type === 'Point' ? f.geometry.coordinates : [0, 0];
  return `${prefix}-${f.id ?? p[fallbackProperty] ?? `${coords[0]},${coords[1]}`}`;
}

// Opens a saved shape's GeoJSON Polygon outer ring into the lng/lat point
// list this tool works with everywhere else (TacticalMap.tsx's Draw and
// Modify handlers both produce this same open-ring shape) — drops the
// closing duplicate vertex a GeoJSON Polygon ring always carries.
function ringFromGeometry(geometry: GeoJSONPolygon): [number, number][] {
  return geometry.coordinates[0].slice(0, -1) as [number, number][];
}

export default function DrawingToolManager() {
  const drawTool = useStore((s) => s.drawTool);
  const setCaptureScale = useStore((s) => s.setCaptureScale);
  const requestGoogleCapture = useStore((s) => s.requestGoogleCapture);
  const resetDrawTool = useStore((s) => s.resetDrawTool);
  const cancelDrawTool = useStore((s) => s.cancelDrawTool);
  const saveDrawnShape = useStore((s) => s.saveDrawnShape);
  const cardKind = useStore((s) => s.cardKind);
  const cardId = useStore((s) => s.cardId);
  const drawnShapes = useStore((s) => s.drawnShapes);
  const shapeEditing = useStore((s) => s.shapeEditing);
  const startEditingShape = useStore((s) => s.startEditingShape);
  const saveEditingShape = useStore((s) => s.saveEditingShape);

  const [layerId, setLayerId] = useState<DrawLayerId>('maritime-ports');
  const [objectQuery, setObjectQuery] = useState('');
  const [selectedObject, setSelectedObject] = useState<ObjectOption | null>(null);
  const [objectOptions, setObjectOptions] = useState<ObjectOption[]>([]);
  const [shapeName, setShapeName] = useState('');
  const [shapeKind, setShapeKind] = useState<DrawnShapeKind>('outline');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedObject(null);
    setObjectQuery('');
    if (layerId === 'oob') {
      setObjectOptions(flattenObjects().map((n) => ({ id: n.id, label: n.name })));
      return;
    }
    const layer = CONTEXT_LAYERS.find((l) => l.id === layerId);
    if (!layer) return;
    let cancelled = false;
    loadContextLayerData(layer).then((fc) => {
      if (cancelled) return;
      const prefix = layerId === 'maritime-ports' ? 'port' : 'airfield';
      const fallbackProperty = layerId === 'maritime-ports' ? 'wpi_port_id' : 'osm_id';
      const options = fc.features
        .filter((f) => f.geometry?.type === 'Point')
        .map((f) => {
          const name = (f.properties as Record<string, unknown> | null)?.name;
          if (typeof name !== 'string' || !name) return null;
          return { id: objectIdForFeature(f, prefix, fallbackProperty), label: name };
        })
        .filter((o): o is ObjectOption => o !== null);
      setObjectOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, [layerId]);

  const filteredOptions = useMemo(() => {
    const q = objectQuery.trim().toLowerCase();
    return objectOptions.filter((o) => !q || o.label.toLowerCase().includes(q)).slice(0, 60);
  }, [objectOptions, objectQuery]);

  // Saved shapes belonging to whichever port/airfield/OOB card is currently
  // open — same key scheme as TacticalMap.tsx's own drawnShapesKey
  // (duplicated inline rather than shared; it's three lines).
  const openObjectLayerId: DrawLayerId | null = cardKind === 'port' ? 'maritime-ports' : cardKind === 'airfield' ? 'airfields' : cardKind === 'oobObject' ? 'oob' : null;
  const drawnShapesKey = openObjectLayerId && cardId != null ? `${openObjectLayerId}:${cardId}` : null;
  const savedShapes = drawnShapesKey ? (drawnShapes[drawnShapesKey]?.features ?? []) : [];

  async function handleSave() {
    if (!selectedObject || !shapeName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDrawnShape({ name: shapeName.trim(), layerId, objectId: selectedObject.id, objectLabel: selectedObject.label, kind: shapeKind });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save shape.');
    } finally {
      setSaving(false);
    }
  }

  // Used for both the header's START OVER link and the post-save "draw
  // another shape" button — resetDrawTool() only touches store state, so
  // this also clears the form-local state that isn't kept there.
  function handleReset() {
    resetDrawTool();
    setSelectedObject(null);
    setObjectQuery('');
    setShapeName('');
    setShapeKind('outline');
    setSaveError(null);
  }

  function handleEditShape(feature: Feature) {
    if (!openObjectLayerId || cardId == null || feature.geometry.type !== 'Polygon' || feature.id == null) return;
    setEditSaveError(null);
    startEditingShape(String(feature.id), openObjectLayerId, cardId, ringFromGeometry(feature.geometry));
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    setEditSaveError(null);
    try {
      await saveEditingShape();
    } catch (err) {
      setEditSaveError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="draw-tool-manager" style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="draw-tool-manager-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span className="draw-tool-manager-header-accent" style={{ width: 5, height: 14, background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)' }} />
        <span className="draw-tool-manager-title" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--cyan)', fontWeight: 600 }}>
          DRAWING · TOOL
        </span>
        <span className="draw-tool-manager-header-spacer" style={{ flex: 1 }} />
        {!shapeEditing && drawTool.phase !== 'capture' && (
          <span className="draw-tool-manager-start-over" onClick={handleReset} style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--ink-faint)', cursor: 'pointer' }}>
            START OVER
          </span>
        )}
      </div>

      {shapeEditing ? (
        <>
          <div className="draw-tool-manager-step-label" style={{ padding: '8px 12px', fontSize: 9.5, letterSpacing: '.14em', color: 'var(--green)', borderBottom: '1px solid var(--hairline)' }}>
            EDITING SHAPE
          </div>
          <div className="draw-tool-manager-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="draw-tool-edit-step">
              <p className="draw-tool-edit-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5, marginBottom: 10 }}>
                Drag a vertex on the map to move it. Drag the small marker at the midpoint of an edge to insert a new vertex there.
              </p>
              {editSaveError && (
                <div className="draw-tool-edit-save-error" style={{ marginBottom: 10, fontSize: 9.5, color: 'var(--red)' }}>
                  {editSaveError}
                </div>
              )}
              <button
                type="button"
                className="draw-tool-save-edit-button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                style={{
                  width: '100%',
                  background: savingEdit ? 'var(--panel-3)' : 'rgba(95,227,154,.1)',
                  border: `1px solid ${savingEdit ? 'var(--hairline-mid)' : 'var(--green)'}`,
                  color: savingEdit ? 'var(--ink-faint)' : 'var(--green)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 10.5,
                  letterSpacing: '.1em',
                  padding: '9px 10px',
                  cursor: savingEdit ? 'not-allowed' : 'pointer',
                }}
              >
                {savingEdit ? 'SAVING…' : 'SAVE CHANGES'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="draw-tool-manager-step-label" style={{ padding: '8px 12px', fontSize: 9.5, letterSpacing: '.14em', color: drawTool.savedShapeName ? 'var(--green)' : 'var(--ink-faint)', borderBottom: '1px solid var(--hairline)' }}>
            {drawTool.savedShapeName ? 'SHAPE SAVED' : STEP_LABELS[drawTool.phase]}
          </div>

          <div className="draw-tool-manager-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {drawTool.phase === 'capture' && savedShapes.length > 0 && (
              <div className="draw-tool-saved-shapes-list" style={{ border: '1px solid var(--hairline-mid)' }}>
                <div className="draw-tool-saved-shapes-heading" style={{ padding: '6px 8px', fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)', borderBottom: '1px solid var(--hairline-subtle)' }}>
                  SAVED SHAPES
                </div>
                {savedShapes.map((f) => {
                  const props = f.properties as { name?: string; kind?: DrawnShapeKind } | null;
                  const isReportingPoint = props?.kind === 'reporting-point';
                  return (
                    <div
                      key={String(f.id)}
                      className="draw-tool-saved-shape-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--hairline-subtle)' }}
                    >
                      <span className="draw-tool-saved-shape-name" style={{ flex: 1, fontSize: 10, color: 'var(--ink-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {props?.name ?? 'Unnamed'}
                      </span>
                      <span className="draw-tool-saved-shape-kind-badge" style={{ fontSize: 8, letterSpacing: '.08em', color: isReportingPoint ? 'var(--amber)' : 'var(--cyan)' }}>
                        {isReportingPoint ? 'REPORTING PT' : 'OUTLINE'}
                      </span>
                      <button
                        type="button"
                        className="draw-tool-shape-edit-button"
                        onClick={() => handleEditShape(f)}
                        style={{ background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-mute)', fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.08em', padding: '4px 8px', cursor: 'pointer' }}
                      >
                        EDIT
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {drawTool.phase === 'capture' && (
              <div className="draw-tool-capture-step">
                <p className="draw-tool-capture-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5, marginBottom: 10 }}>
                  Pan/zoom the map to the area you want to trace — the capture area outline on the map tracks the view live. Pick a resolution below, then
                  capture once it looks right. It's placed on the map at its exact real-world position automatically.
                </p>

                <label className="draw-tool-capture-scale-label" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)' }}>
                  RESOLUTION
                </label>
                <div className="draw-tool-capture-scale-select" style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 10 }}>
                  {GOOGLE_STATIC_MAP_SCALE_OPTIONS.map((scale) => {
                    const selected = drawTool.captureScale === scale;
                    const px = GOOGLE_STATIC_MAP_SIZE * scale;
                    return (
                      <button
                        key={scale}
                        type="button"
                        className="draw-tool-capture-scale-option"
                        onClick={() => setCaptureScale(scale)}
                        style={{
                          flex: 1,
                          background: selected ? 'rgba(63,210,230,.1)' : 'var(--panel-3)',
                          border: `1px solid ${selected ? 'var(--cyan)' : 'var(--hairline-mid)'}`,
                          color: selected ? 'var(--cyan)' : 'var(--ink-mute)',
                          fontFamily: 'var(--font-display)',
                          fontSize: 9.5,
                          letterSpacing: '.04em',
                          padding: '7px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        {scale}× ({px}×{px})
                      </button>
                    );
                  })}
                </div>
                {drawTool.captureScale === 4 && (
                  <div className="draw-tool-capture-scale-note" style={{ marginBottom: 10, fontSize: 9, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                    4× requires an eligible Google Maps Platform plan — if the account doesn't support it, capture will fail with an error.
                  </div>
                )}

                {drawTool.captureError && (
                  <div className="draw-tool-capture-error" style={{ marginBottom: 10, fontSize: 9.5, color: 'var(--red)' }}>
                    {drawTool.captureError}
                  </div>
                )}

                <button
                  type="button"
                  className="draw-tool-capture-button"
                  disabled={drawTool.capturing || !drawTool.captureExtent}
                  onClick={() => requestGoogleCapture()}
                  style={{
                    width: '100%',
                    background: 'var(--panel-3)',
                    border: `1px solid ${drawTool.capturing || !drawTool.captureExtent ? 'var(--hairline-mid)' : 'var(--cyan)'}`,
                    color: drawTool.capturing || !drawTool.captureExtent ? 'var(--ink-faint)' : 'var(--cyan)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 10.5,
                    letterSpacing: '.1em',
                    padding: '9px 10px',
                    cursor: drawTool.capturing || !drawTool.captureExtent ? 'not-allowed' : 'pointer',
                  }}
                >
                  {drawTool.capturing ? 'CAPTURING…' : 'CAPTURE GOOGLE IMAGERY HERE'}
                </button>

                <button
                  type="button"
                  className="draw-tool-capture-cancel-button"
                  onClick={() => cancelDrawTool()}
                  style={{ width: '100%', marginTop: 8, background: 'var(--panel-3)', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.1em', padding: '9px 10px', cursor: 'pointer' }}
                >
                  CANCEL
                </button>
              </div>
            )}

            {drawTool.phase === 'polygon' && (
              <div className="draw-tool-polygon-step">
                <p className="draw-tool-polygon-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5 }}>
                  The captured Google imagery is now placed on the map at its exact location. Click to place each vertex of the shape directly on the map,
                  then double-click to finish.
                </p>
              </div>
            )}

            {drawTool.phase === 'associate' && drawTool.savedShapeName && (
              <div className="draw-tool-saved-confirmation">
                <div
                  className="draw-tool-saved-confirmation-badge"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.08em', fontWeight: 700 }}
                >
                  <span className="draw-tool-saved-confirmation-check">✓</span>
                  SHAPE SAVED
                </div>
                <p className="draw-tool-saved-confirmation-text" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5, marginTop: 8 }}>
                  "{drawTool.savedShapeName}"{selectedObject ? ` (${selectedObject.label})` : ''} is saved and shown on the map right where you traced it. It'll
                  also render automatically any time that object's card is open — no separate layer to turn on.
                </p>
                <button
                  type="button"
                  className="draw-tool-draw-another-button"
                  onClick={handleReset}
                  style={{ width: '100%', marginTop: 12, background: 'var(--panel-3)', border: '1px solid var(--cyan)', color: 'var(--cyan)', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.1em', padding: '9px 10px', cursor: 'pointer' }}
                >
                  DRAW ANOTHER SHAPE
                </button>
              </div>
            )}

            {drawTool.phase === 'associate' && !drawTool.savedShapeName && (
              <div className="draw-tool-associate-step">
                <div className="draw-tool-associate-vertex-count" style={{ fontSize: 9, color: 'var(--ink-faint)', marginBottom: 10 }}>
                  Shape traced — {drawTool.polygonLngLat?.length ?? 0} vertices.
                </div>

                <label className="draw-tool-layer-select-label" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)' }}>
                  LAYER
                </label>
                <select
                  className="draw-tool-layer-select"
                  value={layerId}
                  onChange={(e) => setLayerId(e.target.value as DrawLayerId)}
                  style={{ width: '100%', marginTop: 4, marginBottom: 10, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10.5, padding: '6px 7px', fontFamily: 'var(--font-mono)' }}
                >
                  {DRAW_LAYER_OPTIONS.map((o) => (
                    <option key={o.id} className="draw-tool-layer-select-option" value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <label className="draw-tool-object-search-label" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)' }}>
                  OBJECT
                </label>
                <input
                  className="draw-tool-object-search-input"
                  value={objectQuery}
                  onChange={(e) => setObjectQuery(e.target.value)}
                  placeholder="SEARCH BY NAME…"
                  style={{ width: '100%', marginTop: 4, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '5px 7px', fontFamily: 'var(--font-mono)' }}
                />
                <div className="draw-tool-object-option-list" style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--hairline-mid)' }}>
                  {filteredOptions.map((o) => {
                    const selected = selectedObject?.id === o.id;
                    return (
                      <div
                        key={o.id}
                        className="draw-tool-object-option-row"
                        onClick={() => setSelectedObject(o)}
                        style={{ padding: '6px 8px', fontSize: 10, cursor: 'pointer', color: selected ? 'var(--cyan)' : 'var(--ink-mute)', background: selected ? 'rgba(63,210,230,.08)' : 'transparent', borderBottom: '1px solid var(--hairline-subtle)' }}
                      >
                        {o.label}
                      </div>
                    );
                  })}
                  {filteredOptions.length === 0 && (
                    <div className="draw-tool-object-option-empty" style={{ padding: '8px', fontSize: 9.5, color: 'var(--ink-faint)' }}>
                      No matches.
                    </div>
                  )}
                </div>

                <label className="draw-tool-kind-select-label" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)', marginTop: 10, display: 'block' }}>
                  SHAPE KIND
                </label>
                <div className="draw-tool-kind-select" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {SHAPE_KIND_OPTIONS.map((o) => {
                    const selected = shapeKind === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="draw-tool-kind-select-option"
                        onClick={() => setShapeKind(o.id)}
                        style={{
                          flex: 1,
                          background: selected ? 'rgba(63,210,230,.1)' : 'var(--panel-3)',
                          border: `1px solid ${selected ? 'var(--cyan)' : 'var(--hairline-mid)'}`,
                          color: selected ? 'var(--cyan)' : 'var(--ink-mute)',
                          fontFamily: 'var(--font-display)',
                          fontSize: 9.5,
                          letterSpacing: '.06em',
                          padding: '7px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>

                <label className="draw-tool-shape-name-label" style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--ink-faint)', marginTop: 10, display: 'block' }}>
                  SHAPE NAME
                </label>
                <input
                  className="draw-tool-shape-name-input"
                  value={shapeName}
                  onChange={(e) => setShapeName(e.target.value)}
                  placeholder={selectedObject ? `${selectedObject.label} extent` : 'e.g. Harbor extent'}
                  style={{ width: '100%', marginTop: 4, background: 'var(--panel-3)', border: '1px solid var(--hairline-mid)', color: 'var(--ink-bright)', fontSize: 10, padding: '5px 7px', fontFamily: 'var(--font-mono)' }}
                />

                {saveError && (
                  <div className="draw-tool-save-error" style={{ marginTop: 8, fontSize: 9.5, color: 'var(--red)' }}>
                    {saveError}
                  </div>
                )}

                <button
                  type="button"
                  className="draw-tool-save-button"
                  disabled={!selectedObject || !shapeName.trim() || saving}
                  onClick={handleSave}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    background: !selectedObject || !shapeName.trim() || saving ? 'var(--panel-3)' : 'rgba(95,227,154,.1)',
                    border: `1px solid ${!selectedObject || !shapeName.trim() || saving ? 'var(--hairline-mid)' : 'var(--green)'}`,
                    color: !selectedObject || !shapeName.trim() || saving ? 'var(--ink-faint)' : 'var(--green)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 10.5,
                    letterSpacing: '.1em',
                    padding: '9px 10px',
                    cursor: !selectedObject || !shapeName.trim() || saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'SAVING…' : 'SAVE SHAPE'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="draw-tool-manager-footer" style={{ padding: 12, borderTop: '1px solid var(--hairline)' }}>
        <button
          type="button"
          className="draw-tool-cancel-button"
          onClick={() => cancelDrawTool()}
          style={{ width: '100%', background: 'var(--panel-3)', border: '1px solid var(--red)', color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.1em', padding: '9px 10px', cursor: 'pointer' }}
        >
          {shapeEditing ? 'CANCEL EDIT' : 'CANCEL'}
        </button>
      </div>
    </div>
  );
}

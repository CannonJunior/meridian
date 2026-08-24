// Drawing-tool panel (see CommandBar.tsx's command-bar-draw-tool-toggle and
// App.tsx's app-manager-slot-draw) — replaces the old approach of hand-
// coding a port outline straight into a TypeScript file
// (assets/portOutlines.ts, removed) with an in-app tool: upload a reference
// image, register it onto the live map with >=3 control points (see
// imageWarp.ts), trace a polygon directly on the map (TacticalMap.tsx
// attaches an OL Draw interaction while drawTool.phase === 'polygon'), then
// associate the finished shape with a real layer + object and save it —
// durably, via POST /api/drawn-shapes (see store.ts's saveDrawnShape and
// server/src/drawnShapes.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { Feature } from 'geojson';
import { useStore } from '../store';
import type { DrawLayerId, DrawToolPhase } from '../store';
import { CONTEXT_LAYERS } from '../assets/contextLayers';
import { loadContextLayerData } from '../contextLayerData';
import { flattenObjects } from '../oobSelectors';

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
  upload: 'STEP 1 OF 4 — UPLOAD A REFERENCE IMAGE',
  'control-points': 'STEP 2 OF 4 — PLACE CONTROL POINTS',
  polygon: 'STEP 3 OF 4 — TRACE THE SHAPE ON THE MAP',
  associate: 'STEP 4 OF 4 — ASSOCIATE & SAVE',
};

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

export default function DrawingToolManager() {
  const drawTool = useStore((s) => s.drawTool);
  const setDrawImage = useStore((s) => s.setDrawImage);
  const addImageControlPoint = useStore((s) => s.addImageControlPoint);
  const removeControlPoint = useStore((s) => s.removeControlPoint);
  const confirmControlPoints = useStore((s) => s.confirmControlPoints);
  const resetDrawTool = useStore((s) => s.resetDrawTool);
  const saveDrawnShape = useStore((s) => s.saveDrawnShape);

  const [layerId, setLayerId] = useState<DrawLayerId>('maritime-ports');
  const [objectQuery, setObjectQuery] = useState('');
  const [selectedObject, setSelectedObject] = useState<ObjectOption | null>(null);
  const [objectOptions, setObjectOptions] = useState<ObjectOption[]>([]);
  const [shapeName, setShapeName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => setDrawImage(dataUrl, img.naturalWidth, img.naturalHeight);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleImageClick(e: MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * drawTool.imageNaturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * drawTool.imageNaturalHeight;
    addImageControlPoint(x, y);
  }

  async function handleSave() {
    if (!selectedObject || !shapeName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDrawnShape({ name: shapeName.trim(), layerId, objectId: selectedObject.id, objectLabel: selectedObject.label });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save shape.');
    } finally {
      setSaving(false);
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
        {drawTool.phase !== 'upload' && (
          <span className="draw-tool-manager-start-over" onClick={() => resetDrawTool()} style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--ink-faint)', cursor: 'pointer' }}>
            START OVER
          </span>
        )}
      </div>

      <div className="draw-tool-manager-step-label" style={{ padding: '8px 12px', fontSize: 9.5, letterSpacing: '.14em', color: 'var(--ink-faint)', borderBottom: '1px solid var(--hairline)' }}>
        {STEP_LABELS[drawTool.phase]}
      </div>

      <div className="draw-tool-manager-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {drawTool.phase === 'upload' && (
          <div className="draw-tool-upload-step">
            <p className="draw-tool-upload-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5, marginBottom: 10 }}>
              Upload a reference image (e.g. a Google Maps screenshot) of the area you want to trace. You'll register it onto the live map with a few
              matching points, then draw directly on the map.
            </p>
            <input ref={fileInputRef} className="draw-tool-upload-input" type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            <button
              type="button"
              className="draw-tool-upload-button"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%', background: 'var(--panel-3)', border: '1px solid var(--cyan)', color: 'var(--cyan)', fontFamily: 'var(--font-display)', fontSize: 10.5, letterSpacing: '.1em', padding: '9px 10px', cursor: 'pointer' }}
            >
              UPLOAD REFERENCE IMAGE
            </button>
          </div>
        )}

        {drawTool.phase === 'control-points' && drawTool.imageDataUrl && (
          <div className="draw-tool-control-points-step">
            <p className="draw-tool-control-points-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5, marginBottom: 8 }}>
              {drawTool.pendingImagePoint
                ? 'Now click the matching real-world spot on the map →'
                : 'Click a landmark on the image below, then click the same landmark on the map.'}
            </p>
            <div className="draw-tool-image-frame" style={{ position: 'relative', width: '100%', border: '1px solid var(--hairline-mid)', lineHeight: 0 }}>
              <img className="draw-tool-reference-image" src={drawTool.imageDataUrl} onClick={handleImageClick} style={{ display: 'block', width: '100%', cursor: 'crosshair' }} />
              {drawTool.controlPoints.map((cp, i) => (
                <span
                  key={i}
                  className="draw-tool-control-point-marker"
                  style={{
                    position: 'absolute',
                    left: `${(cp.imageX / drawTool.imageNaturalWidth) * 100}%`,
                    top: `${(cp.imageY / drawTool.imageNaturalHeight) * 100}%`,
                    transform: 'translate(-50%,-50%)',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid var(--green)',
                    background: 'rgba(95,227,154,.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--green)',
                    pointerEvents: 'none',
                  }}
                >
                  {i + 1}
                </span>
              ))}
              {drawTool.pendingImagePoint && (
                <span
                  className="draw-tool-pending-point-marker"
                  style={{
                    position: 'absolute',
                    left: `${(drawTool.pendingImagePoint.x / drawTool.imageNaturalWidth) * 100}%`,
                    top: `${(drawTool.pendingImagePoint.y / drawTool.imageNaturalHeight) * 100}%`,
                    transform: 'translate(-50%,-50%)',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid var(--amber)',
                    background: 'rgba(255,171,56,.25)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>

            <div className="draw-tool-control-point-list" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {drawTool.controlPoints.map((cp, i) => (
                <div key={i} className="draw-tool-control-point-row" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'var(--ink-mute)' }}>
                  <span className="draw-tool-control-point-index" style={{ color: 'var(--green)', fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  <span className="draw-tool-control-point-coords" style={{ flex: 1 }}>
                    {cp.lat.toFixed(4)}°, {cp.lng.toFixed(4)}°
                  </span>
                  <span className="draw-tool-control-point-remove" onClick={() => removeControlPoint(i)} style={{ cursor: 'pointer', color: 'var(--ink-faint)' }}>
                    ✕
                  </span>
                </div>
              ))}
            </div>

            <div className="draw-tool-control-points-hint" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 8 }}>
              {drawTool.controlPoints.length} of at least 3 pairs placed.
            </div>

            <button
              type="button"
              className="draw-tool-confirm-control-points-button"
              disabled={drawTool.controlPoints.length < 3}
              onClick={() => confirmControlPoints()}
              style={{
                width: '100%',
                marginTop: 10,
                background: drawTool.controlPoints.length < 3 ? 'var(--panel-3)' : 'rgba(95,227,154,.1)',
                border: `1px solid ${drawTool.controlPoints.length < 3 ? 'var(--hairline-mid)' : 'var(--green)'}`,
                color: drawTool.controlPoints.length < 3 ? 'var(--ink-faint)' : 'var(--green)',
                fontFamily: 'var(--font-display)',
                fontSize: 10.5,
                letterSpacing: '.1em',
                padding: '9px 10px',
                cursor: drawTool.controlPoints.length < 3 ? 'not-allowed' : 'pointer',
              }}
            >
              CONTINUE TO TRACE POLYGON
            </button>
          </div>
        )}

        {drawTool.phase === 'polygon' && (
          <div className="draw-tool-polygon-step">
            <p className="draw-tool-polygon-intro" style={{ fontSize: 10, color: 'var(--ink-mute2)', lineHeight: 1.5 }}>
              The reference image is now overlaid on the map. Click to place each vertex of the shape directly on the map, then double-click to finish.
            </p>
          </div>
        )}

        {drawTool.phase === 'associate' && (
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
    </div>
  );
}

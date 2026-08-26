import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Approvals } from '../../types';
import { useStore } from '../../store';
import type { DrawLayerId } from '../../store';

export const APPR_DEFS: { k: keyof Approvals; l: string }[] = [
  { k: 'pid', l: 'POSITIVE ID (PID)' },
  { k: 'jag', l: 'ROE / JAG REVIEW' },
  { k: 'strike', l: 'STRIKE CELL CONCUR' },
  { k: 'tea', l: 'TARGET ENGAGEMENT AUTH' },
];

export function SectionLabel({ children, top = 0 }: { children: ReactNode; top?: number }) {
  return (
    <div className="section-label" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', margin: top ? `${top}px 0 8px` : '0 0 8px' }}>
      {children}
    </div>
  );
}

export function KV({ label, value, color = 'var(--ink-bright)' }: { label: string; value: ReactNode; color?: string }) {
  return (
    <>
      <span className="kv-label" style={{ color: 'var(--ink-dim2)' }}>
        {label}
      </span>
      <span className="kv-value" style={{ color, textAlign: 'right' }}>
        {value}
      </span>
    </>
  );
}

export function KVGrid({ children }: { children: ReactNode }) {
  return (
    <div className="kv-grid" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 14, fontSize: 11 }}>
      {children}
    </div>
  );
}

export function ProgressRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="progress-row" style={{ marginTop: 12 }}>
      <div className="progress-row-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-dim2)', marginBottom: 4 }}>
        <span className="progress-row-label" style={{ letterSpacing: '.1em' }}>
          {label}
        </span>
        <span className="progress-row-value" style={{ color, fontWeight: 600 }}>
          {value}%
        </span>
      </div>
      <div className="progress-row-track" style={{ height: 5, background: 'var(--hairline-subtle2)' }}>
        <div className="progress-row-fill" style={{ height: '100%', width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export function LinkRow({
  affColor,
  affShape,
  idShort,
  name,
  pillLabel,
  pillColor,
  dist,
  onClick,
}: {
  affColor: string;
  affShape: CSSProperties;
  idShort: string;
  name: string;
  pillLabel?: string;
  pillColor?: string;
  dist?: string;
  onClick?: () => void;
}) {
  return (
    <div className="link-row" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #1c2a28', background: 'var(--panel-3)', padding: '7px 9px', cursor: onClick ? 'pointer' : 'default' }}>
      <span className="link-row-aff-shape" style={{ width: 11, height: 11, background: '#0c1416', border: `1.5px solid ${affColor}`, flexShrink: 0, ...affShape }} />
      <span className="link-row-id" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink-brighter)' }}>
        {idShort}
      </span>
      <span className="link-row-name" style={{ fontSize: 10, color: affColor, flex: 1 }}>
        {name}
      </span>
      {pillLabel && (
        <span className="link-row-pill" style={{ fontSize: 8.5, letterSpacing: '.08em', padding: '1px 6px', border: `1px solid ${pillColor}`, color: pillColor, fontWeight: 600 }}>
          {pillLabel}
        </span>
      )}
      {dist && (
        <span className="link-row-dist" style={{ fontSize: 9, color: 'var(--ink-dim2)', width: 54, textAlign: 'right' }}>
          {dist}
        </span>
      )}
    </div>
  );
}

// Surfaces any shapes traced with the drawing tool (DrawingToolManager.tsx)
// and associated with this exact object — otherwise the only place they're
// visible is the map itself (see TacticalMap.tsx's drawnShapesLayerRef
// effect, which populates this same store.drawnShapes cache), which is
// easy to miss entirely if the map isn't already centered there. Renders
// nothing for the (overwhelming majority of) objects with no shapes.
export function DrawnShapesNote({ layerId, objectId }: { layerId: DrawLayerId; objectId: string }) {
  const shapes = useStore((s) => s.drawnShapes[`${layerId}:${objectId}`]);
  const deleteDrawnShape = useStore((s) => s.deleteDrawnShape);
  // Two-click confirm (click DELETE once to arm it, again to actually
  // delete) rather than a browser confirm() dialog, which would clash with
  // this app's own dark tactical chrome. deletingId tracks the in-flight
  // request so the row can't be double-submitted; error is per-row since
  // more than one row could plausibly fail independently.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  if (!shapes || shapes.features.length === 0) return null;

  async function handleDelete(shapeId: string) {
    setDeletingId(shapeId);
    setError(null);
    try {
      await deleteDrawnShape(shapeId, layerId, objectId);
    } catch (err) {
      setError({ id: shapeId, message: err instanceof Error ? err.message : 'Failed to delete shape.' });
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="card-drawn-shapes-note" style={{ marginTop: 14, padding: '9px 10px', border: '1px solid var(--hairline-mid)', background: 'var(--panel-3)' }}>
      <div className="card-drawn-shapes-note-label" style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--ink-faint)' }}>
        DRAWN SHAPES · {shapes.features.length}
      </div>
      {shapes.features.map((f) => {
        const shapeId = String(f.id);
        const armed = pendingDeleteId === shapeId;
        const deleting = deletingId === shapeId;
        return (
          <div key={shapeId} className="card-drawn-shapes-note-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span className="card-drawn-shapes-note-row-text" style={{ flex: 1, fontSize: 9.5, color: 'var(--ink-mute2)' }}>
              {(f.properties as { name?: string } | null)?.name ?? 'Untitled shape'} — shown on the map, traced with the drawing tool
            </span>
            {error?.id === shapeId && (
              <span className="card-drawn-shapes-note-row-error" style={{ fontSize: 8.5, color: 'var(--red)' }}>
                {error.message}
              </span>
            )}
            {armed && (
              <span
                className="card-drawn-shapes-note-row-cancel"
                onClick={() => setPendingDeleteId(null)}
                style={{ fontSize: 8.5, letterSpacing: '.06em', color: 'var(--ink-faint)', cursor: 'pointer' }}
              >
                CANCEL
              </span>
            )}
            <span
              className="card-drawn-shapes-note-row-delete"
              onClick={() => (deleting ? undefined : armed ? handleDelete(shapeId) : setPendingDeleteId(shapeId))}
              style={{
                fontSize: 8.5,
                letterSpacing: '.06em',
                fontWeight: armed ? 700 : 400,
                color: deleting ? 'var(--ink-faint)' : 'var(--red)',
                cursor: deleting ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              {deleting ? 'DELETING…' : armed ? 'CONFIRM DELETE' : 'DELETE'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="empty-note" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
      {children}
    </div>
  );
}

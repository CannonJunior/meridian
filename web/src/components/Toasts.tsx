import { useEffect } from 'react';
import { useStore } from '../store';
import type { Toast } from '../store';
import { ClickableDiv } from './Clickable';

const VISIBLE_CAP = 5;

// One toast row, its own component so the auto-dismiss timer (toast.autoDismissMs
// — set for non-critical real notifications, unset for target-list-transition
// toasts, which stay manual-dismiss-only as before) is scheduled per-toast via
// its own effect, cleaned up if the toast is dismissed or removed early. Calls
// dismissToast directly (rather than taking an onDismiss callback prop) so the
// effect's dependency array only ever needs the toast's own stable fields.
function ToastRow({ toast }: { toast: Toast }) {
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (toast.autoDismissMs == null) return;
    const timer = setTimeout(() => dismissToast(toast.id), toast.autoDismissMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.autoDismissMs, dismissToast]);

  return (
    <ClickableDiv
      className="toasts-toast"
      onClick={() => dismissToast(toast.id)}
      title="Click to dismiss"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        background: 'rgba(9,14,15,.94)',
        border: '1px solid var(--hairline-mid)',
        borderLeft: `3px solid ${toast.accent}`,
        padding: '9px 12px',
        fontSize: 10.5,
        color: 'var(--ink-bright)',
        cursor: 'pointer',
        boxShadow: '0 8px 22px rgba(0,0,0,.45)',
      }}
    >
      <span className="toasts-toast-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: toast.accent, boxShadow: `0 0 6px ${toast.accent}`, flexShrink: 0 }} />
      <span className="toasts-toast-text" style={{ flex: 1, lineHeight: 1.4 }}>
        {toast.text}
      </span>
      <span className="toasts-toast-close" style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>
        ✕
      </span>
    </ClickableDiv>
  );
}

// Click-to-dismiss stack, bottom-right of the center panel. New toasts are
// appended to the end of store.toasts (chronological); rendering the stack
// column-reverse puts the newest at the bottom and cascades older ones
// upward as they arrive. Capped to the VISIBLE_CAP most recent toasts at
// once — a burst (e.g. several rapid notifications) collapses the rest into
// a "+N more" chip rather than growing the stack without bound down the
// screen.
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  const overflowCount = Math.max(0, toasts.length - VISIBLE_CAP);
  const visibleToasts = toasts.slice(-VISIBLE_CAP);

  return (
    <div className="toasts-stack" style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column-reverse', gap: 8, zIndex: 40, maxWidth: 320, pointerEvents: 'none' }}>
      {visibleToasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
      {overflowCount > 0 && (
        <div
          className="toasts-overflow-chip"
          style={{
            pointerEvents: 'none',
            alignSelf: 'flex-end',
            fontSize: 9,
            letterSpacing: '.08em',
            color: 'var(--ink-faint)',
            background: 'rgba(9,14,15,.94)',
            border: '1px solid var(--hairline-mid)',
            padding: '3px 8px',
          }}
        >
          +{overflowCount} MORE
        </div>
      )}
    </div>
  );
}

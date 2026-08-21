import { useStore } from '../store';

// Click-to-dismiss stack, bottom-right of the center panel. New toasts are
// appended to the end of store.toasts (chronological); rendering the stack
// column-reverse puts the newest at the bottom and cascades older ones
// upward as they arrive — no auto-dismiss timer, a toast only clears when
// clicked.
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts-stack" style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column-reverse', gap: 8, zIndex: 40, maxWidth: 320, pointerEvents: 'none' }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
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
        </div>
      ))}
    </div>
  );
}

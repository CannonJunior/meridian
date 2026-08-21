import { useCallback, useState } from 'react';
import { useStore } from '../store';
import { RIGHT_RAIL_MAX_WIDTH, RIGHT_RAIL_MIN_WIDTH } from '../layout';

// A thin drag affordance for the left edge of a right-anchored panel. Used
// identically in three places — TargetWorkup, EventLog, and CommandBar's
// ROE/clock block — all bound to the same store.rightRailWidth, so
// dragging any one of the three resizes all three together (they're meant
// to line up as one visual column). The parent must be `position:
// relative` for this to anchor correctly; sits flush against the parent's
// left inner edge (not straddling it) since two of the three hosts clip
// overflow, which would otherwise cut the hit area in half.
export default function RightRailResizeHandle() {
  const setRightRailWidth = useStore((s) => s.setRightRailWidth);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = useStore.getState().rightRailWidth;
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        // Panel is anchored to the right edge of the screen, so dragging
        // the mouse left (negative dx) should widen it, not narrow it.
        const dx = ev.clientX - startX;
        const next = Math.min(RIGHT_RAIL_MAX_WIDTH, Math.max(RIGHT_RAIL_MIN_WIDTH, startWidth - dx));
        setRightRailWidth(next);
      };
      const onMouseUp = () => {
        setDragging(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [setRightRailWidth],
  );

  const active = hover || dragging;

  return (
    <div
      className="right-rail-resize-handle"
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 30 }}
    >
      <div
        className="right-rail-resize-handle-bar"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: active ? 'var(--amber)' : 'transparent',
          boxShadow: active ? '0 0 6px var(--amber)' : 'none',
          transition: 'background .1s, box-shadow .1s',
        }}
      />
    </div>
  );
}

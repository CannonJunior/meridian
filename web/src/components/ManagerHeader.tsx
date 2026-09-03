import type { ReactNode } from 'react';
import { TYPE_SCALE } from '../layout';

// The shared header row every right-rail/left-rail manager panel uses: a
// colored accent bar + display-font title, optionally followed by trailing
// content (a spacer + summary count, a step counter, a close button, ...).
// Previously this exact five-property style object (gradient, padding,
// border) was copy-pasted verbatim into nine separate components — any
// restyle meant nine synchronized edits, and one missed edit would silently
// drift. Centralizing it here means there is exactly one place a header
// restyle happens.
interface ManagerHeaderProps {
  className: string;
  accentClassName: string;
  titleClassName: string;
  accentColor: string;
  title: ReactNode;
  titleFontSize?: number;
  titleLetterSpacing?: string;
  // Applies flex:1 to the title span for headers where trailing content
  // (e.g. TutorialOverlay's step counter + exit button) follows directly,
  // rather than a separate spacer span pushing it to the far edge.
  titleGrow?: boolean;
  children?: ReactNode;
}

export default function ManagerHeader({
  className,
  accentClassName,
  titleClassName,
  accentColor,
  title,
  titleFontSize = TYPE_SCALE.medium,
  titleLetterSpacing = '.2em',
  titleGrow = false,
  children,
}: ManagerHeaderProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}
    >
      <span className={accentClassName} style={{ width: 5, height: 14, background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
      <span
        className={titleClassName}
        style={{ fontFamily: 'var(--font-display)', fontSize: titleFontSize, letterSpacing: titleLetterSpacing, color: accentColor, fontWeight: 600, ...(titleGrow ? { flex: 1 } : {}) }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

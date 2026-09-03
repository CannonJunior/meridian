import type { ComponentPropsWithoutRef, KeyboardEvent, MouseEvent } from 'react';

// This app styles everything inline rather than using real <button>
// elements for non-form-shaped controls (card action rows, list items,
// icon toggles, tabs) — which meant every one of those onClick handlers
// had no keyboard path (no Tab stop, no Enter/Space activation) and no
// accessible role for assistive tech. Swapping the element tag for one of
// these fixes both at once without touching layout/styling: same div/span,
// same inline style object, just with role="button", a Tab stop, and
// Enter/Space wired to the same onClick handler. The focus-visible ring
// itself is a single global rule in theme.css (`[role="button"]:focus-visible`)
// rather than reimplemented per call site.
//
// Deliberately NOT applied to every onClick in the app — drag handles
// (RightRailResizeHandle.tsx), map/canvas click targets (TacticalMap.tsx,
// DrawingToolManager.tsx), and other non-"activate a control" click
// handlers keep their plain div/span, since tabIndex/Enter-activation
// wouldn't be meaningful there.
function handleActivateKey<T extends HTMLElement>(onClick: ((e: MouseEvent<T>) => void) | undefined, onKeyDown: ((e: KeyboardEvent<T>) => void) | undefined) {
  return (e: KeyboardEvent<T>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e as unknown as MouseEvent<T>);
    }
  };
}

export function ClickableDiv({ onClick, onKeyDown, tabIndex, role, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div role={role ?? 'button'} tabIndex={tabIndex ?? 0} onClick={onClick} onKeyDown={handleActivateKey<HTMLDivElement>(onClick, onKeyDown)} {...rest} />;
}

export function ClickableSpan({ onClick, onKeyDown, tabIndex, role, ...rest }: ComponentPropsWithoutRef<'span'>) {
  return <span role={role ?? 'button'} tabIndex={tabIndex ?? 0} onClick={onClick} onKeyDown={handleActivateKey<HTMLSpanElement>(onClick, onKeyDown)} {...rest} />;
}

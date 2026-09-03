// The eight accent colors used throughout the app's theme (theme.css
// :root), offered as a shared picker palette anywhere a user gets to choose
// a color for a display attribute (e.g. the Style Manager). Deliberately
// not all ten of theme.css's accent tokens: `--amber-dim` is a shading
// variant of `--amber`, not a distinct hue, and `--violet` is reserved for
// this app's own fixed semantics (SPACE domain, 3D mode) rather than a
// color a user should be able to reassign to something else — both are
// excluded from this user-facing picker for that reason, not by oversight.
export interface PaletteColor {
  id: string;
  label: string;
  hex: string;
}

export const STYLE_PALETTE: PaletteColor[] = [
  { id: 'amber', label: 'AMBER', hex: '#ffab38' },
  { id: 'cyan', label: 'CYAN', hex: '#3fd2e6' },
  { id: 'blue', label: 'BLUE', hex: '#5b9dff' },
  { id: 'red', label: 'RED', hex: '#ff5a47' },
  { id: 'red-crit', label: 'RED CRIT', hex: '#ff3b30' },
  { id: 'yellow', label: 'YELLOW', hex: '#ffd23f' },
  { id: 'green', label: 'GREEN', hex: '#5fe39a' },
  { id: 'green-alt', label: 'GREEN ALT', hex: '#4fae7e' },
];

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

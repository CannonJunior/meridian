// Shared layout constants that need to stay in sync across components that
// don't otherwise reference each other (e.g. a header element that should
// line up with a column width set elsewhere in the grid).
//
// The "right rail" is target workup + event log + the command bar's
// ROE/clock block — three components in three different parts of the tree
// that all render at the same width so they line up as one visual column.
// That width is user-resizable (drag the left edge of any of the three;
// see RightRailResizeHandle.tsx) and lives in store.rightRailWidth, with
// these two constants as its clamp range. Default is the minimum — see
// store.ts's initial state. 360 is not arbitrary: it's the narrowest width
// that still keeps the command bar's DTG clock (command-bar-clock-dtg) on
// one line — go narrower and its 9-character "DDHHMMSSZ" string wraps.
export const RIGHT_RAIL_MIN_WIDTH = 360;
export const RIGHT_RAIL_MAX_WIDTH = 640;

// Named scale for the `fontSize` values scattered through every component's
// inline style objects (there is no CSS-class-based type scale in this
// app — see CLAUDE.md). A codebase-wide audit found 18 distinct sizes
// (7 through 20, mostly half-pixel steps) already in active use across
// ~400 call sites — this scale names every one of them faithfully rather
// than inventing a smaller "cleaner" set that would shift real layouts.
// Not a retrofit: existing literals were left as-is (a mechanical
// find-replace across ~400 sites for a purely cosmetic rename carries real
// regression risk for zero visual change). Use these names in new or
// heavily-edited components going forward instead of a bare number, so the
// scale actually converges over time rather than growing an 19th value.
export const TYPE_SCALE = {
  micro: 7, // rare fine print (e.g. a single stray label)
  microPlus: 7.5,
  tiny: 8,
  tinyPlus: 8.5, // pills, badges, secondary metadata — the single most common size
  small: 9, // section labels, hint text — the second most common size
  smallPlus: 9.5,
  base: 10, // default body text in cards/rows
  basePlus: 10.5,
  medium: 11, // row/list primary text, manager header titles
  mediumPlus: 11.5,
  large: 12,
  largePlus: 12.5,
  xl: 13,
  xl2: 14,
  xl3: 15,
  display: 16,
  displayLarge: 17,
  hero: 20, // the command bar's DTG clock — the largest text in the app
} as const;

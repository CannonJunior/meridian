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

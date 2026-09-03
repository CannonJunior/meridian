// Implementation moved to tacticalMap/ (see that directory's TacticalMap.tsx
// header for why — this repo's maintainability audit flagged the original
// single 1,800+ line file). Re-exported from this same path so nothing
// importing `./TacticalMap` (CenterPanel.tsx) needed to change.
export { default } from './tacticalMap/TacticalMap';

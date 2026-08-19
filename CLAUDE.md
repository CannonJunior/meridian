# CLAUDE.md

Guidance for working in this repository.

## Class names on every element

Every JSX element that can take a `className` (i.e. every native HTML/SVG
tag — `div`, `span`, `svg`, `g`, `rect`, `circle`, `line`, `text`, `path`,
`polygon`, `ellipse`, `input`, `button`, etc.) must have one, even though
this app is styled entirely with inline `style={{...}}` objects and has no
CSS/class-based styling. The class names are not for styling — they exist so
that elements can be addressed precisely ("update the `.port-card-header`
element") without needing to paste a code excerpt to disambiguate.

- Use kebab-case, descriptive of the element's role, not its appearance
  (`.sensor-status-dot`, not `.green-circle`).
- Prefix with the component/file so names stay unique enough to locate
  (`.target-card-kinematics-grid`, `.command-bar-clock`).
- Elements repeated via `.map()` share one class name across instances —
  that's expected; it's how you'd refer to "all of the X rows" collectively.
- When adding a new element to any component, give it a class name in the
  same pass — don't leave it for a follow-up.

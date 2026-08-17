# Handoff: MERIDIAN·FIRES — Joint C2 / Targeting Cell (Game UI)

## Overview
MERIDIAN·FIRES is a high-fidelity **command-and-control operating picture** for a near-future
military strategy/simulation game. It lets the player run the full ISR-to-fires loop against a
set of tracked entities: **detect** targets with sensors (ISR), **maintain custody** of moving
tracks (collection management), **prioritize** them, **pair shooters and weapons** to them
(effector pairing / AGM), clear **engagement authorizations**, and **engage → assess (BDA)**.

The workflow model is drawn from the real **F2T2EA kill chain** (Find, Fix, Track, Target,
Engage, Assess) and **Palantir Target Workbench** concepts (a target lifecycle Kanban board,
an HPTL high-priority target list, effector pairing with PK/TOT, no-strike list, and approvals).
It is a *game* UI styled as an amber/cyan sci-fi HUD — not a real weapons system.

## About the Design Files
The single file in this bundle — `Meridian Fires C2.dc.html` — is a **design reference created
in HTML/JS** (a working, interactive prototype showing the intended look, data, and behavior).
**It is not production code to copy directly.** It is authored as a "Design Component" (a custom
streaming-template format) and is not representative of a normal app architecture.

The task is to **recreate this design in the target codebase's environment** (e.g. React, Vue,
Svelte, a game engine's UI layer such as Unity UI Toolkit / Unreal UMG, or plain TS+Canvas) using
that project's established patterns, state management, and component libraries. If no environment
exists yet, choose the most appropriate stack for a real-time, data-dense HUD (a React + TypeScript
SPA with an SVG/Canvas map layer is a reasonable default) and implement the designs there.

Open the HTML file in a browser to interact with the live reference while building. It is designed
for a **large 16:9 display** (min 1280×760; ideal 1920×1080).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, layout, iconography, and interactions
are all specified here and visible in the prototype. Recreate the UI faithfully. The only
deliberate placeholders are: the tactical map terrain (an abstract graticule/vector field stands in
for real geospatial tiles) and the EO/IR imagery slot in the object card (a striped "drop frame"
placeholder). Wire those to real map tiles / imagery in the target app.

---

## Layout (single screen)
Full-viewport CSS grid, 5 rows:

| Row | Height | Contents |
|---|---|---|
| 1 | 24px | Top classification banner |
| 2 | 58px | Command bar (identity · mission · F2T2EA tracker · ROE · DTG clock) |
| 3 | `1fr` | Main: 3-column grid — left rail **308px**, center `1fr`, right rail **372px** |
| 4 | 234px | Bottom: target collection table (`1fr`) + fires/event log (**420px**) |
| 5 | 22px | Bottom classification banner |

Root: `width:100vw; height:100vh; min-width:1280px; min-height:760px; overflow:hidden;`
Base background `#06090a`. Body font `'IBM Plex Mono'`; display/labels `'Chakra Petch'`.

### Region map
- **Command bar (row 2):** logo mark (rotated square + ring + dot), `OP IRON MERIDIAN` mission block,
  centered **F2T2EA tracker** (6 parallelogram chips F·F·T·T·E·A reflecting the *selected target's*
  lifecycle stage), a clickable **ROE** pill (cycles WEAPONS HOLD → TIGHT → FREE), and a live
  **DTG clock** (`DDHHMMSSZ`, ticks every second) with date `28 JUN 26 · ZULU`.
- **Left rail — ISR · COLLECTION (cyan accent):** sensor laydown cards (status dot, callsign,
  platform, INT type, current TASK, endurance bar) + Named Areas of Interest list. Clicking a
  sensor card **retasks** it onto the selected target (refreshes custody, logs an event).
- **Center — COMMON OPERATING PICTURE / TARGET WORKBENCH (amber accent):** toggle between
  **MAP** and **WORKBENCH** via the top-right segmented control.
  - *MAP:* SVG tactical display — graticule, ownship range rings, bullseye, NAI boxes, sensor
    coverage footprints, no-strike zone, friendly units, and hostile/unknown/neutral track symbols
    with leader lines + a rotating selection reticle. Corner brackets, scanline, legend, compass,
    scale bar overlay.
  - *WORKBENCH:* 5-column Kanban (IDENTIFIED → PRIORITIZED → COORDINATION → EXECUTION → COMPLETE).
    Cards are **drag-and-drop** between columns (HTML5 DnD) to advance the lifecycle.
- **Right rail — TARGET WORKUP (amber accent):** single selected-target detail —
  identity + affiliation/threat/HPTL pills, IDENTIFICATION (type, category, SIDC, confidence bar),
  TRACK/KINEMATICS (MGRS, elev, course, speed, track-quality bar, decay timer), TARGET LIFECYCLE
  stepper (+ Regress/Advance), **EFFECTOR PAIRING · AGM** (candidate shooters ranked by PK/TOT/range,
  click to pair, one badged REC), WEAPONEERING/CDE, and **ENGAGEMENT AUTHORIZATION** (4 toggleable
  approvals + a gated ENGAGE / CLEARED HOT button).
- **Bottom — TARGET COLLECTION · HPTL table** (all tracks; click=select, dbl-click=object card) and
  **FIRES · EVENT LOG** (live, newest-first, color-coded by tag).

---

## Core data model

### Track / Target
```
id            "T2202"           // displayed as "2202"
name          "ANVIL"           // callsign
type          "SS-26 ISKANDER TEL"
cat           TEL|SAM|C2|SHIP|BOAT|RADAR|UAS|TROOP|EMIT
aff           HOS|UNK|FRD|NEU   // affiliation
threat        CRIT|HIGH|MED|LOW|null
stage         0..4              // index into lifecycle stages
pri           1..n | null       // HPTL rank
conf          0..100            // classification confidence %
trkQ          0..100            // track quality
x, y          0..100            // map position (% of map box)
course, speed // deg, knots (0 = static)
elev          string
custody       sensorId | "—"    // which sensor holds the track
decay         seconds since last update (drives FRESH/AGING/STALE)
effector      effectorId | null // paired shooter
method, cde   weaponeering method, collateral-damage est. (CDE-1/2/3)
nsl           bool              // near no-strike list
appr          { pid, jag, strike, tea : bool }  // approvals
status        string            // "CLEARED HOT","TRACKING","NEUTRALIZED",…
bda           string | null     // battle damage assessment after engage
engagedAt     tick | null       // set on engage; +6 ticks → COMPLETE
```
Lifecycle stages (Palantir TWB columns): `IDENTIFIED, PRIORITIZED, COORDINATION, EXECUTION, COMPLETE`
with short labels `IDENT, PRIOR, COORD, EXEC, CMPLT` and colors
`#7a8d8a, #ffd23f, #ffab38, #ff5a47, #5fe39a`.

### Sensor (ISR asset)
`id, callsign, platform, intType, status(ON STATION|TASKED|DEGRADED|RTB), tasking, endur(0-100), x, y, cov(cone|wide|area|none)`

### Effector (shooter/weapon)
`id, callsign, platform, weapon, status(AIRBORNE|ON STATION|GROUND ALERT|…), tot(min), rng(NM), suits[cat…], stealth, kinetic`
PK is computed per target: suited cat ≈ 0.78–0.92, unsuited ≈ 0.42–0.65; non-stealth vs CRIT/HIGH SAM −0.12; non-kinetic (e.g. EA-18G jam) is "NEUTRALIZE" not destroy. Recommended = highest-PK suited in-range.

### Friendly unit
`id, callsign, platform, type, role, status, x, y, weapon, endur, effId?`

### NAI
`id ("NAI-1"), desc, pir, color, x, y, w, h` (rect in map %)

### No-Strike Zone
Circle around the neutral cargo vessel (T2210 "DRIFT"); protects civilian traffic.

---

## Interactions & behavior

- **Live simulation tick (1 Hz):** advance DTG clock; move tracks with `speed>0` along `course`
  (bounce at bounds); increment `decay`, periodically refreshed by the custody sensor; jitter
  track quality; occasionally append a TRK log line.
- **Select a track:** single click (map symbol or table row) → drives the right-rail workup and the
  F2T2EA tracker.
- **Object card:** **double-click any track** (map / table / Workbench card) opens a draggable,
  multi-tab object card. Other map entities open a *context-specific* card on click or double-click
  (see "Object card" below).
- **Lifecycle:** Workbench drag-and-drop between columns, or Advance/Regress buttons in the right rail.
- **Effector pairing:** click a candidate in the AGM list to pair it to the selected target.
- **Approvals:** click each of the 4 approval rows to toggle MET/PENDING.
- **Engage:** the ENGAGE button is enabled only when `stage===EXECUTION && effector set && all 4
  approvals MET`. On engage → status "WEAPONS RELEASED", reticle turns red/LOCKED; after ~6 ticks →
  stage COMPLETE, status NEUTRALIZED, BDA logged.
- **Retask sensor:** click a sensor card (left rail) to point it at the selected target.
- **ROE pill:** click to cycle HOLD/TIGHT/FREE (color red/amber/green).
- **Map vs Workbench:** segmented toggle in the center toolbar.

### Object card — four entity kinds
A single floating, draggable window (`position:fixed`, ~544px wide, max 80vh, drag by title bar,
✕ to close). Header adapts per kind: affiliation glyph, id, name, two pills (affiliation + a
type pill), "OBJECT CARD". Tabs and body switch by kind:

| Kind | Opened from | Tabs |
|---|---|---|
| **target** (HOS/UNK/NEU tracks) | dbl-click track / table row / board card | OVERVIEW · INTELLIGENCE · ASSOCIATIONS · TARGETING · SIGNATURES |
| **sensor** (HAWK-01, GLOBE-7, SENTRY-3, ORACLE, PROWLER-2, GREYHOUND) | click/dbl-click sensor symbol | OVERVIEW · TASKING · ASSOCIATIONS |
| **unit** (CSG-1, ARLEIGH, CAP-3) | click/dbl-click friendly unit symbol | OVERVIEW · TASKING · ASSOCIATIONS |
| **nai** (NAI-1/2/3) | click/dbl-click NAI label | OVERVIEW · COLLECTION · TRACKS |
| **zone** (No-Strike Zone) | click/dbl-click "NO-STRIKE ZONE" label | OVERVIEW · PROTECTED · RESTRICTIONS |

Target card tab contents:
- **OVERVIEW:** type, category, SIDC, parent unit, first-detected, custody, lifecycle, status; confidence + track-quality bars; kinematics grid (MGRS, elev, decay, course, speed, HPTL).
- **INTELLIGENCE:** collection sources (INT type + sensor + NATO reliability rating A-1/B-2/C-3 + recency), observation-history timeline, analyst assessment.
- **ASSOCIATIONS:** linked entities — parent unit, custody sensor, paired effector, and related tracks derived from geospatial proximity / IADS topology (CO-LOCATED, AD COVER, DEFENDS, SUBORDINATE) with distances. **Clicking a linked track opens its card.**
- **TARGETING:** lifecycle, method, CDE, no-strike prox; AGM effector options (PK/TOT, assignable); authorization checklist; effects/BDA; related fires.
- **SIGNATURES:** ELINT (EMCON, band, frequency, PRF, mode, last intercept), physical signature (RCS, dimensions, mobility), and an EO/IR imagery drop placeholder.

Sensor/unit, NAI, and zone cards show contextual data (tasking + tracks under custody; PIR/area + tasked sensors + tracks inside; protected entity + entities-in-zone + ROE restrictions). All cross-link back to target cards.

---

## Design tokens

### Colors
```
Background base        #06090a
Panel bg               #080c0d / #0a0f10 / #0a1011
Panel raised / map     #070b0c, radial-gradient to #05080a
Hairline / border      #1a2725 (structure), #16221f / #16201f (subtle), #1c2a28
Ink primary            #cdd9d7   Ink bright #dfe9e7 / #e6efed / #f3ede0
Ink dim                #7a8d8a / #6f8480   Ink faint #5d6f6c / #46554f / #4a5a59

Amber (system/HUD)     #ffab38   (dim #9a7430)
Cyan (friendly/ISR)    #3fd2e6
Blue (friendly alt)    #5b9dff
Red (hostile)          #ff5a47   Crit red #ff3b30
Yellow (unknown)       #ffd23f
Green (go/neutral)     #5fe39a   (alt #4fae7e)

Classification banner  bg #2a3324, border #3c4a30, text #c7e08a
```
**Affiliation:** HOS→red `#ff5a47` (diamond), UNK→yellow `#ffd23f` (square),
FRD→cyan `#3fd2e6` (circle), NEU→green `#5fe39a` (square). MIL-STD-style geometric frames only.
**Threat:** CRIT `#ff3b30`, HIGH `#ff5a47`, MED `#ffab38`, LOW `#ffd23f`.
**Confidence/track-quality:** ≥85/≥80 green, ≥65/≥55 amber, else red.
**Decay:** <15s green "FRESH", <35s amber "AGING", else red "STALE".

### Typography
- **Chakra Petch** (400/500/600/700) — labels, headers, callsigns, big numerics, panel titles. Uppercase, letter-spacing .1–.32em.
- **IBM Plex Mono** (400/500/600) — all data/telemetry, tables, logs, kinematics.
- Sizes: panel titles 10.5–11px; section labels 9px (.18–.2em tracking); body data 10–13.5px; big numerics 15–20px; map labels 9–11px. Classification banners 10–11px (.28–.32em).

### Spacing / shape
- Panels: 1px hairline borders, header row `padding:7–8px 10–12px` with a 5px accent tab + uppercase title.
- Cards/rows: `padding:6–9px`; gaps 6–8px; **no border-radius** (square HUD aesthetic) except affiliation circles and status dots.
- Bars: 3–5px tall, track `#16201f`, fill = semantic color, occasional glow `box-shadow:0 0 6px <color>`.
- Selected row: left accent border + faint amber wash `rgba(255,171,56,.07)`.

### Animations (CSS keyframes)
- `twbspin` — selection reticle rotation, 7s linear infinite.
- `twbblink` — LIVE indicator, 1.4s.
- `twbpulse` — generic pulse.
- `twbscan` — map scanline sweep, 9s linear infinite.
- Effector/stage/tab transitions are instant (state-driven); board cards use `cursor:grab` + native DnD.

---

## State management
Central reactive store (the prototype uses a single component's state):
- `targets[]`, `sensors[]`, `effectors[]`, `units[]`, `nais[]`, `log[]`
- `selectedId` (right-rail workup target)
- `view` (`MAP` | `WORKBENCH`)
- `roeIdx` (0/1/2)
- `t` (tick counter; base DTG = 2026-06-28 03:14:00Z)
- Object card: `cardKind` (`target|sensor|unit|nai|zone`), `cardId`, `cardTab`, `cardX`, `cardY`
- Derived per render: F2T2EA phases, effector candidates+PK, associations, observation history,
  ELINT signatures, log formatting. Engagement readiness is a pure function of the selected target.

Recommended in a real app: keep entities in a normalized store; run the 1 Hz simulation in a single
ticker; memoize derived selectors (effector PK, associations); render the map layer with SVG or
Canvas (Canvas if track counts grow large). Keep the object card a portal/overlay component.

## Assets
None external. Fonts: Google Fonts **Chakra Petch** + **IBM Plex Mono** (swap for the codebase's
own families if it has a system font stack). All iconography is CSS/SVG primitives (diamonds,
circles, squares, brackets, parallelogram chips) — no image assets. The map terrain and the object
card's EO/IR frame are intentional placeholders to be replaced with real map tiles / sensor imagery.

## Screenshots
Reference renders are in `screenshots/` (1920×1080 hi-res):
- `01-operating-picture-map.png` — full screen, MAP view (command bar, ISR rail, tactical map, workup rail, collection table, log).
- `02-target-workbench-board.png` — center switched to the 5-column lifecycle Kanban (drag to advance).
- `03-target-workup-rail.png` — right-rail single-target workup (ID, kinematics, lifecycle, AGM, authorization).
- `04-objectcard-target-overview.png` — target object card, OVERVIEW tab.
- `05-objectcard-target-associations.png` — target object card, ASSOCIATIONS (linked entities).
- `06-objectcard-target-signatures.png` — target object card, SIGNATURES (ELINT + imagery slot).
- `07-objectcard-sensor.png` — friendly ISR asset card (HAWK-01) with tracks under custody.
- `08-objectcard-nai.png` — Named Area of Interest card.
- `09-objectcard-zone.png` — No-Strike Zone card.

## Files
- `Meridian Fires C2.dc.html` — the complete interactive design reference (open in a browser).
  All layout, data, colors, and interactions live here; use it as the source of truth alongside this README.
- `screenshots/` — annotated state renders (see above).

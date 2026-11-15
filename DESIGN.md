---
name: LunaSol
description: Dark mission-control workspace where the sky at a landing site drives every panel
colors:
  bg: "#070b14"
  panel: "#0b1120"
  panel-raised: "#101829"
  panel-active: "#16203a"
  line: "#1c2740"
  line-strong: "#2c3a5c"
  text: "#e6ebf5"
  text-secondary: "#a3aec6"
  text-tertiary: "#7c89a6"
  sun: "#f5b942"
  earth: "#4fa3ff"
  both-go: "#3ddc97"
  dark-blocked: "#3a4458"
  nogo: "#ff5d5d"
  marginal: "#ff9a4d"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.6vw, 68px)"
    fontWeight: 720
    lineHeight: 1.02
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 118"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 108"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 96"
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  data:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "0.95em"
    fontWeight: 400
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "13px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "30px"
    padding: "0 12px"
  button-hover:
    backgroundColor: "{colors.panel-active}"
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "#0a0f1c"
    rounded: "{rounded.md}"
    height: "30px"
    padding: "0 12px"
  segmented-item-on:
    backgroundColor: "{colors.panel-active}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "24px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "5px"
    height: "28px"
  verdict-go:
    backgroundColor: "rgba(61, 220, 151, 0.12)"
    textColor: "{colors.both-go}"
    rounded: "{rounded.sm}"
    height: "21px"
  verdict-marginal:
    backgroundColor: "rgba(255, 154, 77, 0.13)"
    textColor: "{colors.marginal}"
    rounded: "{rounded.sm}"
    height: "21px"
  verdict-nogo:
    backgroundColor: "rgba(255, 93, 93, 0.13)"
    textColor: "{colors.nogo}"
    rounded: "{rounded.sm}"
    height: "21px"
  tooltip:
    backgroundColor: "#121b30"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

## Overview

A single-screen planning workspace on a near-black blue ground. The horizon panorama sits in the centre
and every other panel is a consequence of it. Panels are separated by one-pixel hairlines, not by
shadows or cards. Colour is reserved for data: four signal colours carry Sun, Earth, both, and failure,
and the interface chrome stays neutral so those colours always mean something.

Source of truth: `app/src/styles/app.css` (`:root` custom properties) and `app/src/lib/theme.ts`, which
mirrors the same values for SVG and canvas drawing.

## Colors

- **Ground and panels.** `bg` shows only as the hairline gaps between panels; panels sit on `panel`,
  hover and inputs on `panel-raised`, the selected row or tab on `panel-active`.
- **Signal colours are fixed and semantic.** `sun` amber for sunlight and power, `earth` blue for the
  direct link, `both-go` green for power plus comms and for GO, `nogo` red for a broken limit,
  `marginal` orange for within 20% of a limit, `dark-blocked` slate for absence.
- **Never colour alone.** Every signal colour is paired with a drawn icon, a shape (circle, triangle,
  cross in charts) or a text label.
- Primary actions use `text` as their fill (a light button on the dark ground), not a signal colour.

## Typography

- **Archivo Variable** for all interface text, using its width axis: 96 for body, 108 for panel titles,
  112 for the product name, 118 for the opening title.
- **Geist Mono Variable** only for measured values: angles, times, durations, coordinates, counts.
  Always tabular numerals.
- Fixed pixel scale: 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 14.5, with 15 to 21 for lead values. Only the
  opening title is fluid.
- Self-hosted through `@fontsource-variable`; no hosted font stylesheets.

## Layout

- Video-editor model: bin (map and site list) on the left, preview (the sky) in the centre, inspector
  on the right showing one tab at a time (Compare, Limits, What if), timeline tracks along the bottom.
- App shell is a full-viewport grid: 52 px top bar, flexible main row, 204 px timeline dock (three
  tracks). No page scroll at desktop sizes; panels scroll internally.
- Main row: left rail `clamp(264px, 20.5vw, 328px)`, flexible centre, inspector
  `clamp(352px, 25.5vw, 404px)`.
- Sites are dragged from the bin onto the timeline or inspector. Drop zones show a dashed outline
  while a drag is in progress and a solid light outline when the drop would land; a chip follows the
  pointer and says what the drop will do.
- Gaps between panels are 1 px showing `line`. Panel padding is 12 px horizontal; panel headers are
  38 px tall.
- Below 1100 px the panels stack in one column with the sky first and the page scrolls.
- The readout strip uses a container query to drop the close-up lenses and azimuth when narrow.

## Elevation & Depth

Flat. Depth comes from tonal steps (`panel`, `panel-raised`, `panel-active`), not shadows. Only
floating layers cast a shadow: tooltips, the toast and the side drawer, each with an offset and a soft
blur.

## Shapes

Small radii: 3 to 6 px on controls, 8 px on the large intro button and toast, full pills only for
filter chips and the provenance badge. Borders are 1 px. Engineering limits use a solid tag border,
operations limits a dashed one.

## Components

- **Buttons**: default (raised panel fill, strong hairline border), primary (light fill, dark text),
  ghost, icon button (28 px square), text button.
- **Segmented control**: 2 px inset track, 24 px items, the active item on `panel-active` with an
  inset hairline.
- **Tabs**: underline tabs, 2 px `text` underline on the active tab; site tabs carry a verdict icon.
- **Verdict chip**: tinted background at about 12% of its colour, icon plus uppercase label.
- **Owner tag**: ENG or OPS in mono, solid or dashed border.
- **Sliders**: 3 px track with a filled portion, 13 px thumb, value shown in mono at the right.
- **Tooltip**: `#121b30`, strong hairline border, soft offset shadow, never interactive.
- **Charts** are SVG drawn with the theme constants; marks use verdict shapes as well as colour.

Motion: interface state changes are 160 ms with `cubic-bezier(0.16, 1, 0.3, 1)`; view swaps fade with a
short blur at 220 ms; bars ease over 320 ms; the ridge line morphs over 520 ms when the site changes.
Time-driven motion (Sun, Earth, shadows) is continuous. `prefers-reduced-motion` disables all of it
except time playback.

## Do's and Don'ts

- Do keep signal colours for data only, and always pair them with an icon, shape or label.
- Do put measured values in the mono face with tabular numerals; keep labels in Archivo.
- Do badge anything approximate or mock, and say where a number comes from.
- Don't add shadows between panels, gradient text, glass effects or decorative glows on chrome.
- Don't use a signal colour for a button, a border accent or an inactive state.
- Don't introduce a second accent colour or a second sans family.

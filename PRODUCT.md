# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Build from scratch per SPEC.md (confirmed by the team 2026-11-14): Vite + React + TypeScript, SVG for 2D
views, three.js via react-three-fiber for 3D, Zustand for state, Python pre-compute pipeline. Static
deploy, no backend for curated sites.

## Users

Mission planners first: people comparing lunar landing sites and dates under schedule pressure, who need
dense, precise numbers. Judges, educators and the public second: they must understand the screen within
seconds (confirmed: "planner tool + cinematic intro").

## Product Purpose

NASA Space Apps 2026 entry for the Lunar Landing Site Navigator challenge. One shared "site x date" view
answering: if we land at this site on this date, how many hours can we operate and talk home, what is
the longest night we must survive, and what changes if we slip a week?

## Positioning

The fast front door to NASA's specialist tools (JPL Horizons, LROC Quickmap, Moon Trek). Sun, Earth and
terrain are combined into one decision view, every number cites its source, and each site links out to
those tools at the same coordinates.

## Operating Context

Desktop demo at 1280-1920 px wide, often projected, run offline from a static build. Science and
engineering teams argue from the same scenario, shared by URL.

## Capabilities and Constraints

- Real data, committed to the repo: JPL Horizons sub-Earth / sub-solar points (hourly, Nov 2026 to
  Jan 2031) and LOLA terrain (LDEM_80S_80M, LDEM_64). Validation against direct Horizons queries is
  recorded in `app/public/data/validation.json`.
- An analytic fallback model must always run with zero data files, and anything approximate is badged.
- Views never touch raw data; they go through `DataProvider` and the pure functions in `app/src/lib`.
- Semantic colours are fixed: Sun amber, Earth blue, Both green, NO-GO red. Every colour also carries a
  label or icon.
- Science scores are team-assigned, not NASA values, and are labelled as such.
- Non-goals: accounts, a database, mobile-first layout, thermal modelling.

## Brand Commitments

Name: Lunar Landing Site Navigator. SPEC.md section 6 pins the visual language: dark mission-control,
near-black blue background, hairline panel borders, monospace tabular numbers, and the fixed semantic
colours above.

## Evidence on Hand

- `Context & Resources/` holds the challenge brief (PDF), SPEC.md, AGENT_BRIEF.md.
- NASA data products listed in `app/public/data/manifest.json`; imagery from the NASA SVS CGI Moon Kit
  and Blue Marble.
- No user testimonials, benchmarks or mission endorsements exist; none may be invented.

## Product Principles

1. The sky decides. Show the Sun and Earth against the real horizon before any derived number.
2. Every number has a source and a verdict has a reason.
3. A schedule slip is one click, not a new analysis.
4. One screen serves the planner and the newcomer; plain language sits beside the precise value.

## Accessibility & Inclusion

Colour-blind safe: no state is carried by colour alone. Keyboard operable time controls. Respect
reduced-motion preferences.

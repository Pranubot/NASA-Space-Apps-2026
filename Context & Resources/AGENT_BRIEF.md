# Brief for the coding agent

You are extending a working starter for the **Lunar Landing Site Navigator** (NASA Space Apps,
1-day build). Read `SPEC.md` first; it is the source of truth for scope, data contracts and UI.

## What already works (mock data, no network needed)
- `app/` Vite + React + TS. `npm install && npm run dev` → http://localhost:5173
- Site map (80°S / 60°S / global), site list, custom lat/lon (form or double-click map)
- Horizon panorama: terrain silhouette, Sun/Earth discs and paths, partial-disc occlusion, countdowns, drag-to-pan
- Timeline strips (☼ Sun, ⊕ Earth, ✓ both) with click/drag seek
- Compare scorecards with GO / MARGINAL / NO-GO verdicts and per-constraint reasons
- Constraints panel (ENG/OPS-labelled), slip-analysis chart (click a bar to re-plan)
- 3D terrain view (lazy-loaded R3F) lit by the Sun at the current time, Earthshine fill
- Shareable scenario URL (sites, dates, time, constraints)
- `npm test` → unit tests for astro maths, visibility/metrics, verdicts, mock sanity checks

## Ground rules
1. **Views never touch raw data.** Everything goes through `DataProvider` (`app/src/data/types.ts`)
   and the pure functions in `app/src/lib/`. If NASA's data arrives in another shape, write a converter
   to our contract; don't change the views.
2. **Keep `lib/` pure and tested.** Any new metric goes in `lib/visibility.ts` or `lib/scenario.ts`
   with a test.
3. **Semantic colours are fixed** (`lib/theme.ts`, `:root` in `styles.css`): Sun amber, Earth blue,
   Both green, NO-GO red. Every colour also has a label or glyph.
4. **Never lose the mock path.** `VITE_DATA_PROVIDER=mock` must always run with zero data files.
5. **Badge provenance.** Anything mock or approximate shows a badge (`source` strings, `approx: true`).
6. Desktop target 1280–1920 px wide. Don't add a backend for curated sites; static JSON is enough.

## Task queue (do in order; each is a separate, reviewable change)

### P0 polish (morning)
- [ ] Panorama: mouse-wheel zoom on azimuth; hover tooltip on the Sun path showing the time.
- [ ] Panorama: shade the sky region where the Sun is partially occluded; animate disc glow by `sunFrac`.
- [ ] Map pins: colour ring by each selected site's overall verdict (reuse `evaluate`).
- [ ] Scorecards: add "first ✓ window ≥ N h" row (time until first usable power+comms window).
- [ ] Timeline: power sparkline (`samples.powerW`) under the ☼ strip; month labels for ranges > 31 d.
- [ ] Share button: toast "Link copied".

### P1 real data (resources are now known, see SPEC §1a)
The updated brief lists tools, not files: JPL Horizons, Quickmap, Moon Trek, CSA Moon Exploration.
Kernels and the LOLA DEM are ours to fetch.
- [ ] Verify each site in Quickmap (quickmap.lroc.asu.edu) and update `app/public/data/sites.json`;
      clear `approx` flags. Add one non-CLPS commercial target (category `international` or a new
      `commercial` category, with a test) since the brief lists "other commercial lunar missions".
- [ ] `cd pipeline && pip install -r requirements.txt && python fetch_kernels.py`
- [ ] `python horizons_api.py --lat 0.674 --lon 23.473 --start 2027-01-01 --end 2027-01-02` (Apollo 11
      smoke test: Earth should sit high in the sky). Fix the CSV parser if the real header differs
      from the sample in `test_horizons_api.py`.
- [ ] Validate `ephemeris.py` (SPICE) against `horizons_api.py` for one site/time (SPEC §8 checklist).
      Record both numbers in README. If SPICE is not agreeing by ~2:00 into the day, use Horizons.
- [ ] `python export_static.py --start <d> --end <d> --step-min 60 --dem <LOLA DEM> [--ephem horizons]`;
      run app with `VITE_DATA_PROVIDER=static`. The `source` string carries through to the badge.
- [ ] Terrain3D: load a real DEM crop (add `pipeline/export_dem_crop.py` → `public/data/dem/{id}.bin`,
      Float32 N×N, plus JSON header with pixel size). Keep `mockHeightmap` as fallback.
- [ ] Map basemap: LOLA hillshade PNG in polar stereographic, aligned with `project()` in `SiteMap.tsx`.

### P1 resource links (brief names these tools; judges will look for them)
- [ ] Per-site links in the scorecard/site list: "Open in Quickmap", "Open in Moon Trek" at the site's
      lat/lon, and "Horizons query" (prefilled `coord@301` observer URL). Check each tool's URL
      parameters on the day; if a tool has no deep-link format, link its home page and show the coords
      with a copy button.
- [ ] Footer / About panel: credit JPL Horizons, LROC Quickmap, NASA Moon Trek, LOLA, NAIF SPICE and CSA.
- [ ] One explainer callout drawing on CSA Moon Exploration material (Canada's role at the south pole).

### P1 coordination features
- [ ] Scenario title + notes field (encoded in URL), shown in header.
- [ ] "Science vs Ops" mini scatter (x = science score, y = ✓ hours/day) in the right panel.

### P2 stretch
- [ ] Best-window search: for each selected site, top 5 landing dates in the next N months that are GO.
- [ ] Export: panorama PNG (serialize SVG), windows CSV.
- [ ] First-visit explainer callouts ("Why is the Sun so low?", "Why does Earth wobble?").
- [ ] `VITE_DATA_PROVIDER=http` with `pipeline/server.py` for real custom coordinates.

## Known limitations of the mock (do not "fix" these in the mock, replace with real data)
- Ephemeris is analytic: right periods and amplitudes, arbitrary phases, no parallax.
- Horizons and 3D terrain are procedural from a seed of the coordinates.
- Curated coordinates marked `approx: true` are rough.

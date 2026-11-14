# Lunar Landing Site Navigator — Product & Technical Spec

NASA Space Apps 2026 · Challenge: *Lunar Landing Site Navigator* · Build window: 1 day

> **Status of this document.** Written before the hackathon; updated 2026-11-14 for the revised
> challenge brief, which lists its resources (see §1a). The objectives and considerations did not change.
> NASA does not ship a bespoke dataset: the resources are public tools (Quickmap, Moon Trek, JPL
> Horizons) plus CSA background material. Everything data-dependent still sits behind the
> `DataProvider` interface (section 5) and runs on a physically plausible mock today. On hackathon
> day the job is to swap the mock for real data, not to redesign anything.

---

## 1. Product thesis

**One shared "site × date" view that lets science and engineering argue from the same picture.**

Science picks sites for what is in the ground (ice, permanently shadowed regions, geology).
Engineering needs the sky to cooperate: Sun above the horizon for power, Earth above the horizon for
direct-to-Earth (DTE) comms, and no dark period longer than the battery can survive. At the south pole
those three things swing wildly with a few kilometres of location or a few days of schedule.

Existing tools (Quickmap, Moon Trek, JPL Horizons) answer each question separately and need a
specialist. We answer the planner's real question in one screen:

> *"If we land at **this site** on **this date**, how many hours can we operate and talk home, what is
> the longest night we must survive, and what changes if we slip a week?"*

**Audience:** mission planners first (dense, precise, keyboard-friendly), with visuals good enough that
educators and the public "get it" instantly. We do not build a separate kids' mode.

**Judging hooks we are deliberately aiming at** (from the brief):
- "Support mission planners in coordinating between science and engineering teams" → shared scenario,
  constraint verdicts, science-vs-ops trade view.
- "Respond quickly when schedule changes … require landing date or location adjustments" → **Slip
  analysis** (date-shift chart) and side-by-side site comparison.
- "How much time remains before sunset or Earthset" → countdowns on every scorecard.
- "Make the extreme differences between lunar and terrestrial conditions apparent" → the horizon
  panorama with the Sun skimming the horizon, and the 3D shadow time-lapse.
- "Why small location or date changes have large impacts" → compare mode + slip chart.

## 1a. Challenge resources (from the updated brief) and how we use them

The brief's "Resources" section now lists exactly these. No kernels, DEM files, site lists or
precomputed ephemeris tables are provided, so we source those ourselves (rightmost column).

| Listed resource | What it is | How we use it |
|---|---|---|
| **JPL Horizons** — ssd.jpl.nasa.gov/horizons | Ephemeris service; Sun/Earth position from any point on the Moon (`coord@301`) | **Second ephemeris backend** (`pipeline/horizons_api.py`, same §5.3 contract as SPICE; `export_static.py --ephem horizons`). Reference for validation #1. Primary source if SPICE setup stalls. Pre-computed, never called live from the app. |
| **Quickmap (LROC / ASU)** — quickmap.lroc.asu.edu | Web map of LRO imagery, LOLA topography and polar products | Verify curated site coordinates (clear `approx` flags); visual check of one terrain horizon and of illumination at a rim vs a crater floor (validation #3); "Open in Quickmap" link per site. |
| **Moon Trek (NASA)** — trek.nasa.gov/moon | 3D lunar viewer with LOLA-based topography and downloadable layers | Cross-check the 3D terrain view and horizon shape; candidate source for DEM crops / basemap tiles if the PGDA download is slow; "Open in Moon Trek" link per site. |
| **CSA Moon Exploration** — asc-csa.gc.ca/eng/astronomy/moon-exploration | Canadian Space Agency background on lunar missions and Artemis role | Educator/explainer content and the "international" site category (e.g. Canada's planned lunar rover in the south polar region, Canadarm3 on Gateway). Background only, no data. |

Data we still fetch ourselves, unchanged from the original plan: NAIF SPICE generic kernels
(`fetch_kernels.py`) and a LOLA south-polar DEM (LDEM_80S_xxM from the LOLA PDS / PGDA archive) for
`horizon.py`. The brief's Technical-approach bullets explicitly endorse both ("Horizons ... or
pre-computed datasets", "LOLA ... accurate horizon calculations").

**Judging angle:** the brief says these tools "are built for detailed analysis and are often difficult
for non-specialists". We position the Navigator as the fast front door to them: every number cites
its source (badge), and each site links out to Quickmap / Moon Trek / Horizons at the same coordinates.

## 2. Scope and priorities

| Pri | Feature | Why it matters | Done when |
|-----|---------|----------------|-----------|
| **P0** | Site picker (polar map + list + custom lat/lon) | Entry point | Click a pin or type coords → site becomes focused; up to 3 selected for compare |
| **P0** | Time model + scrubber (play/pause, speed, range) | Drives every view | One `currentTime` in the store; all views react |
| **P0** | Horizon panorama (hero 2D) | The core visual the brief asks for | Terrain silhouette, Sun & Earth current discs, their paths over the range, live az/el readout |
| **P0** | Timeline strips (Sun / Earth / Both) | Windows at a glance | Bars per selected site, cursor synced to `currentTime`, click to seek |
| **P0** | Scorecard + constraint verdicts | Turns pictures into a decision | GO / MARGINAL / NO-GO per constraint, countdown to sunset & Earthset |
| **P0** | Compare mode (2–3 sites) | Brief's main ask | Same date range, columns aligned, best value highlighted |
| **P1** | Slip analysis (landing date ±N days) | "Schedule slipped, now what?" | Bar chart of comms+power hours and longest dark vs landing offset, click to apply |
| **P1** | Real data swap (SPICE ephemeris + LOLA horizons) | Credibility | `VITE_DATA_PROVIDER=static` renders real curated sites |
| **P1** | 3D terrain view with live Sun shadows | Wow factor for demo | Heightmap patch lit by the Sun at `currentTime`, Earth in the sky |
| **P1** | Resource links + provenance | Ties us to the brief's named tools | Per-site "Open in Quickmap / Moon Trek" and "Horizons query" links; footer credits all four listed resources |
| **P1** | Shareable scenario URL | Coordination story | URL encodes sites, range, constraints, time; reload restores it |
| **P2** | Custom-site real data via FastAPI | Any coordinate, real accuracy | `VITE_DATA_PROVIDER=http` + `pipeline/server.py` |
| **P2** | "Find best windows" search | Planner power-tool | Given constraints, list top landing dates per site |
| **P2** | Science-vs-ops trade scatter | Coordination story, visual | Sites plotted science score × ops score |
| **P2** | Explainer overlays ("why is the Sun so low?") | Education angle | 3–4 dismissible callouts on first visit |
| **P2** | Export (PNG of panorama, CSV of windows) | Hand-off to real workflow | Buttons on each panel |

**Explicit non-goals:** user accounts, a database, mobile-first layout (desktop demo; just don't break
at 1280 px), illumination maps for whole regions, thermal modelling.

## 3. Architecture

```
┌───────────────────────────── Offline / pre-compute (Python) ─────────────────────────────┐
│  NAIF SPICE kernels ──► pipeline/ephemeris.py ──┐                                        │
│  (de440s, moon_pa, fk, lsk)                     │                                        │
│  JPL Horizons API ───► pipeline/horizons_api.py ┤  (either one, --ephem spice|horizons)  │
│                                                 ├─► pipeline/export_static.py ──► app/public/data/*.json
│  LOLA polar DEM (GeoTIFF/IMG) ─► pipeline/horizon.py ┘                                    │
│  sites.yaml (curated + science attributes)                                               │
│                                                                                          │
│  Optional live service: pipeline/server.py (FastAPI) — same JSON contract, any lat/lon   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                         │  JSON (contract in §5)
┌────────────────────────────────── Web app (Vite + React + TS) ───────────────────────────┐
│  DataProvider  ── mock (default, no data needed) | static (public/data) | http (FastAPI) │
│        │                                                                                 │
│  lib/visibility.ts  — disc-occlusion, windows, metrics (pure, unit-tested)               │
│  lib/scenario.ts    — constraints → verdicts, slip analysis                              │
│        │                                                                                 │
│  Zustand store (sites, selection, timeRange, currentTime, playback, constraints) ◄─► URL │
│        │                                                                                 │
│  Views: SiteMap · HorizonPanorama · TimelineStrips · Scorecards · SlipChart · Terrain3D  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Stack and why**
- **Vite + React 18 + TypeScript.** Fastest feedback loop, the agent knows it well.
- **2D views: SVG + d3-scale/d3-shape inside React.** The panorama, timelines, polar map and slip chart
  are all custom geometries with < 5k marks; SVG is crisp, animatable and easy to style.
  *Change from the earlier plan:* we drop deck.gl. It is built for Web-Mercator geo layers, and a
  south-polar projection on another body fights it. A hand-rolled polar azimuthal projection is ~10
  lines.
- **3D view: three.js via @react-three/fiber + drei.** Heightmap mesh + directional light (= Sun) with
  shadow maps gives the "shadows sweeping across craters" moment cheaply.
- **State: Zustand** (one store, selectors per view). **Motion: CSS transitions + rAF loop**; add
  Framer Motion only if a panel transition genuinely needs it.
- **Pre-compute: Python 3.11, spiceypy, numpy, rasterio.** SPICE gives topocentric Sun/Earth
  azimuth & elevation including libration and light-time; LOLA gives terrain horizons.
- **Deploy:** static build (Vercel / Netlify / GitHub Pages). No backend needed for curated sites.

**Why pre-compute instead of calling JPL Horizons live:** Horizons is rate-limited and slow for
hundreds of site×date queries; the demo must not depend on venue Wi-Fi. We still use Horizons, the
brief's named tool, offline: `horizons_api.py` makes two requests per site (Sun, Earth) for the whole
range and writes the same JSON as SPICE. Note Horizons gives geometry only; terrain blocking always
comes from our LOLA ray-cast. A year of hourly Sun+Earth
az/el for one site is ~140 KB of JSON (smaller as packed numbers), so 20 sites is trivial.

## 4. Domain model and the maths that matters

- **Lunar frame:** Mean Earth / polar axis (`MOON_ME`), planetocentric lat/lon, east-positive,
  radius 1737.4 km.
- **Topocentric az/el:** azimuth measured from local north, clockwise (east = 90°). Elevation above the
  *local horizontal plane*, not above terrain.
- **Terrain horizon** `h(az)`: elevation angle of the highest terrain along each azimuth, including the
  Moon's curvature (drop ≈ d²/2R). Can be negative on peaks (you see "over the edge"). No atmosphere →
  no refraction correction, ever.
- **Visibility of a disc.** Sun angular radius ≈ 0.267°, Earth from the Moon ≈ 0.95°. At the pole the
  Sun's centre often sits within a degree of the terrain line, so we model **partial** visibility: the
  fraction of the disc above `h(az)` using the circular-segment area. This is what makes power ramp
  rather than toggle, and is visible in the panorama.
- **Power proxy.** `P = P_rated × visibleFraction × cos(sunElevation)` for a vertical, Sun-tracking
  array (the south-pole standard because the Sun is near the horizon). Optional horizontal-panel mode:
  `sin(el)`. Energy = Σ P·Δt.
- **Comms.** Earth visible if its centre clears `h(az) + earthMaskDeg` (antenna mask, default 0.5°).
- **Both.** Sun fraction ≥ `sunMinFraction` (default 0.5) **and** Earth visible. This is the headline
  "can operate and talk home" metric.
- **Longest dark.** Longest continuous run with Sun fraction below threshold — compared against the
  battery survival limit.
- **Seasonality.** Subsolar latitude swings ±1.54° over an *eclipse year* (~346.6 d), not a
  terrestrial year; that is why south-pole lighting has "seasons". Earth's sub-point librates about
  ±6.7° lat and ±7.9° lon on ~27-day periods, which is why Earth traces a small loop in the panorama
  instead of sitting still. Both effects are in the mock and (properly) in SPICE.

## 5. Data contracts (the swap boundary)

All times are **UTC ISO-8601** at the edges and **epoch milliseconds** inside the app. Angles in
degrees. Every JSON file has a `source` string so the UI can badge "MOCK" vs "SPICE/LOLA".

### 5.1 `Site`
```ts
interface Site {
  id: string;                 // "shackleton-rim", kebab-case, stable
  name: string;
  lat: number;                // planetocentric, deg, south negative
  lon: number;                // east-positive, deg, -180..180
  category: "artemis" | "clps" | "international" | "apollo" | "custom";
  mission?: string;           // "Artemis III candidate", "IM-2 Athena", ...
  approx?: boolean;           // true = coordinates are approximate, verify before demo
  science?: {
    score: number;            // 1-5, team-assigned (or from challenge data)
    tags: string[];           // ["PSR-adjacent", "ice", "massif"]
    note?: string;
  };
  elevationM?: number;        // from DEM, filled by the pipeline
}
```
File: `public/data/sites.json` → `{ "source": string, "sites": Site[] }`.

### 5.2 `HorizonProfile`
```ts
interface HorizonProfile {
  siteKey: string;            // site id, or "lat,lon" for custom
  azStepDeg: number;          // e.g. 0.5
  elevationDeg: number[];     // length 360/azStepDeg; index i ↔ azimuth i*azStepDeg
  observerHeightM: number;    // mast/array height used for the ray-cast
  maxRangeKm: number;
  source: string;             // "mock" | "LOLA LDEM_80S_80M ray-cast"
}
```
File: `public/data/horizons/{siteId}.json`.

### 5.3 `EphemerisSeries`
```ts
interface EphemerisSeries {
  siteKey: string;
  startMs: number;            // epoch ms of sample 0
  stepMin: number;            // e.g. 60
  count: number;
  sun:   { az: number[]; el: number[] };          // topocentric, deg
  earth: { az: number[]; el: number[] };
  sunRadiusDeg: number;       // 0.267 (or per-sample array if you need it)
  earthRadiusDeg: number;     // ~0.95
  source: string;             // "mock-analytic" | "SPICE de440s + moon_pa_de440"
}
```
File: `public/data/ephemeris/{siteId}.json` covering the published date range
(`public/data/manifest.json` lists `{ startIso, endIso, stepMin, siteIds }`). Times are implicit:
`t_i = startMs + i·stepMin·60000`. Arrays are rounded to 3 decimals in export to keep files small.

### 5.4 `DataProvider` (the only thing views talk to)
```ts
interface DataProvider {
  readonly name: string;
  listSites(): Promise<Site[]>;
  getHorizon(site: SiteRef): Promise<HorizonProfile>;
  getEphemeris(site: SiteRef, startMs: number, endMs: number, stepMin: number): Promise<EphemerisSeries>;
}
type SiteRef = { id: string; lat: number; lon: number };
```
Implementations: `MockProvider` (analytic, any coordinate, any date), `StaticProvider` (reads
`public/data`, curated sites only, falls back to mock for custom coords and says so in the UI),
`HttpProvider` (FastAPI, any coordinate). Chosen by `VITE_DATA_PROVIDER=mock|static|http`.

### 5.5 Derived (computed in the browser, never stored)
```ts
interface VisibilitySample { t: number; sunFrac: number; sunEl: number; sunClear: number;
                             earthVisible: boolean; earthEl: number; earthClear: number; both: boolean; powerW: number; }
interface Window { startMs: number; endMs: number }
interface SiteMetrics {
  sunlitPct: number; earthPct: number; bothPct: number;
  sunHours: number; earthHours: number; bothHours: number;
  longestDarkH: number; longestCommsGapH: number;
  meanSunElLitDeg: number; energyKWh: number;
  sunWindows: Window[]; earthWindows: Window[]; bothWindows: Window[];
}
interface Constraints {
  sunMinFraction: number;     // 0.5
  earthMaskDeg: number;       // 0.5
  maxDarkH: number;           // battery survival, e.g. 50
  minBothHoursPerDay: number; // e.g. 6
  panelW: number;             // 1000
  panelMode: "vertical" | "horizontal";
}
type Verdict = "GO" | "MARGINAL" | "NO-GO";  // MARGINAL = within 20% of a limit
```

### 5.6 Scenario (shareable state, URL-encoded)
```ts
interface Scenario { siteIds: string[]; custom: SiteRef[]; startMs: number; days: number;
                     tMs: number; focusId: string; constraints: Constraints }
```
Encoded as compact query params (`?s=shackleton-rim,malapert-massif&start=2027-01-01&d=30&t=...`).

## 6. Screens (text wireframes)

Visual language: **dark mission-control**. Near-black blue background, hairline panel borders,
monospace tabular numbers. Fixed semantic colours used everywhere: **Sun = amber `#f5b942`**,
**Earth = sky-blue `#4fa3ff`**, **Both = green `#3ddc97`**, **Dark/blocked = slate `#3a4458`**,
**NO-GO = red `#ff5d5d`**. Every colour also carries a label or icon (colour-blind safe).

### 6.1 Main layout (1440 × 900)
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◐ LUNAR LANDING SITE NAVIGATOR      Scenario: Artemis-ish slip study   [MOCK DATA]   ⧉ Share     │
├──────────────────────┬───────────────────────────────────────────────────────┬───────────────────┤
│ SITES                │ HORIZON — Shackleton Rim            [Panorama | 3D]   │ COMPARE           │
│ ┌──────────────────┐ │  +12°┤                                                │ ┌───────┬───────┐ │
│ │   polar map      │ │      │            ☼ path · · · · · ·                  │ │Shackl.│Malap. │ │
│ │  80°S rings,     │ │   0° ┤▁▂▃▅▆▅▃▂▁▁▂▃▅▇▇▅▃▂▁▂▃▄▅▄▃▂▁   ⊕ loop          │ │ GO    │MARGIN.│ │
│ │  pins coloured   │ │      │███████████ terrain ████████████████████        │ │Sun 78%│Sun 61%│ │
│ │  by verdict      │ │  -3° ┼──N────E────S────W────N──                        │ │Earth… │Earth… │ │
│ └──────────────────┘ │  ☼ az 132.4° el 0.84° 92% disc   ⊕ az 1.2° el 3.9°    │ │Both…  │Both…  │ │
│ [search sites…]      │  Sunset in 4d 06h      Earthset in 9d 11h             │ │Dark…  │Dark…  │ │
│ ☑ Shackleton Rim     │                                                       │ │kWh…   │kWh…   │ │
│ ☑ Malapert Massif    │                                                       │ └───────┴───────┘ │
│ ☐ Haworth            │                                                       │ CONSTRAINTS       │
│ + Custom lat/lon     │                                                       │ Earth mask 0.5°   │
│                      │                                                       │ Max dark  50 h    │
│                      │                                                       │ Both/day ≥ 6 h    │
├──────────────────────┴───────────────────────────────────────────────────────┴───────────────────┤
│ TIMELINE  2027-01-01 → 2027-01-31                         ◀◀  ▶  ▶▶   1 h/s ▾   [30 d ▾]         │
│ Shackleton  ☼ ███████████░░░░░███████████████░░░░████████   ← cursor │                           │
│             ⊕ ████████████████████████░░░░░░░░░░░██████████          │                           │
│             ✓ ███████████░░░░░░░░░░░░░░░░░░░░░░░░█████████           │                           │
│ Malapert    ☼ …                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SLIP ANALYSIS (focused site) — landing offset −15 … +30 d, mission length 14 d                   │
│  both-hours ▇▇▆▅▃▂▁▁▂▃▅▆▇▇▇▆▅▃▂▁…   longest-dark line overlay   ▲ current plan                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Site picker
- Polar azimuthal-equidistant map, south pole at centre, **0° longitude (Earth-facing) pointing up** —
  this makes "Earth is always low in the north-ish sky" intuitive.
- Toggle `80°S | 60°S | Global` (global = simple equirectangular, so Apollo / far-side sites show).
- Pins: hollow = available, filled = selected (max 3), ring = focused. Pin colour = verdict for the
  current scenario once computed. Hover: name, mission, lat/lon, science tags.
- List below with search, category filter chips, checkbox to select, click to focus.
- **Custom site:** lat/lon inputs with validation, "Add" creates a `custom` site (`custom-<lat>-<lon>`).
- Real data: basemap = LOLA hillshade PNG in polar stereographic (P1); mock = rings, spokes and
  procedural craters.

### 6.3 Horizon panorama (hero)
- X: azimuth 0–360°, wrapping, default centred on the Earth azimuth so Earth sits mid-frame.
- Y: elevation, **vertically exaggerated** (default −3° … +12°, label "vertical scale ×N").
- Layers back to front: sky gradient → star field (static) → Sun path over range (dotted amber, opacity
  by time distance from cursor) → Earth path (libration loop, blue) → Sun disc / Earth disc at
  `currentTime` (true angular size × exaggeration, glow) → terrain silhouette (filled, occludes discs
  naturally) → grid + cardinal labels → readouts.
- Readouts: az/el, % of Sun disc visible, clearance above terrain (`el − h(az)`), countdown to next
  sunset / Earthset (or "rises in …").
- Interactions: drag horizontally to pan, wheel to zoom azimuth range, click the Sun path to seek to
  that time.

### 6.4 Timeline strips
- Shared X = time range. Per selected site: three 10 px strips (☼ Sun, ⊕ Earth, ✓ Both). Gaps in slate.
- Vertical cursor at `currentTime`; click / drag anywhere to seek. Hover tooltip = window start/end and
  duration. Day ticks; month labels.
- Optional thin sparkline under ☼ showing power W.

### 6.5 Compare / scorecards
- One column per selected site (2–3). Rows: verdict chip, sunlit %, Earth %, **Both %** (bold),
  longest dark (h) vs limit, longest comms gap, mean Sun elevation when lit, energy kWh over range,
  sunset / Earthset countdown at cursor, science score and tags.
- Best value in each row gets a subtle highlight; worst gets nothing (avoid noise).
- Each constraint row shows its own GO / MARGINAL / NO-GO so a science lead can see *which* engineering
  limit kills a site.

### 6.6 Slip analysis (P1)
- For the focused site: evaluate landing at offsets −15 … +30 days (1-day step), each over a
  mission-length window (default 14 d). Bars = both-hours; line = longest dark; horizontal rule = limit.
- Bars coloured by verdict. Click a bar → sets the scenario start to that date.

### 6.7 3D terrain (P1)
- 20 × 20 km heightmap patch centred on the site (real: cropped LOLA DEM, ~100 m/px; mock: fBm noise
  with craters). Directional light from the Sun's az/el at `currentTime`, PCF shadows on, ambient very
  low (no atmosphere → harsh black shadows). Earth as a textured sphere on the sky dome.
- Orbit controls; a "lander eye" button drops the camera to 2 m at the site looking toward the Sun.
- On play, shadows sweep. This is the 10-second demo clip.

## 7. Repo layout (starter template provided)

```
lunar-navigator/
├── SPEC.md                 ← this file
├── AGENT_BRIEF.md          ← instructions for the coding agent
├── app/                    ← Vite + React + TS web app (runs today on mock data)
│   ├── public/data/sites.json
│   └── src/
│       ├── data/           types.ts, provider.ts, mockProvider.ts, staticProvider.ts, httpProvider.ts, mock/*
│       ├── lib/            astro.ts, visibility.ts, scenario.ts, time.ts (+ *.test.ts)
│       ├── state/          store.ts, url.ts
│       ├── hooks/          useSiteData.ts, usePlayback.ts, useSize.ts
│       └── components/     SiteMap, SiteList, HorizonPanorama, TimelineStrips, Scorecards,
│                           ConstraintsPanel, TimeControls, SlipChart, Terrain3D
└── pipeline/               ← Python pre-compute (SPICE + LOLA), FastAPI server
    ├── requirements.txt, fetch_kernels.py, ephemeris.py, horizon.py, export_static.py, server.py
    └── sites.yaml
```

## 8. Hackathon-day plan

Team of 3–4 plus coding agents. Times are from kick-off.

| Time | Data/pipeline | Frontend A (hero visuals) | Frontend B (planner UX) |
|------|---------------|---------------------------|-------------------------|
| 0:00–0:45 | Resources are known (§1a). Start LOLA DEM download; verify site coords in Quickmap, update `sites.yaml`; `python horizons_api.py` smoke test for Apollo 11 | Run app on mock; polish panorama styling | Run app; wire URL scenario + share button |
| 0:45–3:00 | `fetch_kernels.py`, run `ephemeris.py` for 3 sites, compare with `horizons_api.py` for one timestamp. If SPICE is not agreeing by 2:00, export with `--ephem horizons` and move on | Panorama interactions (pan/zoom, click-to-seek), discs + glow | Compare columns, verdict chips, countdowns |
| 3:00–5:00 | `horizon.py` on LOLA DEM; export static JSON; switch `VITE_DATA_PROVIDER=static` | Terrain3D with real DEM crop | Slip analysis chart |
| 5:00–7:00 | All curated sites exported; validate one horizon against Quickmap / Moon Trek visually | Basemap hillshade; animations | Constraint editing, best-window search (P2) |
| 7:00–9:00 | FastAPI for custom coords (P2) | Explainer overlays (P2) | Export PNG/CSV (P2) |
| 9:00–end | **Freeze features.** Record demo video, write README, deploy static build. | | |

**Validation checklist (credibility in front of judges):**
1. One site, one timestamp: SPICE Sun az/el within 0.05° of JPL Horizons (observer = site coords on 301,
   `horizons_api.py` gives the reference). Record both numbers in the README.
2. Earth az/el at a near-side equatorial site (Apollo 11) ≈ near zenith-ish ± libration; far-side site
   (Chang'e 4) never shows Earth. Easy, visible sanity checks.
3. A known highly-illuminated rim site shows sunlit % in the 70–90 % range over a southern-summer month;
   a crater-floor point near Shackleton shows ~0 %. Compare against the polar illumination layers in
   Quickmap where available.

## 9. Demo script (3 minutes)

1. **Hook (20 s):** "Artemis wants the south pole. The Sun there never rises more than a couple of
   degrees. A hill 10 km away can turn your power off." Show panorama, press play, Sun skims the ridge.
2. **Decision (60 s):** Select two candidate rims. Compare columns: one is GO, one is NO-GO on longest
   dark. "Science wanted the second one for the ice. Now everyone can see why engineering says no."
3. **Slip (40 s):** "The launch slipped two weeks." Slip chart: drag offset, the second site becomes GO
   in a different window. Click, the whole scenario updates. Share link.
4. **Wow (30 s):** 3D view, time-lapse, shadows sweep across craters, Earth wobbling on the horizon.
5. **Close (30 s):** Data provenance badge (SPICE / JPL Horizons + LOLA), the "Open in Quickmap / Moon
   Trek" links ("we are the fast front door to NASA's tools"), how it scales to any coordinate.

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| No challenge dataset (confirmed: resources are tools, not files) | We fetch kernels + LOLA DEM ourselves; Horizons API is the fallback ephemeris; contract stays ours |
| Horizons API slow / rate-limited on the day | Sequential requests with a pause, two per site; run once early and commit the JSON; SPICE as the other backend |
| DEM too large to process in time | Use coarser product (80 m–120 m/px) and limit ray to 150 km; still captures big massifs |
| SPICE frame/kernel mistakes | Cross-check one point with Horizons (validation #1) before exporting everything |
| 3D eats the day | 3D is P1 and isolated in one component; panorama is the hero, 3D is garnish |
| Venue Wi-Fi | Static build, all data in `public/data`, mock fallback always works |
| Coordinates for curated sites are wrong | `approx: true` badge in UI until verified against Quickmap / published mission coordinates |

## 11. Open questions for hackathon day

Answered by the updated brief (2026-11-14):
- ~~Do they provide ephemeris tables?~~ No. They point to JPL Horizons, or "pre-computed datasets"
  (our SPICE path qualifies).
- ~~Which LOLA product?~~ None named. LOLA is suggested in general; Quickmap and Moon Trek expose LOLA
  topography. We pick LDEM_80S at 20–80 m/px ourselves.
- ~~Official site list?~~ No list. The objectives name the categories (Apollo, CLPS, other commercial,
  other countries). `sites.json` covers Apollo, CLPS, Artemis and international; it still lacks a
  non-CLPS commercial target (e.g. an ispace landing site). All coordinates are ours to verify.

Still open:
- Any expected date range (e.g. Artemis III window)? Default: Dec 2026 to Jan 2028.
- Will more resources be added before kick-off? Re-check the challenge page at 0:00.

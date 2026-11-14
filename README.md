# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 · *Lunar Landing Site Navigator*

One screen that answers the planner's question: **if we land at this site on this date, how many hours
can we operate and talk home, what is the longest night we must survive, and what changes if the
schedule slips?**

Sun and Earth positions come from JPL Horizons. Terrain horizons come from LOLA. Everything runs
offline from static files.

## Run it

```bash
cd app
npm install
npm run dev        # http://localhost:5173
```

Other commands, all from `app/`:

| Command | What it does |
|---|---|
| `npm test` | 23 unit tests on the astronomy, visibility and verdict maths, checked against the shipped Horizons data |
| `npm run build` | Type-check and build the static site into `app/dist` |
| `VITE_DATA_PROVIDER=mock npm run dev` | Run with no data files (analytic ephemeris, procedural terrain, "Mock data" badge) |

Requires Node 22 or newer (built with Node 24). The NASA-derived data (16 MB) is already in `app/public/data`.

## What is in it

- **Horizon panorama.** The sky from the landing site: the real LOLA ridge line, the Sun and Earth at
  the current time, and their paths across the mission. Elevation is stretched so a Sun 1° up is
  readable. Drag to pan, scroll to zoom, click a path to jump to that time, track the Sun or Earth.
- **True-scale close-ups** of the Sun and Earth against the terrain, showing partial occlusion and
  Earth's phase.
- **Countdowns** to sunset, sunrise, Earthset and Earthrise, and a plain-language line describing the
  current sky.
- **Live shadow map of the south pole.** The LOLA elevation model is shaded in a WebGL shader that
  ray-marches towards the Sun at the current time, so real shadows sweep across the craters as time
  plays. Switch to a whole-Moon globe you can turn, lit from the real Sun direction.
- **26 curated sites**: Artemis III candidate regions, CLPS landers, a commercial lander, international
  missions, the six Apollo sites, and the permanently shadowed floor of Shackleton. Add any coordinate
  by typing it or double-clicking the map; its horizon is computed from LOLA in the browser.
- **Compare up to three sites** side by side, with GO / MARGINAL / NO-GO for each engineering and
  operations limit and the limit that decides the result named in a sentence.
- **Mission limits** you can drag: battery survival, power-plus-comms hours per day, comms gap,
  antenna mask, Sun disc fraction, array rating and type. Every verdict updates as you drag.
- **Timeline** with Sun, Earth and power-plus-comms windows per site, a power trace, playback and
  scrubbing.
- **Schedule slip.** The same mission evaluated for landing 15 days early to 30 days late. Click a bar
  to move the landing.
- **Best dates.** The top landing dates in the next 300 days for each site, and for all selected sites
  together.
- **Science vs operations** scatter across every site.
- **3D terrain** from LOLA with ray-marched shadows, an overview and a lander-eye camera.
- **Share** copies a link that restores sites, dates, limits, time and custom coordinates.
- **Export** the panorama as PNG and the windows as CSV.
- **Guide and data sources** panel: why the Sun is low, why Earth wobbles, how verdicts work, and
  where every number comes from.

Keyboard: `Space` play/pause, `←` `→` step one hour (`Shift` for six), `Home` back to landing,
`1` `2` `3` focus a compared site.

## Default scenario

A 14-day mission landing 15 September 2027 at three south-pole sites. Connecting Ridge and Malapert
Massif are GO. IM-2 Athena's site is NO-GO: 171 hours of darkness against a 50-hour battery. Slip the
landing two weeks in the schedule-slip chart and Connecting Ridge turns NO-GO as well, because Earth's
libration takes it below the ridge line.

## Data and accuracy

| Source | Used for |
|---|---|
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (DE441) | Sub-Earth and sub-solar points on the Moon and both distances, hourly, 1 Nov 2026 to 1 Jan 2029 |
| [LOLA GDR](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) `LDEM_80S_80M`, `LDEM_64`, `LDEM_16` | Terrain horizons, the shadow map, 3D terrain |
| [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) and Blue Marble | Whole-Moon map, opening sequence, Earth in the 3D sky |
| [LROC Quickmap](https://quickmap.lroc.asu.edu/), [Moon Trek](https://trek.nasa.gov/moon/) | Linked from every site for cross-checking |
| [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Background for the guide |

**Why sub-points.** The direction to the Sun or Earth from a lunar site depends only on where that body
stands over the Moon and how far away it is. One Horizons request for the whole date range therefore
serves every site, including custom coordinates, with no network access at run time.

**Validation against direct Horizons queries** (`pipeline/validate.py`, 73 hourly samples from
2027-06-01, observer `coord@301`). Largest difference between the app's geometry and Horizons:

| Site | Sun elevation | Sun azimuth | Earth elevation | Earth azimuth |
|---|---|---|---|---|
| Apollo 11 | 0.0007° | 0.0002° | 0.0060° | 0.0016° |
| Connecting Ridge | 0.0005° | 0.0007° | 0.0008° | 0.0062° |
| Malapert Massif | 0.0005° | 0.0007° | 0.0008° | 0.0060° |
| Chang'e 4 | 0.0006° | 0.0006° | 0.0006° | 0.0060° |

The Sun's disc is 0.53° wide, so these are under 2% of a solar diameter. Example, Apollo 11 at
2027-06-01 00:00 UTC: Horizons gives the Sun at azimuth 275.918°, elevation −69.959°; the app gives
275.918°, −69.959°.

Sanity checks covered by the unit tests: Earth stays more than 50° up at Apollo 11 and never rises at
Chang'e 4; the floor of Shackleton gets 0% sunlight in every month of 2027 while Connecting Ridge on
its rim averages over 55%.

**Method.**
- No atmosphere, so no refraction. The horizon is terrain plus the curve of the sphere.
- Horizons are ray-cast over LOLA out to 400 km in 0.25° azimuth steps from 2 m above the surface,
  using `atan2(r_t·cos θ − r_o, r_t·sin θ)`, which includes curvature exactly.
- The Sun is treated as a disc. The fraction above the ridge line is integrated in vertical strips, so
  power ramps instead of switching.
- Power = rated power × visible disc fraction × cos(elevation) for a vertical tracking array, or
  × sin(elevation) for a flat panel.
- Earth is in view when its centre clears the terrain by the antenna mask angle.
- MARGINAL means within 20% of a limit.

**Limits.**
- Sites marked "approx." are region centres or planning estimates. At the pole, moving 1 km changes the
  result. Faustini Rim A and Nobile Rim 1 were placed on the nearest ridge crest in the DEM.
- The polar DEM is 80 m per pixel. Features smaller than that are not in the horizon.
- Custom coordinates use coarser grids in the browser: 400 m at the pole, about 7.6 km elsewhere.
- Outside the published date range the app falls back to an analytic lunar model (Meeus), good to
  about 0.5°, and shows an "Approximate" badge.
- Science values (1 to 5) are assigned by our team for the trade view. They are not NASA ratings.
- No thermal model, relay satellites or surface mobility.
- The Moon Trek link uses its URL-hash view format; Quickmap has no stable deep link, so that link
  opens Quickmap and copies the coordinates.

## Repository layout

```
app/                      Vite + React + TypeScript
  public/data/            static data the app reads (generated by the pipeline, committed)
  src/lib/                pure maths: astro.ts, visibility.ts, scenario.ts (+ tests)
  src/data/               data contracts, dataset loader, browser DEM ray-cast, mock fallback
  src/state/              Zustand store, URL encoding
  src/hooks/              derived series, metrics and verdicts per site
  src/components/         SiteMap, HorizonPanorama, Readouts, Timeline, Scorecards, Analysis,
                          ConstraintsPanel, Terrain3D, Intro, Drawer, Header
pipeline/                 Python: Horizons queries, LOLA ray-cast, export, validation
Context & Resources/      challenge brief, SPEC.md, AGENT_BRIEF.md
PRODUCT.md                product context
```

Views never read raw data. They go through the `Dataset` interface in `app/src/data/types.ts` and the
pure functions in `app/src/lib`.

## Regenerating the data

```bash
cd pipeline
pip install -r requirements.txt
python fetch_data.py        # about 700 MB of raw LOLA and imagery into pipeline/raw (not committed)
python export_static.py     # Horizons sub-points + LOLA horizons, patches, grids, textures
python validate.py          # direct Horizons comparison -> app/public/data/validation.json
python -m pytest            # offline checks
```

Edit `pipeline/sites.json` to add or move curated sites, then re-run `export_static.py --skip-ephem`.

## Credits

Ephemerides: NASA/JPL Solar System Dynamics, Horizons system. Topography: Lunar Orbiter Laser Altimeter
team, NASA GSFC, via the PDS Geosciences Node. Imagery: NASA Scientific Visualization Studio and the
LROC team at Arizona State University. This is a hackathon project, not an operational planning tool.

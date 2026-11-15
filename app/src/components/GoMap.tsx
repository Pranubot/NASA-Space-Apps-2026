// GO map: a layer over the polar map that scores the ground itself, not just the curated pins.
// Each cell's centre is treated as a landing site: its terrain horizon is ray-cast from the LOLA
// grid, then judged with the same evaluate() the rest of the app uses, for the current landing
// date, mission length and limits.
//
// Horizons do not depend on the date, so they are computed once per cell and kept. Changing the
// date or a limit only re-runs the cheap scoring, which is why the map recolours quickly.
// Cells sit on a fixed lattice (400 m x 2^k) so panning and zooming reuse earlier work.

import { useEffect, useMemo, useRef, useState } from "react";
import { MAP_HORIZON, elevationFn, raycastHorizon } from "../data/dem";
import type { Dataset, HorizonProfile, PolarGrid, Site } from "../data/types";
import { R_MOON_KM, deg } from "../lib/astro";
import { evaluate, type Verdict } from "../lib/scenario";
import { VERDICT_HINT, VERDICT_LABEL } from "../lib/theme";
import { DAY, fmtLatLon } from "../lib/time";
import { applyConstraints, buildGeometry, computeMetrics, type Constraints } from "../lib/visibility";
import { useSay, useStore } from "../state/store";
import { VerdictIcon } from "./Scorecards";

const R_M = R_MOON_KM * 1000;
/** rays near the grid edge would look out over missing terrain, so the map stops short of 80°S */
const MAX_LAT = -80.5;
const MAX_CELLS_ACROSS = 56;
const MIN_CELL_PX = 3;
/** time spent scoring before the browser gets a turn to draw */
const SLICE_MS = 10;

// NO-GO is fainter so the terrain stays readable and the workable ground stands out
const FILL: Record<Verdict, string> = { GO: "rgba(61, 220, 151, 0.55)", MARGINAL: "rgba(255, 154, 77, 0.5)", "NO-GO": "rgba(255, 93, 93, 0.24)" };

interface Cell { key: string; x: number; y: number; size: number } // south-west corner, map metres
interface Score { verdict: Verdict; bothH: number; darkH: number; lat: number; lon: number }
export interface MapView { cx: number; cy: number; half: number }

// ponytail: grows with every cell visited and is dropped wholesale at the cap; switch to an LRU
// (or a Web Worker that owns it) if long sessions make the refill noticeable.
const horizons = new Map<string, { site: Site; h: HorizonProfile } | null>();

/** Lattice cells covering the view: a coarse pass first, then one twice as fine if it fits. */
function cellsFor(view: MapView, w: number, h: number, scale: number): { cells: Cell[]; sizes: number[] } {
  let size = 400;
  while ((2 * view.half) / size > MAX_CELLS_ACROSS) size *= 2;
  const sizes = size > 400 && size / 2 / scale >= MIN_CELL_PX ? [size, size / 2] : [size];
  const cells: Cell[] = [];
  for (const s of sizes) {
    const x0 = Math.floor((view.cx - (w / 2) * scale) / s), x1 = Math.floor((view.cx + (w / 2) * scale) / s);
    const y0 = Math.floor((view.cy - (h / 2) * scale) / s), y1 = Math.floor((view.cy + (h / 2) * scale) / s);
    for (let iy = y1; iy >= y0; iy--) for (let ix = x0; ix <= x1; ix++) cells.push({ key: `${s}:${ix}:${iy}`, x: ix * s, y: iy * s, size: s });
  }
  return { cells, sizes };
}

function scoreCell(cell: Cell, grid: PolarGrid, ds: Dataset, startMs: number, days: number, c: Constraints): Score | null {
  let entry = horizons.get(cell.key);
  if (entry === undefined) {
    const mx = cell.x + cell.size / 2, my = cell.y + cell.size / 2;
    const lat = -90 + deg(2 * Math.atan(Math.hypot(mx, my) / (2 * R_M))), lon = deg(Math.atan2(mx, my));
    if (lat > MAX_LAT) entry = null;
    else {
      const { profile, siteElevationM } = raycastHorizon(elevationFn(grid, null), lat, lon, { ...MAP_HORIZON, source: "LOLA 400 m grid, map quality", siteKey: cell.key });
      entry = { site: { id: cell.key, name: "", lat, lon, category: "custom", elevationM: siteElevationM }, h: profile };
    }
    if (horizons.size > 60_000) horizons.clear();
    horizons.set(cell.key, entry);
  }
  if (!entry) return null;
  // hourly samples, like the verdicts on the pins; two-hourly for long missions to stay responsive
  const g = buildGeometry(entry.site, entry.h, (t) => ds.subpoints(t), startMs, startMs + days * DAY, days <= 30 ? 60 : 120);
  const m = computeMetrics(g, applyConstraints(g, c), 0, g.count - 1);
  return { verdict: evaluate(m, c).overall, bothH: m.bothHoursPerDay, darkH: m.longestDarkH, lat: entry.site.lat, lon: entry.site.lon };
}

export function GoMap({
  grid, view, w, h, scale, cursor,
}: { grid: PolarGrid; view: MapView; w: number; h: number; scale: number; cursor: readonly [number, number] | null }) {
  const ds = useStore((s) => s.dataset);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const c = useStore((s) => s.constraints);
  const say = useSay();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(0);

  // scores belong to one scenario; a new date, length or limit starts a fresh set
  const scores = useMemo(() => new Map<string, Score | null>(), [ds, startMs, days, c]); // eslint-disable-line react-hooks/exhaustive-deps
  const { cells, sizes } = useMemo(() => cellsFor(view, w, h, scale), [view, w, h, scale]);

  useEffect(() => {
    const cv = canvas.current;
    if (!ds || !cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d")!;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const cell of cells) {
        const s = scores.get(cell.key);
        if (!s) continue;
        const px = w / 2 + (cell.x - view.cx) / scale, py = h / 2 - (cell.y + cell.size - view.cy) / scale, side = cell.size / scale;
        ctx.clearRect(px, py, side, side); // a fine cell replaces the coarse one under it
        ctx.fillStyle = FILL[s.verdict];
        ctx.fillRect(px, py, side, side);
      }
    };

    let i = 0;
    let timer: number | undefined;
    // ponytail: scored on the main thread in short slices; move to a Web Worker if playback stutters
    const run = () => {
      const t0 = performance.now();
      while (i < cells.length && performance.now() - t0 < SLICE_MS) {
        const cell = cells[i++];
        if (!scores.has(cell.key)) scores.set(cell.key, scoreCell(cell, grid, ds, startMs, days, c));
      }
      draw();
      setDone(i / cells.length);
      if (i < cells.length) timer = window.setTimeout(run, 0);
    };
    run();
    return () => window.clearTimeout(timer);
  }, [ds, grid, cells, scores, view, w, h, scale, startMs, days, c]);

  // the finest scored cell under the pointer
  let hit: Score | null = null;
  if (cursor) {
    const mx = view.cx + (cursor[0] - w / 2) * scale, my = view.cy - (cursor[1] - h / 2) * scale;
    for (const s of [...sizes].reverse()) {
      hit = scores.get(`${s}:${Math.floor(mx / s)}:${Math.floor(my / s)}`) ?? null;
      if (hit) break;
    }
  }

  return (
    <>
      <canvas ref={canvas} className="map__canvas gomap" style={{ width: w, height: h }} />
      <div className="gomap__read" title="Each square is scored as a landing site on the 400 m LOLA grid. Approximate: curated sites use finer terrain.">
        {hit ? (
          <>
            <span className="gomap__key"><VerdictIcon v={hit.verdict} size={12} /><strong>{VERDICT_LABEL[hit.verdict]}</strong> <span className="num">{fmtLatLon(hit.lat, hit.lon)}</span></span>
            <span><span className="num">{hit.bothH.toFixed(1)} h</span> a day {say("power + comms")} · longest night <span className="num">{Math.round(hit.darkH)} h</span></span>
            <span className="gomap__dim">Double-click to open this spot</span>
          </>
        ) : (
          <>
            <span className="gomap__key">
              {(["GO", "MARGINAL", "NO-GO"] as const).map((v) => (
                <span key={v} title={VERDICT_HINT[v]}><VerdictIcon v={v} size={12} />{VERDICT_LABEL[v]}</span>
              ))}
            </span>
            <span className="gomap__dim">
              {done < 1 ? `Scoring the terrain… ${Math.round(done * 100)}%` : "Every square scored as a landing site. Zoom in for detail."}
            </span>
          </>
        )}
      </div>
    </>
  );
}

// Browser-side LOLA access: sample the shipped grids, ray-cast a terrain horizon and cut a local
// patch for any coordinate. Used for custom sites; curated sites ship pipeline-computed horizons
// from the full-resolution DEMs.

import { R_MOON_KM, deg, destination, rad } from "../lib/astro";
import type { GlobalGrid, HorizonProfile, PolarGrid, TerrainPatch } from "./types";

const R_M = R_MOON_KM * 1000;

export type ElevationFn = (latDeg: number, lonDeg: number) => number;

function bilinear(data: Int16Array, w: number, h: number, row: number, col: number, wrapX: boolean): number {
  const r0 = Math.floor(row), c0 = Math.floor(col);
  const fr = row - r0, fc = col - c0;
  const ra = Math.max(0, Math.min(h - 1, r0)), rb = Math.max(0, Math.min(h - 1, r0 + 1));
  const ca = wrapX ? ((c0 % w) + w) % w : Math.max(0, Math.min(w - 1, c0));
  const cb = wrapX ? (((c0 + 1) % w) + w) % w : Math.max(0, Math.min(w - 1, c0 + 1));
  const a = data[ra * w + ca], b = data[ra * w + cb], c = data[rb * w + ca], d = data[rb * w + cb];
  return ((a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr) * 0.5;
}

/** Row/column in the polar stereographic grid for a lat/lon. */
export function polarRowCol(g: PolarGrid, latDeg: number, lonDeg: number): [number, number] {
  const r = (2 * R_M * Math.tan(rad(90 + latDeg) / 2)) / g.pixelM;
  const c = (g.n - 1) / 2;
  return [c - r * Math.cos(rad(lonDeg)), c + r * Math.sin(rad(lonDeg))];
}

/** Lat/lon for a row/column of the polar grid. */
export function polarLatLon(g: PolarGrid, row: number, col: number): [number, number] {
  const c = (g.n - 1) / 2;
  const x = (col - c) * g.pixelM, y = (c - row) * g.pixelM;
  const lat = -90 + deg(2 * Math.atan(Math.hypot(x, y) / (2 * R_M)));
  return [lat, deg(Math.atan2(x, y))];
}

export const polarLimitLat = (g: PolarGrid) => -90 + deg(2 * Math.atan((((g.n - 1) / 2) * g.pixelM) / (2 * R_M)));

export function elevationFn(polar: PolarGrid | null, globe: GlobalGrid | null): ElevationFn {
  const limit = polar ? polarLimitLat(polar) - 0.05 : -91;
  return (lat, lon) => {
    if (polar && lat < limit) {
      const [row, col] = polarRowCol(polar, lat, lon);
      return bilinear(polar.data, polar.n, polar.n, row, col, false);
    }
    if (!globe) return 0;
    const l = ((lon % 360) + 360) % 360;
    return bilinear(globe.data, globe.w, globe.h, (90 - lat) * globe.ppd - 0.5, l * globe.ppd - 0.5, true);
  };
}

/**
 * Terrain horizon by marching rays over the sphere. For terrain at great-circle angle theta and
 * radius r_t seen from radius r_o: elevation = atan2(r_t cos(theta) - r_o, r_t sin(theta)).
 * That expression carries the curvature drop exactly; there is no refraction term on the Moon.
 */
export function raycastHorizon(
  elev: ElevationFn,
  lat: number,
  lon: number,
  opts: {
    azStepDeg?: number; maxRangeKm?: number; firstStepKm?: number; observerHeightM?: number;
    /** ratio between successive sample distances beyond 15 km; larger is faster and coarser */
    farGrowth?: number;
    source: string; siteKey: string;
  },
): { profile: HorizonProfile; siteElevationM: number } {
  const azStep = opts.azStepDeg ?? 0.5;
  const maxKm = opts.maxRangeKm ?? 300;
  const first = opts.firstStepKm ?? 0.3;
  const obsH = opts.observerHeightM ?? 2;
  const siteH = elev(lat, lon);
  const rO = R_M + siteH + obsH;

  const dists: number[] = [];
  for (let d = first; d < 15; d += first) dists.push(d);
  for (let d = 15; d < maxKm; d *= opts.farGrowth ?? 1.01) dists.push(d);

  const n = Math.round(360 / azStep);
  const elevation = new Float32Array(n);
  const distKm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = -90, bestD = 0;
    for (const d of dists) {
      const [plat, plon] = destination(lat, lon, i * azStep, d);
      const th = d / R_MOON_KM;
      const rT = R_M + elev(plat, plon);
      const ang = Math.atan2(rT * Math.cos(th) - rO, rT * Math.sin(th));
      if (ang > best) {
        best = ang;
        bestD = d;
      }
    }
    elevation[i] = deg(best);
    distKm[i] = bestD;
  }
  return {
    siteElevationM: siteH,
    profile: {
      siteKey: opts.siteKey, azStepDeg: azStep, elevationDeg: elevation, distKm,
      observerHeightM: obsH, maxRangeKm: maxKm, source: opts.source, approx: true,
    },
  };
}

/**
 * Ray-cast settings for the GO map, where thousands of points are scored: about 3 ms a point
 * against about 50 ms at the custom-site settings. dem.test.ts checks that the verdicts still agree
 * with the pipeline's full-resolution horizons.
 */
export const MAP_HORIZON = { azStepDeg: 2, firstStepKm: 0.4, farGrowth: 1.06, maxRangeKm: 300 };

/** n x n patch on the local tangent plane, row 0 = north, col 0 = west. */
export function cropPatch(elev: ElevationFn, lat: number, lon: number, n: number, pixelM: number, source: string): TerrainPatch {
  const heights = new Float32Array(n * n);
  const half = (n - 1) / 2;
  let min = Infinity, max = -Infinity;
  for (let r = 0; r < n; r++) {
    const north = (half - r) * pixelM;
    for (let c = 0; c < n; c++) {
      const east = (c - half) * pixelM;
      const d = Math.hypot(east, north) / 1000;
      const [plat, plon] = d < 1e-6 ? [lat, lon] : destination(lat, lon, deg(Math.atan2(east, north)), d);
      const h = elev(plat, plon);
      heights[r * n + c] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { n, pixelM, heights, minM: min, maxM: max, source, approx: true };
}

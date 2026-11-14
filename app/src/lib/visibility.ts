// Visibility maths: terrain horizon lookup, partial-disc occlusion, time series, windows, metrics.
// Pure functions only. Covered by visibility.test.ts.

import type { HorizonProfile, Site, Subpoints } from "../data/types";
import { R_EARTH_KM, R_SUN_KM, clamp, deg, observer, rad, topocentric, wrap180, wrap360 } from "./astro";

export interface Constraints {
  /** fraction of the Sun's disc that must clear terrain to count as "lit" */
  sunMinFraction: number;
  /** antenna mask: Earth's centre must clear terrain by this many degrees */
  earthMaskDeg: number;
  /** battery survival: longest tolerable continuous darkness, hours */
  maxDarkH: number;
  /** minimum hours per Earth day with power and comms together */
  minBothHoursPerDay: number;
  /** longest tolerable gap in direct-to-Earth comms, hours */
  maxCommsGapH: number;
  /** rated array power, W */
  panelW: number;
  /** vertical Sun-tracking array (polar standard) or flat horizontal panel */
  panelMode: "vertical" | "horizontal";
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  sunMinFraction: 0.5,
  earthMaskDeg: 0.5,
  maxDarkH: 50,
  minBothHoursPerDay: 6,
  maxCommsGapH: 120,
  panelW: 1000,
  panelMode: "vertical",
};

/** Terrain horizon elevation at an azimuth (linear interpolation, wraps at 360). */
export function horizonAt(h: HorizonProfile, azDeg: number): number {
  const n = h.elevationDeg.length;
  const x = wrap360(azDeg) / h.azStepDeg;
  const i = Math.floor(x);
  const f = x - i;
  const a = h.elevationDeg[i % n];
  const b = h.elevationDeg[(i + 1) % n];
  return a + (b - a) * f;
}

/** Distance to the horizon-defining terrain at an azimuth, km (nearest sample). */
export function horizonDistAt(h: HorizonProfile, azDeg: number): number | null {
  if (!h.distKm) return null;
  const n = h.distKm.length;
  return h.distKm[Math.round(wrap360(azDeg) / h.azStepDeg) % n];
}

/** Fraction of a disc of radius r above a flat horizon line, by circular-segment area. */
export function segmentFraction(centreAboveHorizonDeg: number, rDeg: number): number {
  const d = centreAboveHorizonDeg / rDeg;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

const STRIPS = 7;

/**
 * Fraction of a disc (Sun or Earth) that clears the terrain line. The disc is cut into vertical
 * strips and each strip is tested against the horizon at its own azimuth, so a notch or a peak
 * narrower than the disc is handled, and power ramps instead of toggling.
 */
export function discFraction(h: HorizonProfile, azDeg: number, elDeg: number, rDeg: number): number {
  const cosEl = Math.max(0.05, Math.cos(rad(elDeg)));
  let vis = 0;
  let tot = 0;
  for (let k = 0; k < STRIPS; k++) {
    const x = (((k + 0.5) / STRIPS) * 2 - 1) * rDeg;
    const half = Math.sqrt(rDeg * rDeg - x * x);
    const hz = horizonAt(h, azDeg + x / cosEl);
    vis += clamp((elDeg + half - hz) / (2 * half), 0, 1) * half;
    tot += half;
  }
  return vis / tot;
}

export const sunRadiusDeg = (sunKm: number) => deg(Math.asin(R_SUN_KM / sunKm));
export const earthRadiusDeg = (earthKm: number) => deg(Math.asin(R_EARTH_KM / earthKm));

/** Power from the array as a fraction of rated power. */
export function powerFraction(sunFrac: number, sunElDeg: number, mode: Constraints["panelMode"]): number {
  if (sunFrac <= 0) return 0;
  const geo = mode === "vertical" ? Math.cos(rad(sunElDeg)) : Math.max(0, Math.sin(rad(sunElDeg)));
  return sunFrac * geo;
}

// ---------------------------------------------------------------------------------------------
// One instant
// ---------------------------------------------------------------------------------------------

export interface Instant {
  tMs: number;
  sunAz: number;
  sunEl: number;
  /** fraction of the Sun's disc above terrain, 0..1 */
  sunFrac: number;
  /** Sun centre minus terrain horizon at its azimuth */
  sunClear: number;
  sunR: number;
  earthAz: number;
  earthEl: number;
  earthClear: number;
  earthFrac: number;
  earthR: number;
  lit: boolean;
  earthVisible: boolean;
  both: boolean;
  powerW: number;
}

export function instantAt(site: Site, h: HorizonProfile, sp: Subpoints, tMs: number, c: Constraints): Instant {
  const o = observer(site.lat, site.lon, (site.elevationM ?? 0) / 1000);
  const sun = topocentric(o, sp.sLat, sp.sLon, sp.sunKm);
  const earth = topocentric(o, sp.eLat, sp.eLon, sp.earthKm);
  const sunR = sunRadiusDeg(sp.sunKm);
  const earthR = earthRadiusDeg(sp.earthKm);
  const sunFrac = discFraction(h, sun.az, sun.el, sunR);
  const sunClear = sun.el - horizonAt(h, sun.az);
  const earthClear = earth.el - horizonAt(h, earth.az);
  const lit = sunFrac >= c.sunMinFraction && sunFrac > 0;
  const earthVisible = earthClear >= c.earthMaskDeg;
  return {
    tMs,
    sunAz: sun.az, sunEl: sun.el, sunFrac, sunClear, sunR,
    earthAz: earth.az, earthEl: earth.el, earthClear, earthR,
    earthFrac: discFraction(h, earth.az, earth.el, earthR),
    lit, earthVisible, both: lit && earthVisible,
    powerW: c.panelW * powerFraction(sunFrac, sun.el, c.panelMode),
  };
}

// ---------------------------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------------------------

/** Geometry that does not depend on the constraints: expensive part, cached per site and range. */
export interface Geometry {
  siteKey: string;
  startMs: number;
  stepMs: number;
  count: number;
  sunAz: Float32Array;
  sunEl: Float32Array;
  sunFrac: Float32Array;
  sunClear: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
  earthClear: Float32Array;
  sunRadiusDeg: number;
  earthRadiusDeg: number;
  /** some samples came from the analytic model rather than the Horizons table */
  approx: boolean;
}

export function buildGeometry(
  site: Site,
  h: HorizonProfile,
  subAt: (tMs: number) => { sp: Subpoints; approx: boolean },
  startMs: number,
  endMs: number,
  stepMin: number,
): Geometry {
  const stepMs = stepMin * 60_000;
  const count = Math.max(2, Math.floor((endMs - startMs) / stepMs) + 1);
  const g: Geometry = {
    siteKey: site.id, startMs, stepMs, count,
    sunAz: new Float32Array(count), sunEl: new Float32Array(count),
    sunFrac: new Float32Array(count), sunClear: new Float32Array(count),
    earthAz: new Float32Array(count), earthEl: new Float32Array(count),
    earthClear: new Float32Array(count),
    sunRadiusDeg: 0.267, earthRadiusDeg: 0.95, approx: false,
  };
  const o = observer(site.lat, site.lon, (site.elevationM ?? 0) / 1000);
  let sr = 0, er = 0;
  for (let i = 0; i < count; i++) {
    const { sp, approx } = subAt(startMs + i * stepMs);
    if (approx) g.approx = true;
    const sun = topocentric(o, sp.sLat, sp.sLon, sp.sunKm);
    const earth = topocentric(o, sp.eLat, sp.eLon, sp.earthKm);
    const r = sunRadiusDeg(sp.sunKm);
    sr += r;
    er += earthRadiusDeg(sp.earthKm);
    g.sunAz[i] = sun.az;
    g.sunEl[i] = sun.el;
    g.sunFrac[i] = discFraction(h, sun.az, sun.el, r);
    g.sunClear[i] = sun.el - horizonAt(h, sun.az);
    g.earthAz[i] = earth.az;
    g.earthEl[i] = earth.el;
    g.earthClear[i] = earth.el - horizonAt(h, earth.az);
  }
  g.sunRadiusDeg = sr / count;
  g.earthRadiusDeg = er / count;
  return g;
}

/** Constraint-dependent flags on top of a Geometry. Cheap; recomputed when a slider moves. */
export interface Flags {
  lit: Uint8Array;
  earth: Uint8Array;
  both: Uint8Array;
  powerW: Float32Array;
}

export function applyConstraints(g: Geometry, c: Constraints): Flags {
  const lit = new Uint8Array(g.count);
  const earth = new Uint8Array(g.count);
  const both = new Uint8Array(g.count);
  const powerW = new Float32Array(g.count);
  for (let i = 0; i < g.count; i++) {
    const l = g.sunFrac[i] >= c.sunMinFraction && g.sunFrac[i] > 0 ? 1 : 0;
    const e = g.earthClear[i] >= c.earthMaskDeg ? 1 : 0;
    lit[i] = l;
    earth[i] = e;
    both[i] = l & e;
    powerW[i] = c.panelW * powerFraction(g.sunFrac[i], g.sunEl[i], c.panelMode);
  }
  return { lit, earth, both, powerW };
}

export const indexAt = (g: Geometry, tMs: number) => clamp(Math.round((tMs - g.startMs) / g.stepMs), 0, g.count - 1);
export const timeAt = (g: Geometry, i: number) => g.startMs + i * g.stepMs;

// ---------------------------------------------------------------------------------------------
// Windows and metrics
// ---------------------------------------------------------------------------------------------

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

/** Contiguous runs of a flag inside [i0, i1). Each sample owns the interval starting at its time. */
export function windowsOf(flag: Uint8Array, g: Geometry, i0: number, i1: number, value = 1): TimeWindow[] {
  const out: TimeWindow[] = [];
  let run = -1;
  for (let i = i0; i < i1; i++) {
    if (flag[i] === value) {
      if (run < 0) run = i;
    } else if (run >= 0) {
      out.push({ startMs: timeAt(g, run), endMs: timeAt(g, i) });
      run = -1;
    }
  }
  if (run >= 0) out.push({ startMs: timeAt(g, run), endMs: timeAt(g, i1) });
  return out;
}

const longestH = (ws: TimeWindow[]) => ws.reduce((m, w) => Math.max(m, (w.endMs - w.startMs) / 3_600_000), 0);

export interface SiteMetrics {
  hours: number;
  days: number;
  sunlitPct: number;
  earthPct: number;
  bothPct: number;
  sunHours: number;
  earthHours: number;
  bothHours: number;
  bothHoursPerDay: number;
  longestDarkH: number;
  longestCommsGapH: number;
  longestBothH: number;
  meanSunElLitDeg: number;
  maxSunElDeg: number;
  energyKWh: number;
  /** hours from the window start until power and comms are first available together; null = never */
  firstBothH: number | null;
  litAtStart: boolean;
  earthAtStart: boolean;
  sunWindows: TimeWindow[];
  earthWindows: TimeWindow[];
  bothWindows: TimeWindow[];
  darkWindows: TimeWindow[];
}

export function computeMetrics(g: Geometry, f: Flags, i0: number, i1: number): SiteMetrics {
  i0 = clamp(i0, 0, g.count - 1);
  i1 = clamp(i1, i0 + 1, g.count);
  const n = i1 - i0;
  const dtH = g.stepMs / 3_600_000;
  let sun = 0, earth = 0, both = 0, elSum = 0, elMax = -90, energy = 0;
  for (let i = i0; i < i1; i++) {
    sun += f.lit[i];
    earth += f.earth[i];
    both += f.both[i];
    if (f.lit[i]) elSum += g.sunEl[i];
    if (g.sunEl[i] > elMax) elMax = g.sunEl[i];
    energy += f.powerW[i] * dtH;
  }
  const sunWindows = windowsOf(f.lit, g, i0, i1);
  const earthWindows = windowsOf(f.earth, g, i0, i1);
  const bothWindows = windowsOf(f.both, g, i0, i1);
  const darkWindows = windowsOf(f.lit, g, i0, i1, 0);
  const commsGaps = windowsOf(f.earth, g, i0, i1, 0);
  const hours = n * dtH;
  const startMs = timeAt(g, i0);
  return {
    hours,
    days: hours / 24,
    sunlitPct: (100 * sun) / n,
    earthPct: (100 * earth) / n,
    bothPct: (100 * both) / n,
    sunHours: sun * dtH,
    earthHours: earth * dtH,
    bothHours: both * dtH,
    bothHoursPerDay: (both * dtH) / (hours / 24),
    longestDarkH: longestH(darkWindows),
    longestCommsGapH: longestH(commsGaps),
    longestBothH: longestH(bothWindows),
    meanSunElLitDeg: sun ? elSum / sun : NaN,
    maxSunElDeg: elMax,
    energyKWh: energy / 1000,
    firstBothH: bothWindows.length ? (bothWindows[0].startMs - startMs) / 3_600_000 : null,
    litAtStart: f.lit[i0] === 1,
    earthAtStart: f.earth[i0] === 1,
    sunWindows, earthWindows, bothWindows, darkWindows,
  };
}

// ---------------------------------------------------------------------------------------------
// Countdowns
// ---------------------------------------------------------------------------------------------

export interface NextChange {
  /** state at the cursor */
  up: boolean;
  /** when it next flips; null if it does not flip before the series ends */
  atMs: number | null;
}

/**
 * When does a thresholded quantity next change state after tMs? `margin[i]` is the continuous
 * quantity minus its threshold (positive = up). The crossing is interpolated between samples.
 */
export function nextChange(g: Geometry, margin: (i: number) => number, tMs: number): NextChange {
  const x = clamp((tMs - g.startMs) / g.stepMs, 0, g.count - 1);
  const i = Math.min(Math.floor(x), g.count - 2);
  const f = x - i;
  const m0 = margin(i) + (margin(i + 1) - margin(i)) * f;
  const up = m0 >= 0;
  let prev = m0;
  let prevT = tMs;
  for (let k = i + 1; k < g.count; k++) {
    const m = margin(k);
    const t = timeAt(g, k);
    if (m >= 0 !== up) {
      const frac = prev === m ? 0 : prev / (prev - m);
      return { up, atMs: prevT + (t - prevT) * clamp(frac, 0, 1) };
    }
    prev = m;
    prevT = t;
  }
  return { up, atMs: null };
}

export const sunMargin = (g: Geometry, c: Constraints) => (i: number) =>
  g.sunFrac[i] - Math.max(c.sunMinFraction, 1e-4);
export const earthMargin = (g: Geometry, c: Constraints) => (i: number) => g.earthClear[i] - c.earthMaskDeg;

/** Shortest signed azimuth difference a - b. */
export const azDiff = (a: number, b: number) => wrap180(a - b);

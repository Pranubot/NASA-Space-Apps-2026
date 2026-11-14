// Pure astronomy and geometry. No DOM, no state. Angles in degrees unless a name says otherwise.

import type { Subpoints, SubpointTable } from "../data/types";

export const R_MOON_KM = 1737.4;
export const R_SUN_KM = 695_700;
export const R_EARTH_KM = 6378.137;
export const AU_KM = 149_597_870.7;
/** mean synodic month: one lunar day/night cycle */
export const LUNAR_DAY_H = 29.530589 * 24;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const rad = (d: number) => d * D2R;
export const deg = (r: number) => r * R2D;
export const wrap360 = (a: number) => ((a % 360) + 360) % 360;
export const wrap180 = (a: number) => wrap360(a + 180) - 180;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface AzEl {
  az: number;
  el: number;
}

/** Reusable observer basis for a site, so per-sample work is a handful of multiplies. */
export interface Observer {
  ux: number; uy: number; uz: number;
  ex: number; ey: number;
  nx: number; ny: number; nz: number;
  rKm: number;
}

export function observer(latDeg: number, lonDeg: number, altKm = 0): Observer {
  const la = rad(latDeg);
  const lo = rad(lonDeg);
  const cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo);
  return {
    ux: cl * co, uy: cl * so, uz: sl,
    ex: -so, ey: co,
    nx: -sl * co, ny: -sl * so, nz: cl,
    rKm: R_MOON_KM + altKm,
  };
}

/**
 * Azimuth (from north, clockwise, east = 90) and elevation above the local horizontal plane of a
 * body whose sub-point on the Moon is (subLat, subLon) at distKm from the Moon's centre.
 * Parallax is included: the observer sits rKm from the centre. No refraction, the Moon is airless.
 */
export function topocentric(o: Observer, subLatDeg: number, subLonDeg: number, distKm: number): AzEl {
  const la = rad(subLatDeg);
  const lo = rad(subLonDeg);
  const cl = Math.cos(la);
  const dx = distKm * cl * Math.cos(lo) - o.rKm * o.ux;
  const dy = distKm * cl * Math.sin(lo) - o.rKm * o.uy;
  const dz = distKm * Math.sin(la) - o.rKm * o.uz;
  const e = dx * o.ex + dy * o.ey;
  const n = dx * o.nx + dy * o.ny + dz * o.nz;
  const u = dx * o.ux + dy * o.uy + dz * o.uz;
  return { az: wrap360(deg(Math.atan2(e, n))), el: deg(Math.atan2(u, Math.hypot(e, n))) };
}

/** Angular separation of two sky directions. */
export function separation(a: AzEl, b: AzEl): number {
  const c =
    Math.sin(rad(a.el)) * Math.sin(rad(b.el)) +
    Math.cos(rad(a.el)) * Math.cos(rad(b.el)) * Math.cos(rad(a.az - b.az));
  return deg(Math.acos(clamp(c, -1, 1)));
}

/** Great-circle destination from a point along an azimuth (distance in km on the lunar sphere). */
export function destination(latDeg: number, lonDeg: number, azDeg: number, distKm: number): [number, number] {
  const p1 = rad(latDeg), l1 = rad(lonDeg), az = rad(azDeg), th = distKm / R_MOON_KM;
  const sp2 = Math.sin(p1) * Math.cos(th) + Math.cos(p1) * Math.sin(th) * Math.cos(az);
  const p2 = Math.asin(clamp(sp2, -1, 1));
  const l2 = l1 + Math.atan2(Math.sin(az) * Math.sin(th) * Math.cos(p1), Math.cos(th) - Math.sin(p1) * sp2);
  return [deg(p2), wrap180(deg(l2))];
}

/** Great-circle distance between two sites, km. */
export function surfaceDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = observer(lat1, lon1), b = observer(lat2, lon2);
  const c = a.ux * b.ux + a.uy * b.uy + a.uz * b.uz;
  return R_MOON_KM * Math.acos(clamp(c, -1, 1));
}

// ---------------------------------------------------------------------------------------------
// Sub-point table (JPL Horizons) lookup
// ---------------------------------------------------------------------------------------------

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpLon = (a: number, b: number, f: number) => a + wrap180(b - a) * f;

/** Linear interpolation in the hourly Horizons table. Returns null outside its range. */
export function tableSubpoints(t: SubpointTable, tMs: number): Subpoints | null {
  const x = (tMs - t.startMs) / (t.stepMin * 60_000);
  if (!(x >= 0) || x > t.count - 1) return null;
  const i = Math.min(Math.floor(x), t.count - 2);
  const f = x - i;
  return {
    eLat: lerp(t.subEarth.lat[i], t.subEarth.lat[i + 1], f),
    eLon: lerpLon(t.subEarth.lon[i], t.subEarth.lon[i + 1], f),
    sLat: lerp(t.subSun.lat[i], t.subSun.lat[i + 1], f),
    sLon: lerpLon(t.subSun.lon[i], t.subSun.lon[i + 1], f),
    earthKm: lerp(t.earthDistKm[i], t.earthDistKm[i + 1], f),
    sunKm: lerp(t.sunDistAu[i], t.sunDistAu[i + 1], f) * AU_KM,
  };
}

// ---------------------------------------------------------------------------------------------
// Analytic fallback: truncated lunar theory + optical libration (Meeus, Astronomical Algorithms,
// ch. 25, 47, 53). Good to a few tenths of a degree; used only outside the Horizons table or when
// running with no data files. Anything computed from it is badged as approximate.
// ---------------------------------------------------------------------------------------------

type Term = [d: number, m: number, mp: number, f: number, coeff: number];

const LON_TERMS: Term[] = [
  [0, 0, 1, 0, 6.288774], [2, 0, -1, 0, 1.274027], [2, 0, 0, 0, 0.658314], [0, 0, 2, 0, 0.213618],
  [0, 1, 0, 0, -0.185116], [0, 0, 0, 2, -0.114332], [2, 0, -2, 0, 0.058793], [2, -1, -1, 0, 0.057066],
  [2, 0, 1, 0, 0.053322], [2, -1, 0, 0, 0.045758], [0, 1, -1, 0, -0.040923], [1, 0, 0, 0, -0.03472],
  [0, 1, 1, 0, -0.030383], [2, 0, 0, -2, 0.015327], [0, 0, 1, 2, -0.012528], [0, 0, 1, -2, 0.01098],
  [4, 0, -1, 0, 0.010675], [0, 0, 3, 0, 0.010034], [4, 0, -2, 0, 0.008548],
];
const LAT_TERMS: Term[] = [
  [0, 0, 0, 1, 5.128122], [0, 0, 1, 1, 0.280602], [0, 0, 1, -1, 0.277693], [2, 0, 0, -1, 0.173237],
  [2, 0, -1, 1, 0.055413], [2, 0, -1, -1, 0.046271], [2, 0, 0, 1, 0.032573], [0, 0, 2, 1, 0.017198],
  [2, 0, 1, -1, 0.009266], [0, 0, 2, -1, 0.008822],
];
const DIST_TERMS: Term[] = [
  [0, 0, 1, 0, -20905.355], [2, 0, -1, 0, -3699.111], [2, 0, 0, 0, -2955.968], [0, 0, 2, 0, -569.925],
  [0, 1, 0, 0, 48.888], [2, 0, -2, 0, 246.158], [2, -1, -1, 0, -152.138], [2, 0, 1, 0, -170.733],
  [2, -1, 0, 0, -204.586], [0, 1, -1, 0, -129.62], [1, 0, 0, 0, 108.743], [0, 1, 1, 0, 104.755],
];
const INCL = rad(1.54242);

function libration(lambdaDeg: number, betaDeg: number, omegaDeg: number, fDeg: number): [number, number] {
  const w = rad(lambdaDeg - omegaDeg);
  const b = rad(betaDeg);
  const a = Math.atan2(
    Math.sin(w) * Math.cos(b) * Math.cos(INCL) - Math.sin(b) * Math.sin(INCL),
    Math.cos(w) * Math.cos(b),
  );
  const lon = wrap180(deg(a) - fDeg);
  const lat = deg(Math.asin(-Math.sin(w) * Math.cos(b) * Math.sin(INCL) - Math.sin(b) * Math.cos(INCL)));
  return [lon, lat];
}

export function analyticSubpoints(tMs: number): Subpoints {
  const T = (tMs / 86_400_000 + 2440587.5 - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const Om = 125.0445479 - 1934.1362891 * T;

  let dl = 0, db = 0, dr = 0;
  for (const [d, m, mp, f, c] of LON_TERMS) dl += c * Math.sin(rad(d * D + m * M + mp * Mp + f * F));
  for (const [d, m, mp, f, c] of LAT_TERMS) db += c * Math.sin(rad(d * D + m * M + mp * Mp + f * F));
  for (const [d, m, mp, f, c] of DIST_TERMS) dr += c * Math.cos(rad(d * D + m * M + mp * Mp + f * F));
  const lambda = Lp + dl;
  const beta = db;
  const earthKm = 385000.56 + dr;

  const C =
    (1.914602 - 0.004817 * T) * Math.sin(rad(M)) + 0.019993 * Math.sin(rad(2 * M)) + 0.000289 * Math.sin(rad(3 * M));
  const sunLon = 280.46646 + 36000.76983 * T + C;
  const ecc = 0.016708634;
  const sunAu = (1.000001018 * (1 - ecc * ecc)) / (1 + ecc * Math.cos(rad(M + C)));
  const sunKm = sunAu * AU_KM;

  const [eLon, eLat] = libration(lambda, beta, Om, F);
  const ratio = earthKm / sunKm;
  const lambdaH = sunLon + 180 + ratio * R2D * Math.cos(rad(beta)) * Math.sin(rad(sunLon - lambda));
  const betaH = ratio * beta;
  const [sLon, sLat] = libration(lambdaH, betaH, Om, F);
  return { eLat, eLon, sLat, sLon, earthKm, sunKm };
}

/** Fraction of Earth's disc that is sunlit as seen from the Moon (0 = new Earth, 1 = full Earth). */
export function earthPhase(sunEarthSeparationDeg: number): number {
  return (1 - Math.cos(rad(sunEarthSeparationDeg))) / 2;
}

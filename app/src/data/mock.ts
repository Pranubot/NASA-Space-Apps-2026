// Procedural stand-ins used only when no data files are available (VITE_DATA_PROVIDER=mock or a
// failed load). Seeded by the coordinates so a site always gets the same terrain. Everything here
// is badged as mock in the UI. Do not tune these to look "right": replace with real data.

import type { HorizonProfile, Site, TerrainPatch } from "./types";

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 0.5, f = 1, sum = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 13);
    amp *= 0.5;
    f *= 2;
  }
  return sum;
}

const seedOf = (s: { lat: number; lon: number }) => Math.round((s.lat + 90) * 1000) + Math.round((s.lon + 180) * 7);

export function mockHorizon(site: Site): HorizonProfile {
  const seed = seedOf(site);
  const n = 720;
  const polar = Math.abs(site.lat) > 80;
  const rough = polar ? 3.2 : 1.2;
  const elevationDeg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // sample noise on a circle so the profile closes at 360
    const v = fbm(4 + 2.2 * Math.cos(a), 4 + 2.2 * Math.sin(a), seed, 5);
    elevationDeg[i] = (v - 0.48) * rough * 2;
  }
  return {
    siteKey: site.id, azStepDeg: 0.5, elevationDeg, observerHeightM: 2, maxRangeKm: 150, source: "mock terrain", approx: true,
  };
}

export function mockPatch(site: Site, n = 192, pixelM = 320): TerrainPatch {
  const seed = seedOf(site);
  const heights = new Float32Array(n * n);
  const craters = Array.from({ length: 9 }, (_, k) => ({
    x: hash(k, 1, seed) * n, y: hash(k, 2, seed) * n, r: (0.05 + hash(k, 3, seed) * 0.14) * n,
  }));
  let min = Infinity, max = -Infinity;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let h = (fbm((c / n) * 4, (r / n) * 4, seed, 6) - 0.5) * 3600;
      for (const cr of craters) {
        const d = Math.hypot(c - cr.x, r - cr.y) / cr.r;
        if (d < 1.35) {
          const depth = cr.r * pixelM * 0.2;
          h += d < 1 ? -depth * (1 - d * d) : depth * 0.25 * Math.exp(-((d - 1) * (d - 1)) / 0.02);
        }
      }
      heights[r * n + c] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { n, pixelM, heights, minM: min, maxM: max, source: "mock terrain", approx: true };
}

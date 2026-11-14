// Dataset loading. `VITE_DATA_PROVIDER=mock` forces the analytic/procedural path with zero data
// files; otherwise the static NASA-derived files in public/data are used, and a failed load falls
// back to mock (with a visible badge) rather than a blank screen.

import { analyticSubpoints, tableSubpoints } from "../lib/astro";
import { cropPatch, elevationFn, raycastHorizon } from "./dem";
import { mockHorizon, mockPatch } from "./mock";
import fallbackSites from "./sites.fallback.json";
import type {
  Dataset, GlobalGrid, HorizonProfile, PolarGrid, Site, SubpointTable, TerrainPatch, Validation,
} from "./types";

const DATA = `${import.meta.env.BASE_URL}data/`;

interface Manifest {
  ephemeris: { startMs: number; stepMin: number; count: number; source: string };
  terrain: {
    patches: Record<string, { n: number; pixelM: number; minM: number; maxM: number; source: string }>;
    polarDem: { file: string; n: number; pixelM: number; source: string };
    globalDem: { file: string; w: number; h: number; ppd: number; source: string };
  };
  generated: string;
}

async function getJson<T>(file: string): Promise<T> {
  const r = await fetch(DATA + file);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function getInt16(file: string): Promise<Int16Array> {
  const r = await fetch(DATA + file);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return new Int16Array(await r.arrayBuffer());
}

function mockDataset(reason: string): Dataset {
  const horizons = new Map<string, HorizonProfile>();
  const get = (s: Site) => {
    let h = horizons.get(s.id);
    if (!h) horizons.set(s.id, (h = mockHorizon(s)));
    return h;
  };
  return {
    name: "mock",
    badge: "Mock data",
    ephemerisSource: `Analytic lunar model (Meeus), approximate. ${reason}`,
    terrainSource: "Procedural terrain, not real topography",
    rangeMs: null,
    sites: (fallbackSites as { sites: Site[] }).sites,
    validation: null,
    subpoints: (tMs) => ({ sp: analyticSubpoints(tMs), approx: true }),
    horizon: get,
    ensureHorizon: async (s) => get(s),
    terrain: async (s) => mockPatch(s),
    polarGrid: async () => null,
  };
}

export async function loadDataset(): Promise<Dataset> {
  if (import.meta.env.VITE_DATA_PROVIDER === "mock") return mockDataset("Mock provider selected.");
  try {
    const [manifest, table, sitesFile, horizonFile] = await Promise.all([
      getJson<Manifest>("manifest.json"),
      getJson<SubpointTable>("ephemeris.json"),
      getJson<{ sites: Site[] }>("sites.json"),
      getJson<{ horizons: Record<string, HorizonProfile> }>("horizons.json"),
    ]);
    const validation = await getJson<Validation>("validation.json").catch(() => null);
    return staticDataset(manifest, table, sitesFile.sites, horizonFile.horizons, validation);
  } catch (err) {
    console.warn("Static data unavailable, falling back to mock:", err);
    return mockDataset("Static data files could not be loaded.");
  }
}

function staticDataset(
  manifest: Manifest,
  table: SubpointTable,
  sites: Site[],
  curated: Record<string, HorizonProfile>,
  validation: Validation | null,
): Dataset {
  const custom = new Map<string, HorizonProfile>();
  const patches = new Map<string, Promise<TerrainPatch>>();
  let polar: Promise<PolarGrid | null> | null = null;
  let globe: Promise<GlobalGrid | null> | null = null;

  const polarGrid = () =>
    (polar ??= getInt16(manifest.terrain.polarDem.file.replace(/^\//, ""))
      .then((data) => ({ n: manifest.terrain.polarDem.n, pixelM: manifest.terrain.polarDem.pixelM, data }))
      .catch(() => null));
  const globalGrid = () =>
    (globe ??= getInt16(manifest.terrain.globalDem.file)
      .then((data) => ({ ...manifest.terrain.globalDem, data }))
      .catch(() => null));

  const rangeMs: [number, number] = [table.startMs, table.startMs + (table.count - 1) * table.stepMin * 60_000];

  return {
    name: "horizons",
    badge: "JPL Horizons + LOLA",
    ephemerisSource: table.source,
    terrainSource: "LOLA GDR (LDEM_80S_80M, LDEM_64) ray-cast, 2 m observer, no refraction",
    rangeMs,
    sites,
    validation,
    subpoints(tMs) {
      const sp = tableSubpoints(table, tMs);
      return sp ? { sp, approx: false } : { sp: analyticSubpoints(tMs), approx: true };
    },
    horizon: (s) => curated[s.id] ?? custom.get(s.id),
    async ensureHorizon(s) {
      const known = curated[s.id] ?? custom.get(s.id);
      if (known) return known;
      const [p, g] = await Promise.all([s.lat < -79 ? polarGrid() : Promise.resolve(null), globalGrid()]);
      if (!p && !g) {
        const m = mockHorizon(s);
        custom.set(s.id, m);
        return m;
      }
      const usesPolar = !!p && s.lat < -80.1;
      const { profile } = raycastHorizon(elevationFn(p, g), s.lat, s.lon, {
        siteKey: s.id,
        firstStepKm: usesPolar ? 0.3 : 4,
        maxRangeKm: 300,
        source: usesPolar ? "LOLA 400 m grid, computed in browser" : "LOLA 4 px/deg grid, computed in browser (coarse)",
      });
      custom.set(s.id, profile);
      return profile;
    },
    terrain(s) {
      let p = patches.get(s.id);
      if (!p) {
        const meta = manifest.terrain.patches[s.id];
        p = meta
          ? getInt16(`dem/${s.id}.bin`).then((dn) => {
              const heights = new Float32Array(dn.length);
              for (let i = 0; i < dn.length; i++) heights[i] = dn[i] * 0.5;
              return { ...meta, heights };
            })
          : Promise.all([s.lat < -79 ? polarGrid() : Promise.resolve(null), globalGrid()]).then(([pg, gg]) => {
              if (!pg && !gg) return mockPatch(s);
              const usesPolar = !!pg && s.lat < -80.6;
              return usesPolar
                ? cropPatch(elevationFn(pg, gg), s.lat, s.lon, 192, 400, "LOLA 400 m grid")
                : cropPatch(elevationFn(pg, gg), s.lat, s.lon, 128, 2400, "LOLA 4 px/deg grid (coarse)");
            });
        p = p.catch(() => mockPatch(s));
        patches.set(s.id, p);
      }
      return p;
    },
    polarGrid,
  };
}

/** Site elevation for a custom coordinate, when the grids are available. */
export async function customElevation(ds: Dataset, lat: number, lon: number): Promise<number | undefined> {
  if (ds.name !== "horizons") return undefined;
  const p = lat < -80.1 ? await ds.polarGrid() : null;
  if (!p) return undefined;
  return elevationFn(p, null)(lat, lon);
}

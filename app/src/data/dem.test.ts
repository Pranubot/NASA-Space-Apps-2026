// The GO map scores ground with coarser, faster horizons than the pipeline's. This checks that
// the verdicts they produce still match the pipeline's full-resolution horizons almost always.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { tableSubpoints } from "../lib/astro";
import { evaluate } from "../lib/scenario";
import { DAY } from "../lib/time";
import { DEFAULT_CONSTRAINTS as C, applyConstraints, buildGeometry, computeMetrics } from "../lib/visibility";
import { MAP_HORIZON, elevationFn, raycastHorizon } from "./dem";
import type { HorizonProfile, Site, SubpointTable } from "./types";

const dir = new URL("../../public/data/", import.meta.url);
const json = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
const table = json("ephemeris.json") as SubpointTable;
const sites = (json("sites.json") as { sites: Site[] }).sites.filter((s) => s.lat < -81);
const pipeline = (json("horizons.json") as { horizons: Record<string, HorizonProfile> }).horizons;
const bin = readFileSync(new URL("dem/polar_400m.bin", dir));
const elev = elevationFn({ n: 1520, pixelM: 400, data: new Int16Array(bin.buffer, bin.byteOffset, bin.length / 2) }, null);

const verdict = (site: Site, h: HorizonProfile, startMs: number) => {
  const g = buildGeometry(site, h, (t) => ({ sp: tableSubpoints(table, t)!, approx: false }), startMs, startMs + 14 * DAY, 60);
  return evaluate(computeMetrics(g, applyConstraints(g, C), 0, g.count - 1), C).overall;
};

it("map-quality horizons give the pipeline's verdict at least 9 times in 10", () => {
  let same = 0, total = 0;
  for (const s of sites) {
    const { profile, siteElevationM } = raycastHorizon(elev, s.lat, s.lon, { ...MAP_HORIZON, source: "test", siteKey: s.id });
    for (let k = 0; k < 24; k++) {
      const start = Date.UTC(2027, 8, 15) + k * 15 * DAY;
      total++;
      if (verdict(s, pipeline[s.id], start) === verdict({ ...s, elevationM: siteElevationM }, profile, start)) same++;
    }
  }
  expect(sites.length).toBeGreaterThan(8);
  expect(same / total).toBeGreaterThan(0.9);
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SubpointTable, Validation } from "../data/types";
import {
  analyticSubpoints, destination, earthPhase, observer, separation, surfaceDistanceKm, tableSubpoints, topocentric,
  wrap180,
} from "./astro";

const data = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const table = data("ephemeris.json") as SubpointTable;
const validation = data("validation.json") as Validation;

describe("topocentric geometry", () => {
  it("puts a body at the zenith over its own sub-point", () => {
    const r = topocentric(observer(12, 34), 12, 34, 384400);
    expect(r.el).toBeCloseTo(90, 6);
  });

  it("puts a distant body on the horizon 90 degrees away, due east", () => {
    const r = topocentric(observer(0, 0), 0, 90, 1.5e8);
    expect(r.el).toBeCloseTo(0, 2);
    expect(r.az).toBeCloseTo(90, 6);
  });

  it("includes parallax: the Earth sits about 0.26 deg lower than its geometric direction at the limb", () => {
    const r = topocentric(observer(0, 0), 0, 90, 384400);
    expect(r.el).toBeLessThan(-0.2);
    expect(r.el).toBeGreaterThan(-0.3);
  });

  it("matches direct JPL Horizons coord@301 queries to better than 0.02 deg", () => {
    for (const c of validation.cases) {
      const tMs = Date.parse(c.example.utc.replace(" ", "T") + ":00Z");
      const sp = tableSubpoints(table, tMs)!;
      const o = observer(c.lat, c.lon, 0);
      const sun = topocentric(o, sp.sLat, sp.sLon, sp.sunKm);
      const earth = topocentric(o, sp.eLat, sp.eLon, sp.earthKm);
      expect(Math.abs(sun.el - c.example.horizonsSun[1])).toBeLessThan(0.02);
      expect(Math.abs(earth.el - c.example.horizonsEarth[1])).toBeLessThan(0.02);
      const cosEl = Math.cos((sun.el * Math.PI) / 180);
      expect(Math.abs(wrap180(sun.az - c.example.horizonsSun[0]) * cosEl)).toBeLessThan(0.02);
    }
  });

  it("keeps Earth high in the sky at Apollo 11 and below the horizon at Chang'e 4", () => {
    for (let k = 0; k < table.count; k += 500) {
      const tMs = table.startMs + k * 3_600_000;
      const sp = tableSubpoints(table, tMs)!;
      expect(topocentric(observer(0.674, 23.473), sp.eLat, sp.eLon, sp.earthKm).el).toBeGreaterThan(50);
      expect(topocentric(observer(-45.444, 177.599), sp.eLat, sp.eLon, sp.earthKm).el).toBeLessThan(0);
    }
  });
});

describe("sub-point table", () => {
  it("interpolates across the longitude wrap", () => {
    const t: SubpointTable = {
      startMs: 0, stepMin: 60, count: 2, source: "test",
      subEarth: { lon: [0, 0], lat: [0, 0] }, subSun: { lon: [359, 1], lat: [0, 0] },
      earthDistKm: [1, 1], sunDistAu: [1, 1],
    };
    expect(wrap180(tableSubpoints(t, 1_800_000)!.sLon)).toBeCloseTo(0, 6);
  });

  it("returns null outside the published range", () => {
    expect(tableSubpoints(table, table.startMs - 1)).toBeNull();
    expect(tableSubpoints(table, table.startMs + table.count * 3_600_000)).toBeNull();
  });
});

describe("analytic fallback model", () => {
  it("stays within 0.5 deg of Horizons for both sub-points across the table", () => {
    let worst = 0;
    for (let k = 0; k < table.count; k += 97) {
      const tMs = table.startMs + k * 3_600_000;
      const ref = tableSubpoints(table, tMs)!;
      const a = analyticSubpoints(tMs);
      worst = Math.max(
        worst,
        Math.abs(a.eLat - ref.eLat), Math.abs(wrap180(a.eLon - ref.eLon)),
        Math.abs(a.sLat - ref.sLat), Math.abs(wrap180(a.sLon - ref.sLon)),
      );
      expect(Math.abs(a.earthKm - ref.earthKm)).toBeLessThan(600);
    }
    expect(worst).toBeLessThan(0.5);
  });
});

describe("helpers", () => {
  it("round-trips destination and distance", () => {
    const [lat, lon] = destination(-89, 20, 135, 40);
    expect(surfaceDistanceKm(-89, 20, lat, lon)).toBeCloseTo(40, 6);
  });
  it("gives full Earth opposite the Sun and new Earth beside it", () => {
    expect(earthPhase(180)).toBeCloseTo(1);
    expect(earthPhase(0)).toBeCloseTo(0);
    expect(separation({ az: 10, el: 0 }, { az: 100, el: 0 })).toBeCloseTo(90);
  });
});

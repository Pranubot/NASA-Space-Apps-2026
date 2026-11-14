import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { HorizonProfile, Site, SubpointTable } from "../data/types";
import { mockHorizon } from "../data/mock";
import { analyticSubpoints, tableSubpoints } from "./astro";
import { bestWindows, evaluate, slipAnalysis } from "./scenario";
import {
  DEFAULT_CONSTRAINTS, applyConstraints, buildGeometry, computeMetrics, discFraction, earthMargin, horizonAt,
  indexAt, nextChange, powerFraction, segmentFraction, windowsOf,
} from "./visibility";

const data = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const table = data("ephemeris.json") as SubpointTable;
const sites = (data("sites.json") as { sites: Site[] }).sites;
const horizons = (data("horizons.json") as { horizons: Record<string, HorizonProfile> }).horizons;
const subAt = (t: number) => {
  const sp = tableSubpoints(table, t);
  return sp ? { sp, approx: false } : { sp: analyticSubpoints(t), approx: true };
};
const site = (id: string) => sites.find((s) => s.id === id)!;
const flat = (el: number): HorizonProfile => ({
  siteKey: "flat", azStepDeg: 1, elevationDeg: new Array(360).fill(el), observerHeightM: 2, maxRangeKm: 1, source: "test",
});
const DAY = 86_400_000;
const START = Date.UTC(2027, 0, 1);

function run(id: string, days = 30, start = START) {
  const s = site(id);
  const g = buildGeometry(s, horizons[id], subAt, start, start + days * DAY, 60);
  const f = applyConstraints(g, DEFAULT_CONSTRAINTS);
  return { g, f, m: computeMetrics(g, f, 0, g.count - 1) };
}

describe("disc occlusion", () => {
  it("segment fraction is 0, 0.5 and 1 at the obvious places", () => {
    expect(segmentFraction(-1, 0.27)).toBe(0);
    expect(segmentFraction(0, 0.27)).toBeCloseTo(0.5, 6);
    expect(segmentFraction(1, 0.27)).toBe(1);
  });

  it("strip integration agrees with the exact segment area on a flat horizon", () => {
    for (const el of [-0.2, -0.1, 0, 0.05, 0.15, 0.3]) {
      expect(discFraction(flat(0), 120, el, 0.267)).toBeCloseTo(segmentFraction(el, 0.267), 1);
    }
  });

  it("interpolates the horizon and wraps at 360", () => {
    const h: HorizonProfile = { ...flat(0), elevationDeg: Array.from({ length: 360 }, (_, i) => i) };
    expect(horizonAt(h, 10.5)).toBeCloseTo(10.5);
    expect(horizonAt(h, 359.5)).toBeCloseTo(179.5);
    expect(horizonAt(h, -1)).toBeCloseTo(359);
  });

  it("power follows cos(el) for a vertical array and sin(el) for a flat one", () => {
    expect(powerFraction(1, 0, "vertical")).toBeCloseTo(1);
    expect(powerFraction(1, 0, "horizontal")).toBeCloseTo(0);
    expect(powerFraction(0.5, 30, "horizontal")).toBeCloseTo(0.25);
    expect(powerFraction(0, 30, "vertical")).toBe(0);
  });
});

describe("windows and metrics", () => {
  it("merges runs and reports hours", () => {
    const g = buildGeometry(site("apollo-11"), flat(0), subAt, START, START + 2 * DAY, 60);
    const flag = new Uint8Array(g.count);
    flag.fill(1, 3, 8);
    flag.fill(1, 20, 22);
    const ws = windowsOf(flag, g, 0, g.count);
    expect(ws).toHaveLength(2);
    expect((ws[0].endMs - ws[0].startMs) / 3_600_000).toBe(5);
  });

  it("an equatorial site sees about half a lunar day of Sun and Earth all the time", () => {
    const { m } = run("apollo-11", 59);
    expect(m.sunlitPct).toBeGreaterThan(44);
    expect(m.sunlitPct).toBeLessThan(56);
    expect(m.earthPct).toBe(100);
    expect(m.longestDarkH).toBeGreaterThan(300);
  });

  it("a far-side site never sees Earth", () => {
    expect(run("change-4").m.earthPct).toBe(0);
  });

  it("the floor of Shackleton is permanently dark while the rim above it is mostly lit", () => {
    let floor = 0, rim = 0, n = 0;
    for (let month = 0; month < 12; month++) {
      const start = Date.UTC(2027, month, 1);
      floor += run("shackleton-floor", 28, start).m.sunlitPct;
      rim += run("connecting-ridge", 28, start).m.sunlitPct;
      n++;
    }
    expect(floor).toBe(0);
    expect(rim / n).toBeGreaterThan(55);
  });

  it("finds the next Earthset on a libration-limited site", () => {
    const { g } = run("shackleton-rim", 60);
    const nc = nextChange(g, earthMargin(g, DEFAULT_CONSTRAINTS), START);
    expect(nc.atMs === null || nc.atMs > START).toBe(true);
  });
});

describe("verdicts and slip analysis", () => {
  it("fails a far-side site on comms and names the reason", () => {
    const ev = evaluate(run("change-4").m, DEFAULT_CONSTRAINTS);
    expect(ev.overall).toBe("NO-GO");
    expect(ev.checks.find((c) => c.id === "comms")!.reason).toMatch(/relay/i);
  });

  it("marks values within 20% of a limit as MARGINAL", () => {
    const { m } = run("apollo-11", 5);
    const ev = evaluate({ ...m, longestDarkH: 45 }, DEFAULT_CONSTRAINTS);
    expect(ev.checks.find((c) => c.id === "dark")!.verdict).toBe("MARGINAL");
  });

  it("slip analysis returns one point per day and best windows are spaced apart", () => {
    const s = site("connecting-ridge");
    const g = buildGeometry(s, horizons[s.id], subAt, START - 15 * DAY, START + 60 * DAY, 60);
    const f = applyConstraints(g, DEFAULT_CONSTRAINTS);
    const pts = slipAnalysis(g, f, DEFAULT_CONSTRAINTS, START, 14, -15, 30);
    expect(pts).toHaveLength(46);
    expect(pts.every((p) => p.complete)).toBe(true);
    expect(pts[15].startMs).toBe(START);
    const best = bestWindows(pts, 3, 4);
    for (let i = 1; i < best.length; i++) expect(Math.abs(best[i].offsetDays - best[0].offsetDays)).toBeGreaterThanOrEqual(4);
    expect(indexAt(g, START)).toBe(15 * 24);
  });
});

describe("mock sanity", () => {
  it("produces a closed, bounded horizon for any coordinate", () => {
    const h = mockHorizon({ id: "x", name: "x", lat: -88, lon: 10, category: "custom" });
    const e = Array.from(h.elevationDeg);
    expect(Math.max(...e)).toBeLessThan(8);
    expect(Math.abs(e[0] - e[e.length - 1])).toBeLessThan(0.5);
  });
});

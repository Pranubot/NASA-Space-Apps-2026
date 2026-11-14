// The tour's captions state facts about the default scenario. This pins them to the shipped data.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { HorizonProfile, Site, SubpointTable } from "../data/types";
import { tableSubpoints } from "../lib/astro";
import { evaluate, slipAnalysis } from "../lib/scenario";
import { DAY } from "../lib/time";
import { DEFAULT_CONSTRAINTS as C, applyConstraints, buildGeometry, computeMetrics, indexAt } from "../lib/visibility";
import { DEFAULT_SCENARIO } from "./store";
import { TOUR_SLIP_DAYS, TOUR_STEPS, tourState } from "./tour";

const data = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const table = data("ephemeris.json") as SubpointTable;
const sites = (data("sites.json") as { sites: Site[] }).sites;
const horizons = (data("horizons.json") as { horizons: Record<string, HorizonProfile> }).horizons;
const { startMs: START, days } = DEFAULT_SCENARIO;

function story(id: string) {
  const g = buildGeometry(sites.find((s) => s.id === id)!, horizons[id], (t) => ({ sp: tableSubpoints(table, t)!, approx: false }), START - DAY, START + (days + 31) * DAY, 30);
  const f = applyConstraints(g, C);
  const m = computeMetrics(g, f, indexAt(g, START), indexAt(g, START + days * DAY));
  const slip = slipAnalysis(g, f, C, START, days, 1, 30);
  return { m, verdict: evaluate(m, C).overall, maxSunEl: Math.max(...g.sunEl.slice(indexAt(g, START), indexAt(g, START + days * DAY))), slip: (d: number) => slip[d - 1].verdict };
}

it("the tour's captions match the shipped data", () => {
  const ridge = story("connecting-ridge");
  expect(ridge.verdict).toBe("GO"); // "passes them all"
  expect(ridge.maxSunEl).toBeLessThan(2.05); // "never climbs more than about 2°"
  expect(ridge.slip(3)).toBe("NO-GO"); // "three days late is already too late"
  expect(ridge.slip(TOUR_SLIP_DAYS)).toBe("NO-GO"); // "turns NO-GO"
  expect(story("malapert-massif").slip(TOUR_SLIP_DAYS)).toBe("NO-GO"); // "Malapert Massif fails too"

  const athena = story("im2-athena");
  expect(athena.verdict).toBe("NO-GO");
  expect(Math.round(athena.m.longestDarkH)).toBe(171); // "longest night is 171 hours"
  expect(C.maxDarkH).toBe(50); // "the battery survives 50"
  expect(days).toBe(14); // "the same 14-day mission"
});

it("every step shows a selected site at a time inside the mission", () => {
  TOUR_STEPS.forEach((_, i) => {
    const s = tourState(i);
    expect(s.selectedIds).toContain(s.focusId);
    expect(s.tMs).toBeGreaterThanOrEqual(s.startMs);
    expect(s.tMs).toBeLessThanOrEqual(s.startMs + s.days * DAY);
  });
});

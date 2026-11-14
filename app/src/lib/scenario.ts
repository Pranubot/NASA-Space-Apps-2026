// Constraints -> verdicts, schedule-slip analysis and best-window search. Pure functions.

import type { Constraints, Flags, Geometry, SiteMetrics } from "./visibility";
import { computeMetrics, indexAt } from "./visibility";

export type Verdict = "GO" | "MARGINAL" | "NO-GO";

export interface Check {
  id: "dark" | "both" | "comms" | "touchdown";
  /** who owns the limit: engineering (hardware) or operations */
  owner: "ENG" | "OPS";
  label: string;
  verdict: Verdict;
  /** measured value, formatted */
  value: string;
  /** the limit it was compared against, formatted */
  limit: string;
  reason: string;
}

export interface Evaluation {
  overall: Verdict;
  checks: Check[];
  /** the check that decides the overall verdict (worst one) */
  driver: Check;
}

const RANK: Record<Verdict, number> = { GO: 0, MARGINAL: 1, "NO-GO": 2 };
export const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

/** MARGINAL = within 20 % of a limit. */
function upperLimit(value: number, limit: number): Verdict {
  if (value > limit) return "NO-GO";
  if (value > 0.8 * limit) return "MARGINAL";
  return "GO";
}
function lowerLimit(value: number, limit: number): Verdict {
  if (value < limit) return "NO-GO";
  if (value < 1.2 * limit) return "MARGINAL";
  return "GO";
}

const h0 = (v: number) => `${Math.round(v)} h`;
const h1 = (v: number) => `${v.toFixed(1)} h`;

export function evaluate(m: SiteMetrics, c: Constraints): Evaluation {
  const dark = upperLimit(m.longestDarkH, c.maxDarkH);
  const both = lowerLimit(m.bothHoursPerDay, c.minBothHoursPerDay);
  const comms = upperLimit(m.longestCommsGapH, c.maxCommsGapH);
  const touchdown: Verdict = m.litAtStart && m.earthAtStart ? "GO" : m.litAtStart || m.earthAtStart ? "MARGINAL" : "NO-GO";

  const checks: Check[] = [
    {
      id: "dark", owner: "ENG", label: "Longest darkness", verdict: dark,
      value: h0(m.longestDarkH), limit: `≤ ${h0(c.maxDarkH)}`,
      reason:
        dark === "GO"
          ? `Longest night is ${h0(m.longestDarkH)}, inside the ${h0(c.maxDarkH)} battery limit.`
          : dark === "MARGINAL"
            ? `Longest night is ${h0(m.longestDarkH)}, within 20% of the ${h0(c.maxDarkH)} battery limit.`
            : `Longest night is ${h0(m.longestDarkH)}; the battery survives ${h0(c.maxDarkH)}.`,
    },
    {
      id: "both", owner: "OPS", label: "Power + comms", verdict: both,
      value: `${h1(m.bothHoursPerDay)}/d`, limit: `≥ ${c.minBothHoursPerDay} h/d`,
      reason:
        both === "NO-GO"
          ? `Only ${h1(m.bothHoursPerDay)} per day with Sun and Earth together; operations need ${h1(c.minBothHoursPerDay)}.`
          : both === "MARGINAL"
            ? `${h1(m.bothHoursPerDay)} per day with Sun and Earth together, close to the ${h1(c.minBothHoursPerDay)} minimum.`
            : `${h1(m.bothHoursPerDay)} per day with Sun and Earth together.`,
    },
    {
      id: "comms", owner: "OPS", label: "Longest comms gap", verdict: comms,
      value: h0(m.longestCommsGapH), limit: `≤ ${h0(c.maxCommsGapH)}`,
      reason:
        comms === "GO"
          ? m.longestCommsGapH === 0
            ? "Earth stays above the terrain mask for the whole mission."
            : `Longest stretch without Earth is ${h0(m.longestCommsGapH)}.`
          : comms === "MARGINAL"
            ? `Longest stretch without Earth is ${h0(m.longestCommsGapH)}, near the ${h0(c.maxCommsGapH)} limit.`
            : m.earthPct === 0
              ? "Earth never clears the terrain here. A relay satellite is required."
              : `${h0(m.longestCommsGapH)} without Earth in view; the limit is ${h0(c.maxCommsGapH)}.`,
    },
    {
      id: "touchdown", owner: "OPS", label: "Touchdown", verdict: touchdown,
      value: `${m.litAtStart ? "Sunlit" : "Dark"}, ${m.earthAtStart ? "link" : "no link"}`, limit: "lit + link",
      reason:
        touchdown === "GO"
          ? "Landing happens in sunlight with Earth in view."
          : touchdown === "MARGINAL"
            ? m.litAtStart
              ? "Landing is sunlit but Earth is below the terrain mask."
              : "Earth is in view at landing but the site is dark."
            : "Landing would happen in darkness with no direct link to Earth.",
    },
  ];
  const driver = checks.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
  return { overall: driver.verdict, checks, driver };
}

// ---------------------------------------------------------------------------------------------
// Schedule slip
// ---------------------------------------------------------------------------------------------

export interface SlipPoint {
  offsetDays: number;
  startMs: number;
  bothHours: number;
  bothHoursPerDay: number;
  longestDarkH: number;
  sunlitPct: number;
  verdict: Verdict;
  driver: Check;
  /** false when the window runs past the computed series */
  complete: boolean;
}

const DAY = 86_400_000;

/** Evaluate the same mission length at a range of landing-date offsets. */
export function slipAnalysis(
  g: Geometry,
  f: Flags,
  c: Constraints,
  startMs: number,
  missionDays: number,
  fromDays: number,
  toDays: number,
): SlipPoint[] {
  const out: SlipPoint[] = [];
  for (let d = fromDays; d <= toDays; d++) {
    const s = startMs + d * DAY;
    const e = s + missionDays * DAY;
    const complete = s >= g.startMs && e <= g.startMs + (g.count - 1) * g.stepMs + g.stepMs;
    const m = computeMetrics(g, f, indexAt(g, s), indexAt(g, e));
    const ev = evaluate(m, c);
    out.push({
      offsetDays: d, startMs: s, bothHours: m.bothHours, bothHoursPerDay: m.bothHoursPerDay,
      longestDarkH: m.longestDarkH, sunlitPct: m.sunlitPct, verdict: ev.overall, driver: ev.driver, complete,
    });
  }
  return out;
}

/** Top landing dates in a search horizon: GO first, then most power+comms hours, spaced apart. */
export function bestWindows(points: SlipPoint[], count = 5, minSpacingDays = 4): SlipPoint[] {
  const sorted = points
    .filter((p) => p.complete)
    .sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || b.bothHours - a.bothHours || a.longestDarkH - b.longestDarkH);
  const picked: SlipPoint[] = [];
  for (const p of sorted) {
    if (picked.length >= count) break;
    if (picked.every((q) => Math.abs(q.offsetDays - p.offsetDays) >= minSpacingDays)) picked.push(p);
  }
  return picked;
}

/** Operations score 0..5 for the trade view: power+comms share of the mission, penalised by verdict. */
export function opsScore(m: SiteMetrics, v: Verdict): number {
  const base = (m.bothPct / 100) * 5;
  return Math.max(0, base - (v === "NO-GO" ? 0.5 : 0));
}

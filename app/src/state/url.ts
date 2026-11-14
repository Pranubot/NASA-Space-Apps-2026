// Scenario <-> URL. Compact query params so a link can be pasted into chat:
//   ?s=connecting-ridge,malapert-massif&f=connecting-ridge&start=2027-09-15&d=14&t=36&c=dark:50,both:6
// Custom sites ride along as x=lat_lon;lat_lon so the link works on another machine.

import { DAY, HOUR, isoDate, parseIsoDate } from "../lib/time";
import { DEFAULT_CONSTRAINTS, type Constraints } from "../lib/visibility";
import { DEFAULT_SCENARIO, MAX_SELECTED, makeCustomSite, type ScenarioState } from "./store";

const C_KEYS: [short: string, key: keyof Constraints][] = [
  ["frac", "sunMinFraction"], ["mask", "earthMaskDeg"], ["dark", "maxDarkH"], ["both", "minBothHoursPerDay"],
  ["gap", "maxCommsGapH"], ["w", "panelW"],
];

export function encodeScenario(s: ScenarioState): string {
  const p = new URLSearchParams();
  p.set("s", s.selectedIds.join(","));
  p.set("f", s.focusId);
  p.set("start", isoDate(s.startMs));
  p.set("d", String(s.days));
  p.set("t", ((s.tMs - s.startMs) / HOUR).toFixed(1));
  const c: string[] = [];
  for (const [short, key] of C_KEYS) {
    if (s.constraints[key] !== DEFAULT_CONSTRAINTS[key]) c.push(`${short}:${s.constraints[key]}`);
  }
  if (s.constraints.panelMode !== DEFAULT_CONSTRAINTS.panelMode) c.push("pm:h");
  if (c.length) p.set("c", c.join(","));
  if (s.customSites.length) p.set("x", s.customSites.map((x) => `${x.lat}_${x.lon}`).join(";"));
  if (s.title !== DEFAULT_SCENARIO.title) p.set("n", s.title);
  if (s.view !== "panorama") p.set("v", "3d");
  // keep commas, colons and semicolons readable
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%3B/g, ";");
}

export function decodeScenario(search: string): Partial<ScenarioState> | null {
  const p = new URLSearchParams(search);
  if (!p.has("s") && !p.has("start")) return null;
  const out: Partial<ScenarioState> = {};

  const x = p.get("x");
  if (x) {
    out.customSites = x
      .split(";")
      .map((pair) => pair.split("_").map(Number))
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      .map(([lat, lon]) => makeCustomSite(lat, lon));
  }
  const s = p.get("s");
  if (s) out.selectedIds = s.split(",").filter(Boolean).slice(0, MAX_SELECTED);
  const f = p.get("f");
  if (f) out.focusId = f;
  const start = parseIsoDate(p.get("start") ?? "");
  if (start !== null) out.startMs = start;
  const d = Number(p.get("d"));
  if (Number.isFinite(d) && d >= 1 && d <= 120) out.days = Math.round(d);
  const base = out.startMs ?? DEFAULT_SCENARIO.startMs;
  const t = Number(p.get("t"));
  out.tMs = base + (Number.isFinite(t) ? t * HOUR : 0);
  if (out.days) out.tMs = Math.min(out.tMs, base + out.days * DAY);

  const c = p.get("c");
  if (c) {
    const constraints: Constraints = { ...DEFAULT_CONSTRAINTS };
    for (const part of c.split(",")) {
      const [k, v] = part.split(":");
      if (k === "pm") constraints.panelMode = v === "h" ? "horizontal" : "vertical";
      const key = C_KEYS.find(([short]) => short === k)?.[1];
      const num = Number(v);
      if (key && Number.isFinite(num) && num >= 0) (constraints[key] as number) = num;
    }
    out.constraints = constraints;
  }
  const n = p.get("n");
  if (n) out.title = n.slice(0, 80);
  if (p.get("v") === "3d") out.view = "terrain";
  return out;
}

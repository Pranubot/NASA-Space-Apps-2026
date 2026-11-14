// Plain-language reading of the current instant, for people who do not read az/el for a living.

import type { Site } from "../data/types";
import type { NextChange, Instant } from "./visibility";
import { fmtDuration } from "./time";

const HOUR = 3_600_000;

function until(nc: NextChange, tMs: number): string | null {
  return nc.atMs === null ? null : fmtDuration((nc.atMs - tMs) / HOUR);
}

/** How long the Sun spends this close to the horizon on Earth, for comparison. */
function earthComparison(sunElDeg: number): string {
  if (sunElDeg < 0.6) return "On Earth that is the last two minutes before sunset.";
  if (sunElDeg < 2) return "On Earth the Sun is this low for about five minutes a day.";
  if (sunElDeg < 6) return "On Earth this is golden hour.";
  return "";
}

export function narrate(site: Site, i: Instant, sun: NextChange, earth: NextChange, earthNever: boolean): string {
  const parts: string[] = [];
  const polar = Math.abs(site.lat) > 80;

  if (i.sunFrac >= 0.999) {
    const left = until(sun, i.tMs);
    parts.push(
      `The Sun sits ${i.sunEl.toFixed(1)}° above the level horizon and ${i.sunClear.toFixed(1)}° clear of the terrain` +
        (left ? `; it stays up for another ${left}.` : " and does not set before the mission ends."),
    );
    if (polar) {
      const cmp = earthComparison(i.sunEl);
      if (cmp) parts.push(cmp);
    }
  } else if (i.sunFrac > 0.001) {
    parts.push(
      `A ridge is cutting across the Sun: ${Math.round(i.sunFrac * 100)}% of the disc is visible, so the array makes about ${Math.round(i.powerW)} W.`,
    );
  } else {
    const back = until(sun, i.tMs);
    parts.push(
      i.sunEl > 0
        ? `The Sun is above the level horizon but hidden behind terrain${back ? `; it returns in ${back}.` : " for the rest of the mission."}`
        : `The Sun is below the horizon${back ? `; sunrise in ${back}.` : " for the rest of the mission."}`,
    );
  }

  if (i.earthVisible) {
    const left = until(earth, i.tMs);
    parts.push(
      `Earth is in view ${i.earthClear.toFixed(1)}° above the terrain${left ? `, with ${left} of direct link left.` : " for the rest of the mission."}`,
    );
  } else if (earthNever && i.earthEl < 0) {
    parts.push("Earth never rises here during this mission, so every message needs a relay satellite.");
  } else {
    const back = until(earth, i.tMs);
    parts.push(`Earth is blocked${back ? `; the direct link returns in ${back}.` : " for the rest of the mission."}`);
  }
  return parts.join(" ");
}

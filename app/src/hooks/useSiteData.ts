// Derived data for the views: geometry series, constraint flags, metrics and verdicts per site.
// Geometry is cached at module level so three panels asking for the same site share one series.

import { useMemo } from "react";
import type { Dataset, HorizonProfile, Site } from "../data/types";
import { evaluate, type Evaluation } from "../lib/scenario";
import { DAY } from "../lib/time";
import {
  applyConstraints, buildGeometry, computeMetrics, indexAt, instantAt,
  type Constraints, type Flags, type Geometry, type Instant, type SiteMetrics,
} from "../lib/visibility";
import { SLIP_AFTER_DAYS, SLIP_BEFORE_DAYS, allSites, findSite, useStore } from "../state/store";

const geomCache = new Map<string, Geometry>();
const flagCache = new WeakMap<Geometry, { c: Constraints; f: Flags }>();

function cachedGeometry(ds: Dataset, site: Site, h: HorizonProfile, startMs: number, endMs: number, stepMin: number): Geometry {
  const key = `${ds.name}|${site.id}|${site.lat}|${site.lon}|${site.elevationM ?? 0}|${h.source}|${startMs}|${endMs}|${stepMin}`;
  let g = geomCache.get(key);
  if (!g) {
    g = buildGeometry(site, h, (t) => ds.subpoints(t), startMs, endMs, stepMin);
    if (geomCache.size > 160) geomCache.delete(geomCache.keys().next().value as string);
    geomCache.set(key, g);
  }
  return g;
}

function cachedFlags(g: Geometry, c: Constraints): Flags {
  const hit = flagCache.get(g);
  if (hit && hit.c === c) return hit.f;
  const f = applyConstraints(g, c);
  flagCache.set(g, { c, f });
  return f;
}

/** Sampling step for the detailed series: finer for short missions so countdowns stay precise. */
export const detailStepMin = (days: number) => (days <= 10 ? 15 : days <= 30 ? 30 : days <= 60 ? 60 : 120);

export interface SiteData {
  site: Site;
  horizon: HorizonProfile;
  /** covers the mission plus the slip-analysis margins either side */
  geom: Geometry;
  flags: Flags;
  /** sample range of the mission window inside geom */
  i0: number;
  i1: number;
  metrics: SiteMetrics;
  evaluation: Evaluation;
}

function build(ds: Dataset, site: Site, startMs: number, days: number, c: Constraints): SiteData | null {
  const horizon = ds.horizon(site);
  if (!horizon) return null;
  const geom = cachedGeometry(
    ds, site, horizon,
    startMs - SLIP_BEFORE_DAYS * DAY,
    startMs + (days + SLIP_AFTER_DAYS) * DAY,
    detailStepMin(days),
  );
  const flags = cachedFlags(geom, c);
  const i0 = indexAt(geom, startMs);
  const i1 = indexAt(geom, startMs + days * DAY);
  const metrics = computeMetrics(geom, flags, i0, i1);
  return { site, horizon, geom, flags, i0, i1, metrics, evaluation: evaluate(metrics, c) };
}

/** Full detail for one site (selected sites only). Null while a custom horizon is computing. */
export function useSiteData(siteId: string | undefined): SiteData | null {
  const ds = useStore((s) => s.dataset);
  const site = useStore((s) => (siteId ? findSite(s, siteId) : undefined));
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const c = useStore((s) => s.constraints);
  const hv = useStore((s) => s.horizonVersion);
  return useMemo(
    () => (ds && site ? build(ds, site, startMs, days, c) : null),
    // hv invalidates when a custom horizon arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds, site, startMs, days, c, hv],
  );
}

export function useSelectedData(): (SiteData | null)[] {
  const ids = useStore((s) => s.selectedIds);
  const a = useSiteData(ids[0]);
  const b = useSiteData(ids[1]);
  const c = useSiteData(ids[2]);
  return useMemo(() => [a, b, c].slice(0, ids.length), [a, b, c, ids.length]);
}

export interface SiteSummary {
  site: Site;
  metrics: SiteMetrics;
  evaluation: Evaluation;
}

/** Hourly-resolution verdict for every site, for map pins, the list and the trade view. */
export function useAllSummaries(): Map<string, SiteSummary> {
  const ds = useStore((s) => s.dataset);
  const custom = useStore((s) => s.customSites);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const c = useStore((s) => s.constraints);
  const hv = useStore((s) => s.horizonVersion);
  return useMemo(() => {
    const out = new Map<string, SiteSummary>();
    if (!ds) return out;
    for (const site of allSites({ dataset: ds, customSites: custom })) {
      const h = ds.horizon(site);
      if (!h) continue;
      const g = cachedGeometry(ds, site, h, startMs, startMs + days * DAY, 60);
      const metrics = computeMetrics(g, cachedFlags(g, c), 0, g.count - 1);
      out.set(site.id, { site, metrics, evaluation: evaluate(metrics, c) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, custom, startMs, days, c, hv]);
}

/** Exact geometry at the cursor (not interpolated from the series), re-evaluated every frame. */
export function useInstant(data: SiteData | null): Instant | null {
  const ds = useStore((s) => s.dataset);
  const tMs = useStore((s) => s.tMs);
  const c = useStore((s) => s.constraints);
  return useMemo(
    () => (ds && data ? instantAt(data.site, data.horizon, ds.subpoints(tMs).sp, tMs, c) : null),
    [ds, data, tMs, c],
  );
}

/** Long, coarse series for the best-dates search. */
export function yearGeometry(ds: Dataset, site: Site, startMs: number, days: number, searchDays: number): Geometry | null {
  const h = ds.horizon(site);
  if (!h) return null;
  return cachedGeometry(ds, site, h, startMs, startMs + (searchDays + days) * DAY, 60);
}

export { cachedFlags };

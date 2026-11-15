// The hero view: the sky as seen from the landing site. Azimuth runs left to right, elevation is
// vertically exaggerated so a Sun two degrees up is readable. Terrain is the real LOLA horizon.
//
// Layers, back to front: stars (canvas) -> body paths and discs (svg) -> terrain (canvas) ->
// grid, labels, ghosts and interaction (svg).

import { Crosshair, ImageDown, Minus, Plus, RotateCcw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HorizonProfile } from "../data/types";
import { clamp, earthPhase, separation, wrap180, wrap360 } from "../lib/astro";
import { COLOR, FONT_MONO, FONT_UI } from "../lib/theme";
import { cardinal, fmtDateTime, fmtDayMonth, DAY } from "../lib/time";
import { horizonAt, horizonDistAt, timeAt, type Geometry, type Instant } from "../lib/visibility";
import type { SiteData } from "../hooks/useSiteData";
import { useSize, useTween } from "../hooks/useApp";
import { useStore } from "../state/store";

const ML = 46, MR = 10, MT = 10, MB = 28;

type Follow = "free" | "sun" | "earth";

interface View {
  centre: number;
  span: number;
  lo: number;
  hi: number;
  pw: number;
  ph: number;
}

const X = (v: View, az: number) => ML + v.pw / 2 + (wrap180(az - v.centre) * v.pw) / v.span;
const Y = (v: View, el: number) => MT + ((v.hi - el) * v.ph) / (v.hi - v.lo);

/** Blend from the previous site's horizon to the new one so the ridge line morphs. */
function useMorphedHorizon(target: HorizonProfile): HorizonProfile {
  const [blend, setBlend] = useState<HorizonProfile>(target);
  const prev = useRef<HorizonProfile>(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBlend(target);
      return;
    }
    const n = 720;
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = horizonAt(from, i * 0.5);
      b[i] = horizonAt(target, i * 0.5);
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 520);
      const e = 1 - Math.pow(1 - k, 4);
      if (k >= 1) {
        setBlend(target);
        return;
      }
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = a[i] + (b[i] - a[i]) * e;
      setBlend({ ...target, azStepDeg: 0.5, elevationDeg: out, distKm: undefined });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return blend;
}

/** Elevation window that fits the terrain and both bodies over the mission. */
function elevationRange(h: HorizonProfile, g: Geometry, i0: number, i1: number): [number, number] {
  let hzMin = Infinity, hzMax = -Infinity;
  for (let i = 0; i < h.elevationDeg.length; i++) {
    const e = h.elevationDeg[i];
    if (e < hzMin) hzMin = e;
    if (e > hzMax) hzMax = e;
  }
  let top = hzMax;
  for (let i = i0; i <= i1; i++) {
    if (g.sunEl[i] > top) top = g.sunEl[i];
    if (g.earthEl[i] > top && g.earthEl[i] > hzMin - 3) top = g.earthEl[i];
  }
  const range = top - Math.min(hzMin, 0);
  const hi = Math.min(93, top + Math.max(1.6, range * 0.14));
  const lo = Math.max(-14, Math.min(hzMin, 0) - Math.max(1.3, range * 0.1));
  return [lo, hi];
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 45, 90];
  return steps.find((s) => s >= raw) ?? 90;
}

// ---------------------------------------------------------------------------------------------
// Canvas layers
// ---------------------------------------------------------------------------------------------

const STARS = (() => {
  let s = 20261114;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 420 }, () => ({ az: rnd() * 360, f: rnd(), mag: Math.pow(rnd(), 3), tint: rnd() }));
})();

function drawStars(cv: HTMLCanvasElement, v: View, w: number, h: number, dim: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, MT, 0, MT + v.ph);
  sky.addColorStop(0, "#000000");
  sky.addColorStop(1, "#08090b");
  ctx.fillStyle = sky;
  ctx.fillRect(ML, MT, v.pw, v.ph);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ML, MT, v.pw, v.ph);
  ctx.clip();
  for (const st of STARS) {
    const dx = wrap180(st.az - v.centre);
    if (Math.abs(dx) > v.span / 2) continue;
    const x = ML + v.pw / 2 + (dx * v.pw) / v.span;
    const y = MT + st.f * v.ph;
    const r = 0.45 + st.mag * 1.25;
    ctx.globalAlpha = (0.25 + st.mag * 0.75) * dim;
    ctx.fillStyle = st.tint > 0.85 ? "#ffe2bd" : st.tint < 0.15 ? "#d3e2ff" : "#f2f2f2";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTerrain(cv: HTMLCanvasElement, v: View, w: number, h: number, hz: HorizonProfile, inst: Instant | null) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ML, MT, v.pw, v.ph);
  ctx.clip();

  const bottom = MT + v.ph;
  const cols = Math.ceil(v.pw);
  const ys = new Float32Array(cols + 1);
  // columns: grey by distance to the ridge that forms the horizon, so near and far terrain separate
  for (let c = 0; c <= cols; c++) {
    const az = v.centre + (c / v.pw - 0.5) * v.span;
    const y = Y(v, horizonAt(hz, az));
    ys[c] = y;
    const d = horizonDistAt(hz, az);
    const k = d === null ? 0.45 : clamp(Math.log10(Math.max(d, 0.3) / 0.3) / 3, 0, 1);
    const l = Math.round(32 + k * 66);
    ctx.fillStyle = `rgb(${l},${l},${l + 2})`;
    ctx.fillRect(ML + c, y, 1.5, bottom - y);
  }
  // darken towards the foreground
  const g = ctx.createLinearGradient(0, MT, 0, bottom);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = g;
  ctx.fillRect(ML, MT, v.pw, v.ph);
  ctx.globalCompositeOperation = "source-over";

  // ridge line
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) (c ? ctx.lineTo : ctx.moveTo).call(ctx, ML + c, ys[c]);
  ctx.strokeStyle = "rgba(205,205,205,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // sunlit crest: the ridge under the Sun catches the light
  if (inst && inst.sunFrac > 0.01) {
    const sx = X(v, inst.sunAz);
    const reach = Math.max(60, (26 * v.pw) / v.span);
    const lg = ctx.createLinearGradient(sx - reach, 0, sx + reach, 0);
    const a = 0.25 + 0.7 * inst.sunFrac;
    lg.addColorStop(0, "rgba(245,185,66,0)");
    lg.addColorStop(0.5, `rgba(255,226,160,${a})`);
    lg.addColorStop(1, "rgba(245,185,66,0)");
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Static SVG pieces
// ---------------------------------------------------------------------------------------------

function pathFor(v: View, az: Float32Array, el: Float32Array, i0: number, i1: number): string {
  let d = "";
  let prevX = NaN;
  for (let i = i0; i <= i1; i++) {
    const dx = wrap180(az[i] - v.centre);
    const x = ML + v.pw / 2 + (dx * v.pw) / v.span;
    const y = Y(v, el[i]);
    const jump = Number.isNaN(prevX) || Math.abs(x - prevX) > v.pw * 0.5;
    d += `${jump ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    prevX = x;
  }
  return d;
}

const Paths = memo(function Paths({ v, g, i0, i1 }: { v: View; g: Geometry; i0: number; i1: number }) {
  const sun = useMemo(() => pathFor(v, g.sunAz, g.sunEl, i0, i1), [v, g, i0, i1]);
  const earth = useMemo(() => pathFor(v, g.earthAz, g.earthEl, i0, i1), [v, g, i0, i1]);
  const days = useMemo(() => {
    const out: { x: number; y: number; label: string }[] = [];
    const perDay = Math.round(DAY / g.stepMs);
    const first = Math.ceil(timeAt(g, i0) / DAY) * DAY;
    const total = (i1 - i0) / perDay;
    // a dated dot per day on short missions, per week on long ones, per month beyond six months
    const every = total > 180 ? 30 : total > 45 ? 7 : 1;
    let n = 0;
    for (let t = first; t <= timeAt(g, i1); t += DAY, n++) {
      if (n % every) continue;
      const i = Math.round((t - g.startMs) / g.stepMs);
      if (Math.abs(wrap180(g.sunAz[i] - v.centre)) > v.span / 2) continue;
      const x = X(v, g.sunAz[i]), y = Y(v, g.sunEl[i]);
      // label only where it will not collide with a label already placed
      const clear = out.every((o) => !o.label || Math.abs(o.x - x) > 46 || Math.abs(o.y - y) > 14);
      out.push({ x, y, label: clear ? fmtDayMonth(t) : "" });
    }
    return out;
  }, [v, g, i0, i1]);
  return (
    <g>
      <path d={earth} fill="none" stroke={COLOR.earth} strokeOpacity={0.5} strokeWidth={1.2} />
      <path d={sun} fill="none" stroke={COLOR.sun} strokeOpacity={0.42} strokeWidth={1.2} strokeDasharray="1.5 4" strokeLinecap="round" />
      {days.map((d, k) => (
        <g key={k}>
          <circle cx={d.x} cy={d.y} r={2} fill={COLOR.sun} fillOpacity={0.85} />
          {d.label && (
            <text x={d.x} y={d.y - 7} textAnchor="middle" fontFamily={FONT_MONO} fontSize={9.5} fill={COLOR.sun} fillOpacity={0.75}>
              {d.label}
            </text>
          )}
        </g>
      ))}
    </g>
  );
});

const Grid = memo(function Grid({ v, w, h }: { v: View; w: number; h: number }) {
  const elStep = niceStep(v.hi - v.lo, 6);
  const els: number[] = [];
  for (let e = Math.ceil(v.lo / elStep) * elStep; e <= v.hi; e += elStep) els.push(e);
  const azStep = niceStep(v.span, 9) < 5 ? 5 : niceStep(v.span, 9);
  const azs: number[] = [];
  const a0 = v.centre - v.span / 2;
  for (let a = Math.ceil(a0 / azStep) * azStep; a <= a0 + v.span + 1e-6; a += azStep) azs.push(a);
  const y0 = Y(v, 0);
  return (
    <g>
      {els.map((e) => (
        <g key={e}>
          {e !== 0 && <line x1={ML} x2={w - MR} y1={Y(v, e)} y2={Y(v, e)} stroke="#ffffff" strokeOpacity={0.055} />}
          <text x={ML - 8} y={Y(v, e) + 3.5} textAnchor="end" fontFamily={FONT_MONO} fontSize={10.5} fill={COLOR.text3}>
            {e > 0 ? "+" : ""}{e}°
          </text>
        </g>
      ))}
      {y0 > MT && y0 < h - MB && (
        <g>
          <line x1={ML} x2={w - MR} y1={y0} y2={y0} stroke="#ffffff" strokeOpacity={0.3} strokeDasharray="5 5" />
          <text x={w - MR - 6} y={y0 - 5} textAnchor="end" fontFamily={FONT_UI} fontSize={10.5} fill={COLOR.text2}>
            level horizon
          </text>
        </g>
      )}
      {azs.map((a) => {
        const az = wrap360(a);
        const x = ML + ((a - a0) / v.span) * v.pw;
        const major = az % 90 === 0;
        return (
          <g key={a}>
            <line x1={x} x2={x} y1={h - MB} y2={h - MB + (major ? 6 : 4)} stroke={COLOR.text3} strokeOpacity={0.7} />
            <text
              x={x} y={h - MB + 18} textAnchor="middle"
              fontFamily={major ? FONT_UI : FONT_MONO} fontSize={major ? 11.5 : 10}
              fontWeight={major ? 650 : 400} fill={major ? COLOR.text : COLOR.text3}
            >
              {major ? cardinal(az) : `${Math.round(az)}°`}
            </text>
          </g>
        );
      })}
      <rect x={ML} y={MT} width={v.pw} height={v.ph} fill="none" stroke={COLOR.line} />
    </g>
  );
});

function EarthDisc({ x, y, r, phase, angle }: { x: number; y: number; r: number; phase: number; angle: number }) {
  const rx = r * Math.abs(1 - 2 * phase);
  const lit = `M0,${-r}A${r},${r} 0 0 1 0,${r}A${rx},${r} 0 0 ${phase > 0.5 ? 1 : 0} 0,${-r}Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <circle r={r + 1.2} fill="none" stroke={COLOR.earth} strokeOpacity={0.35} />
      <circle r={r} fill="#12305c" />
      <path d={lit} fill="url(#earthLit)" />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------

interface Hover {
  x: number;
  y: number;
  az: number;
  el: number;
  path?: { body: "Sun" | "Earth"; tMs: number; el: number; x: number; y: number };
}

export function HorizonPanorama({ data, inst }: { data: SiteData; inst: Instant }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const starRef = useRef<HTMLCanvasElement>(null);
  const terrRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<SVGSVGElement>(null);
  const frontRef = useRef<SVGSVGElement>(null);
  const setTime = useStore((s) => s.setTime);
  const showToast = useStore((s) => s.showToast);

  const { geom, i0, i1, site } = data;
  const horizon = useMorphedHorizon(data.horizon);

  const [follow, setFollow] = useState<Follow>("free");
  const [centre, setCentre] = useState(0);
  const [span, setSpan] = useState(360);
  const [hover, setHover] = useState<Hover | null>(null);
  const drag = useRef<{ x: number; centre: number; moved: boolean } | null>(null);

  // Re-frame when the site changes: Earth mid-frame if it is ever up, otherwise the Sun.
  useEffect(() => {
    const st = useStore.getState();
    const iNow = clamp(Math.round((st.tMs - geom.startMs) / geom.stepMs), 0, geom.count - 1);
    const earthUp = geom.earthEl[iNow] > -4;
    setCentre(earthUp ? geom.earthAz[iNow] : geom.sunAz[iNow]);
    setSpan(360);
    setFollow("free");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  const [loT, hiT] = useMemo(() => elevationRange(data.horizon, geom, i0, i1), [data.horizon, geom, i0, i1]);
  const lo = useTween(loT);
  const hi = useTween(hiT);

  const liveCentre = follow === "sun" ? inst.sunAz : follow === "earth" ? inst.earthAz : centre;
  const pw = Math.max(10, size.w - ML - MR);
  const ph = Math.max(10, size.h - MT - MB);
  const v: View = useMemo(() => ({ centre: liveCentre, span, lo, hi, pw, ph }), [liveCentre, span, lo, hi, pw, ph]);

  const pxX = pw / span;
  const pxY = ph / (hi - lo);
  const exaggeration = pxY / pxX;

  useEffect(() => {
    if (starRef.current && size.w > 0) drawStars(starRef.current, v, size.w, size.h, 1 - 0.55 * inst.sunFrac);
  }, [v, size, inst.sunFrac]);

  useEffect(() => {
    if (terrRef.current && size.w > 0) drawTerrain(terrRef.current, v, size.w, size.h, horizon, inst);
    // only the Sun's position and brightness affect the terrain layer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, size, horizon, inst.sunAz, inst.sunFrac]);

  // --- bodies -------------------------------------------------------------------------------
  const sunX = X(v, inst.sunAz), sunY = Y(v, inst.sunEl);
  const earthX = X(v, inst.earthAz), earthY = Y(v, inst.earthEl);
  const sunR = Math.max(4, inst.sunR * pxY);
  const earthR = Math.max(6, inst.earthR * pxY);
  const sunInView = Math.abs(wrap180(inst.sunAz - v.centre)) <= span / 2 + 4;
  const earthInView = Math.abs(wrap180(inst.earthAz - v.centre)) <= span / 2 + 4;
  const sep = separation({ az: inst.sunAz, el: inst.sunEl }, { az: inst.earthAz, el: inst.earthEl });
  const phase = earthPhase(sep);
  const sunAngle =
    (Math.atan2(-(inst.sunEl - inst.earthEl), wrap180(inst.sunAz - inst.earthAz) * Math.cos((inst.earthEl * Math.PI) / 180)) * 180) / Math.PI;

  // bright stretch of the Sun's path either side of the cursor
  const trail = useMemo(() => {
    const iNow = (inst.tMs - geom.startMs) / geom.stepMs;
    const half = Math.round((18 * 3_600_000) / geom.stepMs);
    const a = clamp(Math.floor(iNow) - half, i0, i1), b = clamp(Math.ceil(iNow) + half, i0, i1);
    return pathFor(v, geom.sunAz, geom.sunEl, a, b);
  }, [v, geom, i0, i1, inst.tMs]);

  // --- interaction --------------------------------------------------------------------------
  const nearestOnPath = useCallback(
    (mx: number, my: number): Hover["path"] => {
      let best: Hover["path"];
      let bestD = 13 * 13;
      const step = Math.max(1, Math.floor((i1 - i0) / 900));
      for (let i = i0; i <= i1; i += step) {
        for (const body of ["Sun", "Earth"] as const) {
          const az = body === "Sun" ? geom.sunAz[i] : geom.earthAz[i];
          const el = body === "Sun" ? geom.sunEl[i] : geom.earthEl[i];
          if (Math.abs(wrap180(az - v.centre)) > v.span / 2) continue;
          const x = X(v, az), y = Y(v, el);
          const d = (x - mx) ** 2 + (y - my) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { body, tMs: timeAt(geom, i), el, x, y };
          }
        }
      }
      return best;
    },
    [geom, i0, i1, v],
  );

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, centre: liveCentre, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const [mx, my] = local(e);
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      if (Math.abs(dx) > 3) drag.current.moved = true;
      if (drag.current.moved) {
        setFollow("free");
        setCentre(wrap360(drag.current.centre - dx / pxX));
        setHover(null);
        return;
      }
    }
    if (mx < ML || mx > size.w - MR || my < MT || my > size.h - MB) {
      setHover(null);
      return;
    }
    const az = wrap360(v.centre + ((mx - ML) / pw - 0.5) * span);
    setHover({ x: mx, y: my, az, el: hi - ((my - MT) / ph) * (hi - lo), path: nearestOnPath(mx, my) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const [mx, my] = local(e);
      const hit = nearestOnPath(mx, my);
      if (hit) setTime(hit.tMs);
    }
  };
  const zoomAt = (factor: number, mx?: number) => {
    const next = clamp(span * factor, 10, 360);
    if (mx !== undefined && follow === "free") {
      const azAt = liveCentre + ((mx - ML) / pw - 0.5) * span;
      setCentre(wrap360(azAt - ((mx - ML) / pw - 0.5) * next));
    } else if (follow === "free") {
      setCentre(liveCentre);
    }
    setSpan(next);
  };
  const onWheel = (e: React.WheelEvent) => zoomAt(Math.pow(1.0016, e.deltaY), local(e)[0]);
  const reset = () => {
    setSpan(360);
    setFollow("free");
    setCentre(inst.earthEl > -4 ? inst.earthAz : inst.sunAz);
  };

  const exportPng = async () => {
    const w = size.w, h = size.h, scale = 2;
    const out = document.createElement("canvas");
    out.width = w * scale;
    out.height = h * scale;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(0, 0, out.width, out.height);
    const svgImage = (svg: SVGSVGElement) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(w));
        clone.setAttribute("height", String(h));
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      });
    try {
      ctx.drawImage(starRef.current!, 0, 0, out.width, out.height);
      ctx.drawImage(await svgImage(backRef.current!), 0, 0, out.width, out.height);
      ctx.drawImage(terrRef.current!, 0, 0, out.width, out.height);
      ctx.drawImage(await svgImage(frontRef.current!), 0, 0, out.width, out.height);
      ctx.font = `500 ${11 * scale}px ${FONT_UI}`;
      ctx.fillStyle = COLOR.text2;
      ctx.fillText(`${site.name} · ${fmtDateTime(inst.tMs)} · JPL Horizons + LOLA`, (ML + 8) * scale, (MT + 16) * scale);
      const a = document.createElement("a");
      a.download = `horizon_${site.id}_${new Date(inst.tMs).toISOString().slice(0, 13)}.png`;
      a.href = out.toDataURL("image/png");
      a.click();
      showToast("Panorama saved as PNG");
    } catch {
      showToast("Could not export the panorama in this browser");
    }
  };

  const hoverHz = hover ? horizonAt(horizon, hover.az) : 0;
  const hoverDist = hover ? horizonDistAt(data.horizon, hover.az) : null;
  const ready = size.w > 0;

  return (
    <div className="pano" ref={ref}>
      <canvas ref={starRef} className="pano__layer" style={{ width: size.w, height: size.h }} />
      {ready && (
        <svg ref={backRef} className="pano__layer" width={size.w} height={size.h} aria-hidden>
          <defs>
            <clipPath id="plot">
              <rect x={ML} y={MT} width={pw} height={ph} />
            </clipPath>
            <radialGradient id="sunGlow">
              <stop offset="0" stopColor="#fff3d0" stopOpacity="0.55" />
              <stop offset="0.25" stopColor={COLOR.sun} stopOpacity="0.28" />
              <stop offset="1" stopColor={COLOR.sun} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sunCore">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.6" stopColor="#ffe9b0" />
              <stop offset="1" stopColor={COLOR.sun} />
            </radialGradient>
            <linearGradient id="earthLit" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#2f6fd1" />
              <stop offset="0.6" stopColor="#62b0ff" />
              <stop offset="1" stopColor="#d6ecff" />
            </linearGradient>
          </defs>
          <g clipPath="url(#plot)">
            <Paths v={v} g={geom} i0={i0} i1={i1} />
            <path d={trail} fill="none" stroke={COLOR.sun} strokeOpacity={0.95} strokeWidth={1.8} strokeLinecap="round" />
            {earthInView && <EarthDisc x={earthX} y={earthY} r={earthR} phase={phase} angle={sunAngle} />}
            {sunInView && (
              <g>
                <circle cx={sunX} cy={sunY} r={sunR * (3.5 + 5 * inst.sunFrac)} fill="url(#sunGlow)" opacity={0.25 + 0.75 * inst.sunFrac} />
                <circle cx={sunX} cy={sunY} r={sunR} fill="url(#sunCore)" />
              </g>
            )}
          </g>
        </svg>
      )}
      <canvas ref={terrRef} className="pano__layer" style={{ width: size.w, height: size.h }} />
      {ready && (
        <svg
          ref={frontRef} className="pano__layer pano__front" width={size.w} height={size.h}
          role="img" aria-label={`Horizon panorama at ${site.name}. Sun ${inst.sunEl.toFixed(1)} degrees elevation, Earth ${inst.earthEl.toFixed(1)} degrees.`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)} onWheel={onWheel} onDoubleClick={reset}
        >
          <Grid v={v} w={size.w} h={size.h} />
          <g clipPath="url(#plot)">
            {sunInView && inst.sunFrac < 0.999 && (
              <circle cx={sunX} cy={sunY} r={sunR + 2.5} fill="none" stroke={COLOR.sun} strokeWidth={1.2} strokeDasharray="3 3" />
            )}
            {earthInView && !inst.earthVisible && (
              <circle cx={earthX} cy={earthY} r={earthR + 2.5} fill="none" stroke={COLOR.earth} strokeWidth={1.2} strokeDasharray="3 3" />
            )}
            {sunInView && (
              <text x={sunX} y={sunY - sunR - 9} textAnchor="middle" fontFamily={FONT_UI} fontSize={11.5} fontWeight={650} fill={COLOR.sun}>
                Sun{inst.sunFrac < 0.999 ? (inst.sunFrac > 0.001 ? ` ${Math.round(inst.sunFrac * 100)}%` : " hidden") : ""}
              </text>
            )}
            {earthInView && (
              <text x={earthX} y={earthY - earthR - 9} textAnchor="middle" fontFamily={FONT_UI} fontSize={11.5} fontWeight={650} fill={COLOR.earth}>
                Earth{inst.earthVisible ? "" : " blocked"}
              </text>
            )}
          </g>
          {hover && !hover.path && (
            <g pointerEvents="none">
              <line x1={hover.x} x2={hover.x} y1={MT} y2={size.h - MB} stroke="#ffffff" strokeOpacity={0.22} />
              <circle cx={hover.x} cy={Y(v, hoverHz)} r={3} fill={COLOR.text} />
            </g>
          )}
          {hover?.path && (
            <circle
              cx={hover.path.x} cy={hover.path.y} r={5.5} fill="none" pointerEvents="none"
              stroke={hover.path.body === "Sun" ? COLOR.sun : COLOR.earth} strokeWidth={1.6}
            />
          )}
        </svg>
      )}

      {hover && (
        <div
          className="tip"
          style={{ left: clamp(hover.x + 14, 8, size.w - 236), top: clamp((hover.path?.y ?? hover.y) - 58, 8, size.h - 80) }}
        >
          {hover.path ? (
            <>
              <strong style={{ color: hover.path.body === "Sun" ? COLOR.sun : COLOR.earth }}>{hover.path.body}</strong>
              <span className="num">{fmtDateTime(hover.path.tMs)}</span>
              <span className="tip__dim">elevation <span className="num">{hover.path.el.toFixed(2)}°</span> · click to jump here</span>
            </>
          ) : (
            <>
              <strong>
                {cardinal(hover.az)} <span className="num">{hover.az.toFixed(1)}°</span>
              </strong>
              <span>
                terrain reaches <span className="num">{hoverHz >= 0 ? "+" : ""}{hoverHz.toFixed(2)}°</span>
              </span>
              {hoverDist !== null && (
                <span className="tip__dim">
                  ridge <span className="num">{hoverDist < 10 ? hoverDist.toFixed(1) : Math.round(hoverDist)} km</span> away
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div className="pano__tools">
        <span className="pano__scale" title="Elevation is stretched relative to azimuth so low angles are readable">
          vertical <span className="num">×{exaggeration >= 10 ? Math.round(exaggeration) : exaggeration.toFixed(1)}</span>
        </span>
        <div className="seg" role="group" aria-label="Keep in frame">
          {(["free", "sun", "earth"] as const).map((f) => (
            <button
              key={f} type="button" className={follow === f ? "is-on" : ""} aria-pressed={follow === f}
              onClick={() => {
                if (f === "free") setCentre(liveCentre);
                setFollow(f);
              }}
            >
              {f === "free" ? "Free" : f === "sun" ? "Track Sun" : "Track Earth"}
            </button>
          ))}
        </div>
        <div className="iconrow">
          <button type="button" className="iconbtn" onClick={() => zoomAt(1 / 1.6)} aria-label="Zoom in" title="Zoom in (scroll)">
            <Plus size={15} />
          </button>
          <button type="button" className="iconbtn" onClick={() => zoomAt(1.6)} aria-label="Zoom out" title="Zoom out (scroll)">
            <Minus size={15} />
          </button>
          <button
            type="button" className="iconbtn" aria-label="Zoom to the Sun" title="Zoom to the Sun"
            onClick={() => {
              setFollow("sun");
              setSpan(40);
            }}
          >
            <Crosshair size={15} />
          </button>
          <button type="button" className="iconbtn" onClick={reset} aria-label="Reset view" title="Reset view (double-click)">
            <RotateCcw size={15} />
          </button>
          <button type="button" className="iconbtn" onClick={exportPng} aria-label="Save panorama as PNG" title="Save panorama as PNG">
            <ImageDown size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

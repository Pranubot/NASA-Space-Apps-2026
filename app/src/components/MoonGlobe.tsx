// Whole-Moon view as a globe (orthographic). A flat map smears the south pole along its bottom
// edge, which stacked a dozen polar sites on top of each other; on a globe they sit where they are.
// The surface is the LROC colour mosaic, lit from the Sun's real direction at the current time.
// Drag to turn, scroll to zoom. Sites on the far side are hidden until you turn to them.

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "../data/types";
import { clamp, deg, rad, wrap180 } from "../lib/astro";
import { COLOR, FONT_UI } from "../lib/theme";
import { useAllSummaries } from "../hooks/useSiteData";
import { useSize } from "../hooks/useApp";
import { allSites, findSite, useStore } from "../state/store";
import { AddSiteButton, PlacingHint } from "./AddSiteButton";
import { Pin, SiteTip, type Tip } from "./MapPin";

const DATA = `${import.meta.env.BASE_URL}data/`;

interface View {
  lat: number;
  lon: number;
  zoom: number;
}

/** Unit vectors of the view: towards the viewer, screen-right (east) and screen-up (north). */
function basis(v: View) {
  const la = rad(v.lat), lo = rad(v.lon);
  return {
    c: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
    e: [-Math.sin(lo), Math.cos(lo), 0],
    n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
  };
}

const unit = (lat: number, lon: number) => {
  const la = rad(lat), lo = rad(lon);
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Texture {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

function drawGlobe(cv: HTMLCanvasElement, tex: Texture | null, v: View, sun: number[], w: number, h: number, R: number) {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const out = img.data;
  const { c, e, n } = basis(v);
  const Rp = R * dpr, cx = W / 2, cy = H / 2;
  const x0 = Math.max(0, Math.floor(cx - Rp)), x1 = Math.min(W - 1, Math.ceil(cx + Rp));
  const y0 = Math.max(0, Math.floor(cy - Rp)), y1 = Math.min(H - 1, Math.ceil(cy + Rp));
  for (let py = y0; py <= y1; py++) {
    const y = (cy - py) / Rp;
    for (let px = x0; px <= x1; px++) {
      const x = (px - cx) / Rp;
      const rr = x * x + y * y;
      if (rr > 1) continue;
      const z = Math.sqrt(1 - rr);
      const vx = x * e[0] + y * n[0] + z * c[0];
      const vy = x * e[1] + y * n[1] + z * c[1];
      const vz = x * e[2] + y * n[2] + z * c[2];
      let r = 70, g = 72, b = 76;
      if (tex) {
        const u = (Math.atan2(vy, vx) / (2 * Math.PI) + 0.5) * tex.w;
        const t = (0.5 - Math.asin(vz) / Math.PI) * tex.h;
        const k = (Math.min(tex.h - 1, t | 0) * tex.w + (Math.min(tex.w - 1, u | 0))) * 4;
        r = tex.data[k];
        g = tex.data[k + 1];
        b = tex.data[k + 2];
      }
      // soft terminator; the night side keeps a little detail so sites there stay readable
      const d = vx * sun[0] + vy * sun[1] + vz * sun[2];
      const light = 0.1 + 0.98 * clamp(d * 5 + 0.5, 0, 1) * (0.55 + 0.45 * Math.sqrt(Math.max(0, d)));
      // anti-aliased limb
      const a = clamp((1 - Math.sqrt(rr)) * Rp, 0, 1);
      const o = (py * W + px) * 4;
      out[o] = r * light;
      out[o + 1] = g * light;
      out[o + 2] = b * light * 1.03;
      out[o + 3] = 255 * a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function MoonGlobe() {
  const [ref, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ds = useStore((s) => s.dataset);
  const customSites = useStore((s) => s.customSites);
  const selected = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const hoverId = useStore((s) => s.hoverSiteId);
  const setHoverSite = useStore((s) => s.setHoverSite);
  const focus = useStore((s) => s.focus);
  const addCustom = useStore((s) => s.addCustomSite);
  const placing = useStore((s) => s.placing);
  const setPlacing = useStore((s) => s.setPlacing);
  const tMs = useStore((s) => s.tMs);
  const summaries = useAllSummaries();

  const [tex, setTex] = useState<Texture | null>(null);
  const [view, setView] = useState<View>(() => {
    const s = findSite(useStore.getState(), useStore.getState().focusId);
    return { lat: s ? clamp(s.lat, -70, 70) : -30, lon: s?.lon ?? 0, zoom: 1 };
  });
  const [tip, setTip] = useState<Tip | null>(null);
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; moved: boolean } | null>(null);
  const tween = useRef(0);

  const sites = useMemo(() => allSites({ dataset: ds, customSites }), [ds, customSites]);
  const sub = ds?.subpoints(tMs).sp;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = 1024;
      cv.height = 512;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 1024, 512);
      setTex({ w: 1024, h: 512, data: ctx.getImageData(0, 0, 1024, 512).data });
    };
    img.src = `${DATA}textures/moon_2k.jpg`;
  }, []);

  /** Turn the globe so a point faces the viewer. */
  const turnTo = (lat: number, lon: number) => {
    cancelAnimationFrame(tween.current);
    const from = { ...view };
    const dLon = wrap180(lon - from.lon);
    const t0 = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (now: number) => {
      const k = reduced ? 1 : Math.min(1, (now - t0) / 600);
      const e = 1 - Math.pow(1 - k, 4);
      setView((v) => ({ ...v, lat: from.lat + (lat - from.lat) * e, lon: from.lon + dLon * e }));
      if (k < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };

  // bring the focused site round to the front when the focus changes
  const lastFocus = useRef(focusId);
  useEffect(() => {
    if (lastFocus.current === focusId) return;
    lastFocus.current = focusId;
    const s = findSite(useStore.getState(), focusId);
    if (s) turnTo(clamp(s.lat, -70, 70), s.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  const w = size.w, h = size.h;
  const R = Math.max(10, (Math.min(w, h) / 2 - 14) * view.zoom);
  const sunVec = useMemo(() => (sub ? unit(sub.sLat, sub.sLon) : [1, 0, 0]), [sub]);

  useEffect(() => {
    if (canvasRef.current && w > 0) drawGlobe(canvasRef.current, tex, view, sunVec, w, h, R);
  }, [tex, view, sunVec, w, h, R]);

  const b = basis(view);
  /** Screen position of a lat/lon, or null when it is on the far side. */
  const project = (lat: number, lon: number): [number, number] | null => {
    const p = unit(lat, lon);
    if (dot(p, b.c) < 0.04) return null;
    return [w / 2 + dot(p, b.e) * R, h / 2 - dot(p, b.n) * R];
  };
  const latLonAt = (px: number, py: number): [number, number] | null => {
    const x = (px - w / 2) / R, y = (h / 2 - py) / R;
    const rr = x * x + y * y;
    if (rr > 1) return null;
    const z = Math.sqrt(1 - rr);
    const p = [0, 1, 2].map((i) => x * b.e[i] + y * b.n[i] + z * b.c[i]);
    return [deg(Math.asin(clamp(p[2], -1, 1))), deg(Math.atan2(p[1], p[0]))];
  };
  const local = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const visible = sites.map((s) => ({ s, p: project(s.lat, s.lon) })).filter((x): x is { s: Site; p: [number, number] } => x.p !== null);
  const sunP = sub ? project(sub.sLat, sub.sLon) : null;
  const earthP = sub ? project(sub.eLat, sub.eLon) : null;

  return (
    <div
      className={`map__view map__view--globe${placing ? " is-placing" : ""}`} ref={ref}
      onWheel={(e) => setView((v) => ({ ...v, zoom: clamp(v.zoom * Math.pow(1.0016, -e.deltaY), 1, 6) }))}
      onPointerDown={(e) => {
        // let the zoom buttons receive their own click instead of starting a turn
        if ((e.target as Element).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        cancelAnimationFrame(tween.current);
        drag.current = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 3) d.moved = true;
        if (d.moved) setView((v) => ({ ...v, lon: wrap180(d.lon - deg(dx / R)), lat: clamp(d.lat + deg(dy / R), -90, 90) }));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        // a plain click (no drag) while "Add site" is armed places the site
        if (d && !d.moved && useStore.getState().placing) {
          const ll = latLonAt(...local(e));
          if (ll) {
            addCustom(Math.round(ll[0] * 1000) / 1000, Math.round(ll[1] * 1000) / 1000);
            setPlacing(false);
          }
        }
      }}
    >
      <canvas ref={canvasRef} className="map__canvas" style={{ width: w, height: h }} />
      {w > 0 && (
        <svg className="map__svg" width={w} height={h}>
          <circle cx={w / 2} cy={h / 2} r={R} fill="none" stroke="#ffffff" strokeOpacity={0.14} />
          {sub &&
            ([["Sun overhead", sunP, COLOR.sun, -11], ["Earth overhead", earthP, COLOR.earth, 19]] as const).map(([label, p, color, dy]) =>
              p ? (
                <g key={label} pointerEvents="none">
                  <circle cx={p[0]} cy={p[1]} r={5} fill="none" stroke={color} strokeWidth={1.6} />
                  <circle cx={p[0]} cy={p[1]} r={1.6} fill={color} />
                  <text
                    x={clamp(p[0], 46, w - 46)} y={p[1] + dy} textAnchor="middle" fontFamily={FONT_UI} fontSize={10} fontWeight={600}
                    fill={color} stroke="#000" strokeWidth={3} paintOrder="stroke"
                  >
                    {label}
                  </text>
                </g>
              ) : null,
            )}
          {visible.map(({ s, p }) => (
            <Pin
              key={s.id} x={p[0]} y={p[1]} site={s} verdict={summaries.get(s.id)?.evaluation.overall}
              selected={selected.includes(s.id)} focused={focusId === s.id} hovered={hoverId === s.id} showLabel={focusId === s.id}
              onEnter={() => {
                setHoverSite(s.id);
                setTip({ x: p[0], y: p[1], site: s, verdict: summaries.get(s.id)?.evaluation.overall });
              }}
              onLeave={() => {
                setHoverSite(null);
                setTip(null);
              }}
              onClick={() => focus(s.id)}
            />
          ))}
        </svg>
      )}
      {tip && <SiteTip tip={tip} w={w} h={h} />}
      <PlacingHint />
      <div className="map__tools">
        <div className="iconrow">
          <AddSiteButton />
          <button type="button" className="iconbtn" onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.6, 1, 6) }))} aria-label="Zoom in"><Plus size={14} /></button>
          <button type="button" className="iconbtn" onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.6, 1, 6) }))} aria-label="Zoom out"><Minus size={14} /></button>
          <button type="button" className="iconbtn" onClick={() => setView((v) => ({ ...v, zoom: 1 }))} aria-label="Reset zoom"><RotateCcw size={14} /></button>
        </div>
      </div>
    </div>
  );
}

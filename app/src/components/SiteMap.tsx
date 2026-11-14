// Site picker map.
//   Polar: south-polar stereographic, 0 deg longitude (Earth-facing) up. The base is the LOLA DEM
//          shaded in a WebGL fragment shader that ray-marches towards the Sun at the current time,
//          so real shadows sweep across the craters as the timeline plays.
//   Global: LROC colour mosaic (equirectangular) with the day/night terminator.

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PolarGrid, Site } from "../data/types";
import { R_MOON_KM, clamp, deg, rad } from "../lib/astro";
import { COLOR, FONT_MONO, FONT_UI } from "../lib/theme";
import { useAllSummaries } from "../hooks/useSiteData";
import { useSize } from "../hooks/useApp";
import { allSites, useStore } from "../state/store";
import { Pin, SiteTip, type Tip } from "./MapPin";
import { MoonGlobe } from "./MoonGlobe";

const R_M = R_MOON_KM * 1000;
const POLAR_HALF_M = 2 * R_M * Math.tan(rad(10) / 2); // 80S ring radius, about 304 km

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vPx;
uniform vec2 uRes;
void main() {
  vPx = (aPos * 0.5 + 0.5) * uRes;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp isampler2D;
uniform isampler2D uDem;
uniform float uN;        // grid size, px
uniform float uPix;      // metres per grid px
uniform vec2 uRes;       // canvas px
uniform vec2 uCentre;    // map metres at the canvas centre (x = 90E, y = 0 lon)
uniform float uScale;    // metres per canvas px
uniform vec3 uSun;       // unit vector to the Sun, Moon-fixed (x: lon 0, y: lon 90E, z: north)
uniform float uSunR;     // Sun angular radius, rad
uniform float uLimit;    // map radius of the grid edge, metres
uniform float uMode;     // 0 = live shadows, 1 = relief
in vec2 vPx;
out vec4 outColor;
const float R = 1737400.0;

float demNearest(vec2 m) {
  vec2 p = vec2(m.x / uPix + (uN - 1.0) * 0.5, (uN - 1.0) * 0.5 - m.y / uPix);
  ivec2 i = clamp(ivec2(floor(p + 0.5)), ivec2(0), ivec2(int(uN) - 1));
  return float(texelFetch(uDem, i, 0).r) * 0.5;
}

float dem(vec2 m) {
  vec2 p = vec2(m.x / uPix + (uN - 1.0) * 0.5, (uN - 1.0) * 0.5 - m.y / uPix);
  vec2 f = fract(p);
  ivec2 i = clamp(ivec2(floor(p)), ivec2(0), ivec2(int(uN) - 2));
  float a = float(texelFetch(uDem, i, 0).r);
  float b = float(texelFetch(uDem, i + ivec2(1, 0), 0).r);
  float c = float(texelFetch(uDem, i + ivec2(0, 1), 0).r);
  float d = float(texelFetch(uDem, i + ivec2(1, 1), 0).r);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * 0.5;
}

void main() {
  vec2 m = uCentre + (vPx - uRes * 0.5) * uScale;
  float r = length(m);
  if (r > uLimit) { outColor = vec4(0.0); return; }

  float lat = -1.5707963 + 2.0 * atan(r / (2.0 * R));
  float lon = atan(m.x, m.y);
  vec3 n = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));
  float sinEl = dot(n, uSun);
  float cosEl = sqrt(max(1e-6, 1.0 - sinEl * sinEl));
  float tanEl = sinEl / cosEl;
  // local horizontal direction to the Sun, expressed on the map plane
  vec2 dir = normalize(dot(uSun, north) * vec2(sin(lon), cos(lon)) + dot(uSun, east) * vec2(cos(lon), -sin(lon)));

  float h0 = dem(m);
  float e = uPix;
  float dzdx = (dem(m + vec2(e, 0.0)) - dem(m - vec2(e, 0.0))) / (2.0 * e);
  float dzdy = (dem(m + vec2(0.0, e)) - dem(m - vec2(0.0, e))) / (2.0 * e);
  vec3 nl = normalize(vec3(-dzdx, -dzdy, 1.0));

  // fixed illustrative light so relief stays readable in permanent shadow
  float relief = clamp(dot(normalize(vec3(-dzdx * 2.2, -dzdy * 2.2, 1.0)), normalize(vec3(-0.5, 0.6, 0.62))), 0.0, 1.0);

  if (uMode > 0.5) {
    float t = clamp((h0 + 5000.0) / 12500.0, 0.0, 1.0);
    vec3 lowC = vec3(0.09, 0.16, 0.34), midC = vec3(0.30, 0.38, 0.46), highC = vec3(0.86, 0.82, 0.72);
    vec3 col = t < 0.5 ? mix(lowC, midC, t * 2.0) : mix(midC, highC, t * 2.0 - 1.0);
    outColor = vec4(col * (0.35 + 0.85 * relief), 1.0);
    return;
  }

  // march towards the Sun; the ray gains t*tan(el) and the sphere falls away by t^2 / 2R
  float minClear = 1.0;
  float t = 0.0;
  float stepLen = uPix * 0.8;
  for (int i = 0; i < 72; i++) {
    t += stepLen;
    stepLen *= 1.062;
    vec2 p = m + dir * t;
    if (length(p) > uLimit) break;
    float clearAng = (h0 + 2.0 + t * tanEl + t * t / (2.0 * R) - demNearest(p)) / t;
    minClear = min(minClear, clearAng);
  }
  float lit = smoothstep(-uSunR, uSunR, minClear);

  float lambert = max(0.0, dot(nl, vec3(dir * cosEl, sinEl)));
  float sun = lit * clamp(0.16 + 3.4 * lambert, 0.0, 1.0);
  vec3 shade = vec3(0.045, 0.062, 0.105) * (0.45 + 1.3 * relief);
  vec3 col = shade + vec3(1.0, 0.94, 0.82) * sun * 0.92;
  outColor = vec4(col, 1.0);
}`;

interface GlState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function initGl(canvas: HTMLCanvasElement, grid: PolarGrid): GlState | null {
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  try {
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, grid.n, grid.n, 0, gl.RED_INTEGER, gl.SHORT, grid.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u: GlState["u"] = {};
    for (const name of ["uDem", "uN", "uPix", "uRes", "uCentre", "uScale", "uSun", "uSunR", "uLimit", "uMode"]) {
      u[name] = gl.getUniformLocation(prog, name);
    }
    gl.uniform1i(u.uDem, 0);
    gl.uniform1f(u.uN, grid.n);
    gl.uniform1f(u.uPix, grid.pixelM);
    gl.uniform1f(u.uLimit, ((grid.n - 1) / 2) * grid.pixelM);
    return { gl, prog, u };
  } catch (err) {
    console.warn("Shadow map shader unavailable:", err);
    return null;
  }
}

const mapXY = (lat: number, lon: number): [number, number] => {
  const r = 2 * R_M * Math.tan(rad(90 + lat) / 2);
  return [r * Math.sin(rad(lon)), r * Math.cos(rad(lon))];
};

export function SiteMap() {
  const [ref, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GlState | null>(null);
  const ds = useStore((s) => s.dataset);
  const customSites = useStore((s) => s.customSites);
  const region = useStore((s) => s.mapRegion);
  const setRegion = useStore((s) => s.setMapRegion);
  const selected = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const hoverId = useStore((s) => s.hoverSiteId);
  const setHoverSite = useStore((s) => s.setHoverSite);
  const focus = useStore((s) => s.focus);
  const addCustom = useStore((s) => s.addCustomSite);
  const tMs = useStore((s) => s.tMs);
  const summaries = useAllSummaries();

  const [grid, setGrid] = useState<PolarGrid | null>(null);
  const [gridState, setGridState] = useState<"loading" | "ready" | "none">("loading");
  const [mode, setMode] = useState<"shadows" | "relief">("shadows");
  const [view, setView] = useState({ cx: 0, cy: 0, half: POLAR_HALF_M * 1.04 });
  const [tip, setTip] = useState<Tip | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  const sites = useMemo(() => allSites({ dataset: ds, customSites }), [ds, customSites]);
  const sub = ds?.subpoints(tMs).sp;

  useEffect(() => {
    let live = true;
    if (!ds) return;
    ds.polarGrid().then((g) => {
      if (!live) return;
      setGrid(g);
      setGridState(g ? "ready" : "none");
    });
    return () => {
      live = false;
    };
  }, [ds]);

  const w = size.w, h = size.h;
  const scale = (2 * view.half) / Math.max(1, Math.min(w, h)); // metres per css px
  const sx = (mx: number) => w / 2 + (mx - view.cx) / scale;
  const sy = (my: number) => h / 2 - (my - view.cy) / scale;

  // --- polar shadow map -----------------------------------------------------------------------
  useEffect(() => {
    if (region !== "polar" || !grid || !canvasRef.current || w === 0) return;
    if (!glRef.current || glRef.current.gl.canvas !== canvasRef.current) glRef.current = initGl(canvasRef.current, grid);
    const st = glRef.current;
    if (!st || !sub) return;
    const { gl, u } = st;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (gl.canvas.width !== cw || gl.canvas.height !== ch) {
      gl.canvas.width = cw;
      gl.canvas.height = ch;
    }
    gl.viewport(0, 0, cw, ch);
    gl.uniform2f(u.uRes, cw, ch);
    gl.uniform2f(u.uCentre, view.cx, view.cy);
    gl.uniform1f(u.uScale, scale / dpr);
    const la = rad(sub.sLat), lo = rad(sub.sLon);
    gl.uniform3f(u.uSun, Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
    gl.uniform1f(u.uSunR, Math.asin(695700 / sub.sunKm));
    gl.uniform1f(u.uMode, mode === "relief" ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [region, grid, w, h, view, scale, sub, mode]);

  // --- interaction ----------------------------------------------------------------------------
  const zoom = (factor: number, px = w / 2, py = h / 2) => {
    setView((v) => {
      const half = clamp(v.half * factor, 6000, POLAR_HALF_M * 1.04);
      const s0 = (2 * v.half) / Math.min(w, h), s1 = (2 * half) / Math.min(w, h);
      const mx = v.cx + (px - w / 2) * s0, my = v.cy - (py - h / 2) * s0;
      const lim = POLAR_HALF_M;
      return { half, cx: clamp(mx - (px - w / 2) * s1, -lim, lim), cy: clamp(my + (py - h / 2) * s1, -lim, lim) };
    });
  };
  const fit = () => setView({ cx: 0, cy: 0, half: POLAR_HALF_M * 1.04 });
  const local = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const latLonAt = (px: number, py: number): [number, number] | null => {
    const mx = view.cx + (px - w / 2) * scale, my = view.cy - (py - h / 2) * scale;
    const r = Math.hypot(mx, my);
    if (r > POLAR_HALF_M) return null;
    return [-90 + deg(2 * Math.atan(r / (2 * R_M))), deg(Math.atan2(mx, my))];
  };

  const pinPos = (s: Site): [number, number] | null => {
    if (s.lat > -79.9) return null;
    const [mx, my] = mapXY(s.lat, s.lon);
    const x = sx(mx), y = sy(my);
    return x < -10 || x > w + 10 || y < -10 || y > h + 10 ? null : [x, y];
  };

  const hidden = region === "polar" ? sites.filter((s) => s.lat > -79.9).length : 0;
  const rings = [-80, -82, -84, -86, -88];
  const spokes = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30];
  // body direction markers sit on the edge of the frame, pointing towards the sub-point longitude
  const edge = (lonDeg: number, inset: number): [number, number] => {
    const dx = Math.sin(rad(lonDeg)), dy = -Math.cos(rad(lonDeg));
    const k = Math.min((w / 2 - inset) / Math.max(1e-6, Math.abs(dx)), (h / 2 - inset) / Math.max(1e-6, Math.abs(dy)));
    return [w / 2 + dx * k, h / 2 + dy * k];
  };

  return (
    <section className="panel map" aria-label="Site map">
      <header className="panel__head">
        <h2>Sites</h2>
        <div className="seg" role="group" aria-label="Map region">
          <button type="button" className={region === "polar" ? "is-on" : ""} aria-pressed={region === "polar"} onClick={() => setRegion("polar")}>
            South pole
          </button>
          <button type="button" className={region === "global" ? "is-on" : ""} aria-pressed={region === "global"} onClick={() => setRegion("global")} title={hidden ? `${hidden} more sites lie north of 80°S` : undefined}>
            Whole Moon
          </button>
        </div>
      </header>
      {region === "global" ? <MoonGlobe /> : null}
      <div
        className="map__view map__view--polar" ref={ref} hidden={region !== "polar"}
        onWheel={(e) => region === "polar" && zoom(Math.pow(1.0018, e.deltaY), ...local(e))}
        onPointerDown={(e) => {
          if (region !== "polar") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 3) d.moved = true;
          if (d.moved) {
            const lim = POLAR_HALF_M;
            setView((v) => ({ ...v, cx: clamp(d.cx - dx * scale, -lim, lim), cy: clamp(d.cy + dy * scale, -lim, lim) }));
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={(e) => {
          const ll = latLonAt(...local(e));
          if (ll) addCustom(Math.round(ll[0] * 1000) / 1000, Math.round(ll[1] * 1000) / 1000);
        }}
      >
        {region === "polar" && <canvas ref={canvasRef} className="map__canvas" style={{ width: w, height: h }} />}
        {w > 0 && (
          <svg className="map__svg" width={w} height={h}>
            {region === "polar" && (
              <g>
                {rings.map((lat) => {
                  const r = (2 * R_M * Math.tan(rad(90 + lat) / 2)) / scale;
                  return (
                    <g key={lat}>
                      <circle cx={sx(0)} cy={sy(0)} r={r} fill="none" stroke="#ffffff" strokeOpacity={lat === -80 ? 0.3 : 0.12} />
                      <text x={sx(0) + 3} y={sy(0) - r - 3} fontFamily={FONT_MONO} fontSize={9.5} fill={COLOR.text2} fillOpacity={0.85}>
                        {-lat}°S
                      </text>
                    </g>
                  );
                })}
                {spokes.map((lon) => {
                  const [ex, ey] = [POLAR_HALF_M * Math.sin(rad(lon)), POLAR_HALF_M * Math.cos(rad(lon))];
                  return <line key={lon} x1={sx(0)} y1={sy(0)} x2={sx(ex)} y2={sy(ey)} stroke="#ffffff" strokeOpacity={lon % 90 === 0 ? 0.14 : 0.06} />;
                })}
                {gridState !== "ready" && (
                  <text x={w / 2} y={h * 0.5 + 44} textAnchor="middle" fontFamily={FONT_UI} fontSize={11} fill={COLOR.text2}>
                    {gridState === "loading" ? "Loading LOLA terrain…" : "Terrain map unavailable in mock mode"}
                  </text>
                )}
              </g>
            )}
            {sites.map((s) => {
              const p = pinPos(s);
              if (!p) return null;
              return (
                <Pin
                  key={s.id} x={p[0]} y={p[1]} site={s} verdict={summaries.get(s.id)?.evaluation.overall}
                  selected={selected.includes(s.id)} focused={focusId === s.id} hovered={hoverId === s.id}
                  showLabel={focusId === s.id}
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
              );
            })}
            {region === "polar" && sub && (
              <g pointerEvents="none">
                {([["Sun", sub.sLon, COLOR.sun], ["Earth", sub.eLon, COLOR.earth]] as const).map(([label, lon, color]) => {
                  // Sun on the frame edge, Earth one step in, so they stay apart at full and new Moon
                  const [x, y] = edge(lon, label === "Sun" ? 14 : 38);
                  const left = x > w / 2;
                  return (
                    <g key={label}>
                      <circle cx={x} cy={y} r={5.5} fill={color} stroke="#070b14" strokeWidth={2} />
                      <text
                        x={left ? x - 10 : x + 10} y={y + 3.5} textAnchor={left ? "end" : "start"} fontFamily={FONT_UI} fontSize={10.5} fontWeight={650}
                        fill={color} stroke="#070b14" strokeWidth={3} paintOrder="stroke"
                      >
                        to {label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        )}
        {tip && <SiteTip tip={tip} w={w} h={h} />}
        {region === "polar" && (
          <div className="map__tools">
            <div className="seg seg--small" role="group" aria-label="Map shading">
              <button type="button" className={mode === "shadows" ? "is-on" : ""} aria-pressed={mode === "shadows"} onClick={() => setMode("shadows")}>
                Live shadows
              </button>
              <button type="button" className={mode === "relief" ? "is-on" : ""} aria-pressed={mode === "relief"} onClick={() => setMode("relief")}>
                Elevation
              </button>
            </div>
            <div className="iconrow">
              <button type="button" className="iconbtn" onClick={() => zoom(1 / 1.7)} aria-label="Zoom in"><Plus size={14} /></button>
              <button type="button" className="iconbtn" onClick={() => zoom(1.7)} aria-label="Zoom out"><Minus size={14} /></button>
              <button type="button" className="iconbtn" onClick={fit} aria-label="Fit the whole polar cap"><RotateCcw size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

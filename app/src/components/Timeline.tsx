// Transport controls and timeline strips. One shared time axis for every selected site:
// Sun, Earth and Both strips, a power sparkline, and a cursor you can drag.

import { Download, Earth as EarthIcon, Pause, Play, Plus, SkipBack, Sun as SunIcon, CircleCheck, X } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { clamp } from "../lib/astro";
import { VERDICT_COLOR, COLOR, FONT_MONO } from "../lib/theme";
import { DAY, HOUR, fmtDateTime, fmtDayMonth, fmtDuration, fmtElapsed, isoDate, monthName } from "../lib/time";
import type { TimeWindow } from "../lib/visibility";
import type { SiteData } from "../hooks/useSiteData";
import { useSelectedData } from "../hooks/useSiteData";
import { useSize } from "../hooks/useApp";
import { TRACK_AXIS_H, TRACK_ROW_H } from "../hooks/useSiteDrag";
import { MAX_SELECTED, SPEEDS, useSay, useStore } from "../state/store";

const LABEL_W = 168;
const ROW_H = TRACK_ROW_H;
const AXIS_H = TRACK_AXIS_H;

function TransportBar() {
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const tMs = useStore((s) => s.tMs);
  const startMs = useStore((s) => s.startMs);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setSpeed);
  const setTime = useStore((s) => s.setTime);
  return (
    <div className="transport">
      <div className="iconrow">
        <button type="button" className="iconbtn" onClick={() => setTime(startMs)} aria-label="Back to landing" title="Back to landing (Home)">
          <SkipBack size={15} />
        </button>
        <button type="button" className="playbtn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
      <label className="field field--inline x-expert">
        <span>Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s < 24 ? `${s} h per second` : `${s / 24} d per second`}
            </option>
          ))}
        </select>
      </label>
      <div className="clock">
        <span className="clock__utc num">{fmtDateTime(tMs)}</span>
        <span className="clock__met num x-expert">{fmtElapsed(tMs - startMs)}</span>
      </div>
    </div>
  );
}

function bars(ws: TimeWindow[], x: (t: number) => number, y: number, h: number, fill: string, key: string) {
  return ws.map((w, i) => {
    const x0 = x(w.startMs), x1 = x(w.endMs);
    return <rect key={`${key}${i}`} x={x0} y={y} width={Math.max(0.8, x1 - x0)} height={h} fill={fill} rx={1} />;
  });
}

const SiteRow = memo(function SiteRow({
  d, y, w, t0, t1, focused,
}: { d: SiteData; y: number; w: number; t0: number; t1: number; focused: boolean }) {
  const x = (t: number) => LABEL_W + ((t - t0) / (t1 - t0)) * (w - LABEL_W - 8);
  const { geom, flags, i0, i1, metrics } = d;
  const spark = useMemo(() => {
    const max = Math.max(1, ...Array.from(flags.powerW.subarray(i0, i1 + 1)));
    const stride = Math.max(1, Math.floor((i1 - i0) / 600));
    let p = `M${x(geom.startMs + i0 * geom.stepMs).toFixed(1)},${y + 42}`;
    for (let i = i0; i <= i1; i += stride) {
      p += `L${x(geom.startMs + i * geom.stepMs).toFixed(1)},${(y + 42 - (flags.powerW[i] / max) * 6).toFixed(1)}`;
    }
    return `${p}L${x(geom.startMs + i1 * geom.stepMs).toFixed(1)},${y + 42}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom, flags, i0, i1, w, t0, t1, y]);
  const track = (yy: number) => <rect x={LABEL_W} y={yy} width={w - LABEL_W - 8} height={8} fill={COLOR.dark} fillOpacity={0.45} rx={1} />;
  return (
    <g opacity={focused ? 1 : 0.82}>
      {track(y + 4)}
      {track(y + 14)}
      {track(y + 24)}
      {bars(metrics.sunWindows, x, y + 4, 8, COLOR.sun, "s")}
      {bars(metrics.earthWindows, x, y + 14, 8, COLOR.earth, "e")}
      {bars(metrics.bothWindows, x, y + 24, 8, COLOR.both, "b")}
      <path d={spark} fill={COLOR.sun} fillOpacity={0.28} />
    </g>
  );
});

interface Tip {
  x: number;
  y: number;
  site: string;
  tMs: number;
  lines: string[];
}

function exportCsv(rows: SiteData[]) {
  const out = ["site,window,start_utc,end_utc,hours"];
  for (const d of rows) {
    const add = (kind: string, ws: TimeWindow[]) =>
      ws.forEach((w) =>
        out.push(
          [JSON.stringify(d.site.name), kind, new Date(w.startMs).toISOString(), new Date(w.endMs).toISOString(), ((w.endMs - w.startMs) / HOUR).toFixed(2)].join(","),
        ),
      );
    add("sun", d.metrics.sunWindows);
    add("earth", d.metrics.earthWindows);
    add("power_and_comms", d.metrics.bothWindows);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([out.join("\n")], { type: "text/csv" }));
  a.download = `windows_${isoDate(rows[0].geom.startMs + rows[0].i0 * rows[0].geom.stepMs)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Timeline() {
  const rowsAll = useSelectedData();
  const rows = rowsAll.filter((r): r is SiteData => r !== null);
  const [ref, size] = useSize<HTMLDivElement>();
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const tMs = useStore((s) => s.tMs);
  const focusId = useStore((s) => s.focusId);
  const setTime = useStore((s) => s.setTime);
  const focus = useStore((s) => s.focus);
  const showToast = useStore((s) => s.showToast);
  const toggle = useStore((s) => s.toggleSelect);
  const trackCount = useStore((s) => s.selectedIds.length);
  // what a site being dragged from the bin would do if dropped here
  const dropKind = useStore((s) => s.drag?.action?.kind ?? null);
  const dropTarget = useStore((s) => s.drag?.action?.targetId ?? null);
  const dragActive = useStore((s) => s.drag !== null);
  const [tip, setTip] = useState<Tip | null>(null);
  const say = useSay();
  const dragging = useRef(false);
  const hasSlot = trackCount < MAX_SELECTED;

  const t0 = startMs, t1 = startMs + days * DAY;
  const w = size.w;
  const plotW = Math.max(10, w - LABEL_W - 8);
  const x = (t: number) => LABEL_W + ((t - t0) / (t1 - t0)) * plotW;
  const tAt = (px: number) => t0 + clamp((px - LABEL_W) / plotW, 0, 1) * (t1 - t0);
  const height = AXIS_H + (rows.length + (hasSlot ? 1 : 0)) * ROW_H + 4;

  const ticks = useMemo(() => {
    // keep labels at least ~54 px apart whatever the panel width
    const fit = Math.max(1, Math.ceil((54 * days) / plotW));
    const every = [1, 2, 3, 7, 14, 30].find((n) => n >= fit) ?? 30;
    const out: { t: number; label: string; month: boolean }[] = [];
    for (let d = 0; d < days; d += every) {
      const t = t0 + d * DAY;
      const first = new Date(t).getUTCDate() === 1;
      out.push({ t, label: days > 31 ? (first ? monthName(t) : String(new Date(t).getUTCDate())) : fmtDayMonth(t), month: first });
    }
    return out;
  }, [t0, days, plotW]);

  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const onMove = (e: React.PointerEvent) => {
    const [mx, my] = local(e);
    // a site is being dragged over the timeline: no scrubbing, no hover card
    if (useStore.getState().drag) {
      setTip(null);
      return;
    }
    if (dragging.current) setTime(tAt(mx));
    const row = Math.floor((my - AXIS_H) / ROW_H);
    const d = rows[row];
    if (mx < LABEL_W || !d) {
      setTip(null);
      return;
    }
    const t = tAt(mx);
    const within = (ws: TimeWindow[]) => ws.find((wd) => t >= wd.startMs && t < wd.endMs);
    const describe = (label: string, ws: TimeWindow[], off: string) => {
      const hit = within(ws);
      return hit ? `${label} for ${fmtDuration((hit.endMs - hit.startMs) / HOUR)}, until ${fmtDayMonth(hit.endMs)}` : off;
    };
    setTip({
      x: mx, y: AXIS_H + row * ROW_H, site: d.site.name, tMs: t,
      lines: [
        describe("Sunlit", d.metrics.sunWindows, "Dark"),
        describe("Earth in view", d.metrics.earthWindows, "No direct link"),
        describe(say("Power + comms"), d.metrics.bothWindows, `No ${say("power + comms")} window`),
      ],
    });
  };

  const cx = x(tMs);

  return (
    <section className="panel timeline" aria-label="Timeline">
      <header className="panel__head">
        <h2>Timeline</h2>
        <span className="panel__sub num">
          {fmtDayMonth(t0)} to {fmtDayMonth(t1)} {new Date(t1).getUTCFullYear()}
        </span>
        <div className="legend">
          <span><SunIcon size={12} color={COLOR.sun} /> Sun</span>
          <span><EarthIcon size={12} color={COLOR.earth} /> Earth</span>
          <span><CircleCheck size={12} color={COLOR.both} /> {say("Both")}</span>
          <span><i className="legend__power" /> {say("Output")}</span>
        </div>
        <TransportBar />
        <button
          type="button" className="iconbtn" aria-label="Download windows as CSV" title="Download windows as CSV"
          onClick={() => {
            if (rows.length) {
              exportCsv(rows);
              showToast("Windows saved as CSV");
            }
          }}
        >
          <Download size={15} />
        </button>
      </header>
      <div className={`timeline__body${dragActive ? " is-droppable" : ""}`} ref={ref} data-drop="timeline">
        {w > 0 && (
          <svg
            width={w} height={height} className="timeline__svg"
            onPointerDown={(e) => {
              const [mx] = local(e);
              if (mx < LABEL_W) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = true;
              setTime(tAt(mx));
            }}
            onPointerMove={onMove}
            onPointerUp={() => (dragging.current = false)}
            onPointerLeave={() => setTip(null)}
          >
            {ticks.map((tk) => (
              <g key={tk.t}>
                <line x1={x(tk.t)} x2={x(tk.t)} y1={AXIS_H - 4} y2={height} stroke="#ffffff" strokeOpacity={tk.month ? 0.16 : 0.06} />
                <text x={x(tk.t) + 3} y={11} fontFamily={FONT_MONO} fontSize={10} fill={tk.month ? COLOR.text : COLOR.text3}>
                  {tk.label}
                </text>
              </g>
            ))}
            {rows.map((d, r) => (
              <SiteRow key={d.site.id} d={d} y={AXIS_H + r * ROW_H} w={w} t0={t0} t1={t1} focused={d.site.id === focusId} />
            ))}
            <g pointerEvents="none">
              <line x1={cx} x2={cx} y1={AXIS_H - 6} y2={height} stroke={COLOR.text} strokeWidth={1.2} />
              <path d={`M${cx - 5},${AXIS_H - 12}h10l-5,7z`} fill={COLOR.text} />
            </g>
          </svg>
        )}
        <div className="timeline__labels" style={{ top: AXIS_H }}>
          {rows.map((d) => (
            <div key={d.site.id} className={`tl-track${d.site.id === focusId ? " is-focus" : ""}`} style={{ height: ROW_H }}>
              <button type="button" className="tl-label" onClick={() => focus(d.site.id)} title={`Show ${d.site.name} in the main view`}>
                <span className="tl-label__name">
                  <i style={{ background: VERDICT_COLOR[d.evaluation.overall] }} />
                  {d.site.name}
                </span>
                <span className="tl-label__sub num">{Math.round(d.metrics.bothPct)}% {say("power + comms")}</span>
              </button>
              {rows.length > 1 && (
                <button type="button" className="tl-remove" onClick={() => toggle(d.site.id)} aria-label={`Remove the ${d.site.name} track`} title="Remove track">
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {rows.map((d, r) =>
          dropKind === "replace" && dropTarget === d.site.id ? (
            <div key={d.site.id} className="tl-drop tl-drop--replace" style={{ top: AXIS_H + r * ROW_H, height: ROW_H - 4 }}>
              Replace {d.site.name}
            </div>
          ) : null,
        )}
        {hasSlot && (
          <div
            className={`tl-slot${dropKind === "add" ? " is-target" : ""}`}
            style={{ top: AXIS_H + rows.length * ROW_H + 2, height: ROW_H - 8 }}
          >
            <Plus size={13} /> {dropKind === "add" ? "Drop to add this site as a track" : "Drag a site here from the list or the map to compare it"}
          </div>
        )}
        {tip && (
          <div className="tip" style={{ left: clamp(tip.x + 12, LABEL_W, w - 250), top: Math.max(0, tip.y - 78) }}>
            <strong>{tip.site}</strong>
            <span className="num">{fmtDateTime(tip.tMs)}</span>
            {tip.lines.map((l) => (
              <span key={l} className="tip__dim">{l}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

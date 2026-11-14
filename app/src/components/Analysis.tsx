// The "what if" panel: schedule slip for the focused site, best landing dates for the selected
// sites, and the science-vs-operations trade across every site.

import { useMemo, useState } from "react";
import { clamp } from "../lib/astro";
import { bestWindows, slipAnalysis, worst, type SlipPoint, type Verdict } from "../lib/scenario";
import { COLOR, FONT_MONO, FONT_UI, VERDICT_COLOR } from "../lib/theme";
import { fmtDate, fmtDayMonth } from "../lib/time";
import { cachedFlags, useAllSummaries, useSiteData, yearGeometry, type SiteData } from "../hooks/useSiteData";
import { useSize } from "../hooks/useApp";
import { SLIP_AFTER_DAYS, SLIP_BEFORE_DAYS, findSite, useSay, useStore, type AnalysisTab } from "../state/store";
import { VerdictChip, VerdictIcon } from "./Scorecards";

/** Verdict mark that does not rely on colour: circle, triangle, cross. */
function Mark({ v, x, y, s = 4 }: { v: Verdict; x: number; y: number; s?: number }) {
  const c = VERDICT_COLOR[v];
  if (v === "GO") return <circle cx={x} cy={y} r={s * 0.8} fill={c} />;
  if (v === "MARGINAL") return <path d={`M${x},${y - s}L${x + s},${y + s * 0.8}L${x - s},${y + s * 0.8}Z`} fill={c} />;
  return <path d={`M${x - s * 0.8},${y - s * 0.8}L${x + s * 0.8},${y + s * 0.8}M${x + s * 0.8},${y - s * 0.8}L${x - s * 0.8},${y + s * 0.8}`} stroke={c} strokeWidth={1.8} strokeLinecap="round" />;
}

// ---------------------------------------------------------------------------------------------
// Schedule slip
// ---------------------------------------------------------------------------------------------

function SlipChart({ data }: { data: SiteData }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const c = useStore((s) => s.constraints);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const setStart = useStore((s) => s.setStart);
  const showToast = useStore((s) => s.showToast);
  const say = useSay();
  const [hover, setHover] = useState<number | null>(null);

  const pts = useMemo(
    () => slipAnalysis(data.geom, data.flags, c, startMs, days, -SLIP_BEFORE_DAYS, SLIP_AFTER_DAYS),
    [data.geom, data.flags, c, startMs, days],
  );

  const ML = 30, MR = 34, MT = 22, MB = 34;
  const w = size.w, h = size.h;
  const pw = Math.max(10, w - ML - MR), ph = Math.max(10, h - MT - MB);
  const band = pw / pts.length;
  const yMax = Math.max(6, Math.ceil(Math.max(...pts.map((p) => p.bothHoursPerDay), c.minBothHoursPerDay) / 6) * 6);
  const darkMax = Math.max(c.maxDarkH * 1.4, ...pts.map((p) => p.longestDarkH), 24);
  const y = (v: number) => MT + ph - (v / yMax) * ph;
  const yd = (v: number) => MT + ph - (v / darkMax) * ph;
  const xc = (i: number) => ML + (i + 0.5) * band;
  const darkLine = pts.map((p, i) => `${i ? "L" : "M"}${xc(i).toFixed(1)},${yd(p.longestDarkH).toFixed(1)}`).join("");
  const hp = hover !== null ? pts[hover] : null;

  return (
    <div className="chart" ref={ref}>
      {w > 0 && (
        <svg
          width={w} height={h} role="img"
          aria-label={`Schedule slip for ${data.site.name}: power and comms hours per day for landing dates from ${SLIP_BEFORE_DAYS} days early to ${SLIP_AFTER_DAYS} days late.`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.floor((e.clientX - r.left - ML) / band);
            setHover(i >= 0 && i < pts.length ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (hp && hp.offsetDays !== 0) {
              setStart(hp.startMs);
              showToast(`Landing moved to ${fmtDate(hp.startMs)}`);
            }
          }}
        >
          {[0, yMax / 2, yMax].map((v) => (
            <g key={v}>
              <line x1={ML} x2={w - MR} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={0.06} />
              <text x={ML - 6} y={y(v) + 3.5} textAnchor="end" fontFamily={FONT_MONO} fontSize={10} fill={COLOR.text3}>{v}</text>
            </g>
          ))}
          <text x={ML} y={11} fontFamily={FONT_UI} fontSize={10.5} fill={COLOR.text2}>{say("Bars: power + comms, h/day")}</text>
          <text x={w - MR} y={11} textAnchor="end" fontFamily={FONT_UI} fontSize={10.5} fill={COLOR.text2}>Line: longest darkness, h</text>
          {[0, Math.round(darkMax / 2), Math.round(darkMax)].map((v) => (
            <text key={v} x={w - MR + 6} y={yd(v) + 3.5} fontFamily={FONT_MONO} fontSize={10} fill={COLOR.text3}>{v}</text>
          ))}

          {/* operations minimum */}
          <line x1={ML} x2={w - MR} y1={y(c.minBothHoursPerDay)} y2={y(c.minBothHoursPerDay)} stroke={COLOR.both} strokeOpacity={0.5} strokeDasharray="2 4" />

          {pts.map((p, i) => {
            const top = y(p.bothHoursPerDay);
            const current = p.offsetDays === 0;
            return (
              <g key={p.offsetDays} opacity={p.complete ? 1 : 0.35}>
                {(hover === i || current) && <rect x={ML + i * band} y={MT} width={band} height={ph + 16} fill="#fff" fillOpacity={current ? 0.07 : 0.05} />}
                <rect
                  className="chart__bar" x={ML + i * band + band * 0.14} width={band * 0.72}
                  style={{ y: top, height: Math.max(1, MT + ph - top) }}
                  fill={VERDICT_COLOR[p.verdict]} fillOpacity={hover === i || current ? 1 : 0.72} rx={1.5}
                />
                <Mark v={p.verdict} x={xc(i)} y={MT + ph + 9} s={Math.min(3.6, band * 0.3)} />
              </g>
            );
          })}

          {/* battery limit and longest darkness */}
          <line x1={ML} x2={w - MR} y1={yd(c.maxDarkH)} y2={yd(c.maxDarkH)} stroke={COLOR.nogo} strokeOpacity={0.55} strokeDasharray="6 4" />
          <text x={ML + 4} y={yd(c.maxDarkH) - 4} fontFamily={FONT_UI} fontSize={10} fontWeight={600} fill={COLOR.nogo} stroke={COLOR.panel} strokeWidth={3} paintOrder="stroke">battery limit</text>
          <path d={darkLine} fill="none" stroke={COLOR.text} strokeOpacity={0.85} strokeWidth={1.3} strokeLinejoin="round" />

          {pts.map((p, i) =>
            p.offsetDays % 5 === 0 ? (
              <text
                key={p.offsetDays} x={xc(i)} y={h - 6} textAnchor="middle" fontFamily={FONT_MONO} fontSize={10}
                fill={p.offsetDays === 0 ? COLOR.text : COLOR.text3} fontWeight={p.offsetDays === 0 ? 600 : 400}
              >
                {p.offsetDays === 0 ? "plan" : `${p.offsetDays > 0 ? "+" : "−"}${Math.abs(p.offsetDays)}d`}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hp && hover !== null && (
        <div className="tip" style={{ left: clamp(xc(hover) + 10, 4, w - 232), top: 4 }}>
          <strong>
            {hp.offsetDays === 0 ? "Current plan" : `${Math.abs(hp.offsetDays)} d ${hp.offsetDays > 0 ? "later" : "earlier"}`} · <span className="num">{fmtDate(hp.startMs)}</span>
          </strong>
          <span><VerdictChip v={hp.verdict} /></span>
          <span className="num">{hp.bothHoursPerDay.toFixed(1)} h/day {say("power + comms")} · {Math.round(hp.longestDarkH)} h dark</span>
          <span className="tip__dim">{hp.driver.reason}</span>
          {hp.offsetDays !== 0 && <span className="tip__dim">Click to land on this date</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Best landing dates
// ---------------------------------------------------------------------------------------------

const SEARCH_DAYS = 300;

function BestDates() {
  const ds = useStore((s) => s.dataset);
  const ids = useStore((s) => s.selectedIds);
  const customSites = useStore((s) => s.customSites);
  const c = useStore((s) => s.constraints);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const hv = useStore((s) => s.horizonVersion);
  const setStart = useStore((s) => s.setStart);
  const showToast = useStore((s) => s.showToast);

  const result = useMemo(() => {
    if (!ds) return null;
    const per: { name: string; id: string; pts: SlipPoint[] }[] = [];
    for (const id of ids) {
      const site = findSite({ dataset: ds, customSites }, id);
      const g = site && yearGeometry(ds, site, startMs, days, SEARCH_DAYS);
      if (!site || !g) continue;
      const f = cachedFlags(g, c);
      per.push({ id, name: site.name, pts: slipAnalysis(g, f, c, startMs, days, 0, SEARCH_DAYS) });
    }
    if (!per.length) return null;
    // a date only works for the team if it works for every selected site
    const joint: SlipPoint[] = per[0].pts.map((p, i) => {
      let v: Verdict = "GO";
      let limiting = p;
      for (const s of per) {
        v = worst(v, s.pts[i].verdict);
        if (s.pts[i].bothHours < limiting.bothHours) limiting = s.pts[i];
      }
      return { ...limiting, verdict: v, complete: per.every((s) => s.pts[i].complete) };
    });
    return { per: per.map((s) => ({ ...s, best: bestWindows(s.pts, 4) })), joint: bestWindows(joint, 4) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, ids, customSites, c, startMs, days, hv]);

  if (!result) return <p className="panel__note">Select a site to search for landing dates.</p>;

  const row = (label: string, pts: SlipPoint[], key: string) => (
    <div className="dates__row" key={key}>
      <span className="dates__site">{label}</span>
      <div className="dates__chips">
        {pts.map((p) => (
          <button
            key={p.startMs} type="button" className="datechip"
            onClick={() => {
              setStart(p.startMs);
              showToast(`Landing moved to ${fmtDate(p.startMs)}`);
            }}
            title={p.driver.reason}
          >
            <VerdictIcon v={p.verdict} size={12} />
            <span className="num">{fmtDayMonth(p.startMs)}</span>
            <span className="datechip__sub num">{p.bothHoursPerDay.toFixed(1)} h/d</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="dates">
      <p className="dates__lead">
        {days}-day mission, next {SEARCH_DAYS} days from {fmtDate(startMs)}. Click a date to re-plan.
      </p>
      {result.per.length > 1 && row("All selected sites", result.joint, "joint")}
      {result.per.map((s) => row(s.name, s.best, s.id))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Science vs operations
// ---------------------------------------------------------------------------------------------

function TradeScatter() {
  const [ref, size] = useSize<HTMLDivElement>();
  const summaries = useAllSummaries();
  const selected = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const focus = useStore((s) => s.focus);
  const [hover, setHover] = useState<string | null>(null);
  const say = useSay();

  const ML = 30, MR = 12, MT = 20, MB = 30;
  const w = size.w, h = size.h;
  const pw = Math.max(10, w - ML - MR), ph = Math.max(10, h - MT - MB);
  const pts = useMemo(() => {
    const list = [...summaries.values()].filter((s) => s.site.science);
    const seen = new Map<number, number>();
    return list.map((s) => {
      const score = s.site.science!.score;
      const k = seen.get(score) ?? 0;
      seen.set(score, k + 1);
      // spread sites that share a science score so they do not stack
      const jitter = ((k % 7) - 3) * 0.085;
      return { s, sx: score + jitter, sy: s.metrics.bothHoursPerDay };
    });
  }, [summaries]);
  const x = (v: number) => ML + ((v - 0.5) / 5.1) * pw;
  const y = (v: number) => MT + ph - (v / 25) * ph;
  const hp = pts.find((p) => p.s.site.id === hover);

  return (
    <div className="chart" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Science value against hours per day with power and comms, for every site">
          {[0, 6, 12, 18, 24].map((v) => (
            <g key={v}>
              <line x1={ML} x2={w - MR} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={0.06} />
              <text x={ML - 6} y={y(v) + 3.5} textAnchor="end" fontFamily={FONT_MONO} fontSize={10} fill={COLOR.text3}>{v}</text>
            </g>
          ))}
          {[1, 2, 3, 4, 5].map((v) => (
            <text key={v} x={x(v)} y={h - 14} textAnchor="middle" fontFamily={FONT_MONO} fontSize={10} fill={COLOR.text3}>{v}</text>
          ))}
          <text x={ML + pw / 2} y={h - 2} textAnchor="middle" fontFamily={FONT_UI} fontSize={10} fill={COLOR.text3}>science value (team-assigned)</text>
          <text x={ML} y={10} fontFamily={FONT_UI} fontSize={10.5} fill={COLOR.text2}>{say("Power + comms, h/day")}</text>
          {pts.map((p) => {
            const sel = selected.includes(p.s.site.id);
            const cx = x(p.sx), cy = y(p.sy);
            return (
              <g
                key={p.s.site.id} className="chart__pt" opacity={sel || hover === p.s.site.id ? 1 : 0.6}
                onPointerEnter={() => setHover(p.s.site.id)} onPointerLeave={() => setHover(null)} onClick={() => focus(p.s.site.id)}
              >
                <circle cx={cx} cy={cy} r={11} fill="transparent" />
                {sel && <circle cx={cx} cy={cy} r={8.5} fill="none" stroke={COLOR.text} strokeOpacity={p.s.site.id === focusId ? 0.9 : 0.4} />}
                <Mark v={p.s.evaluation.overall} x={cx} y={cy} s={4.6} />
                {sel && (
                  <text
                    x={cx > w * 0.62 ? cx - 12 : cx + 12} y={cy + 3.5} textAnchor={cx > w * 0.62 ? "end" : "start"} fontFamily={FONT_UI} fontSize={10.5} fontWeight={600}
                    fill={COLOR.text} stroke={COLOR.panel} strokeWidth={3} paintOrder="stroke"
                  >
                    {p.s.site.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hp && (
        <div className="tip" style={{ left: clamp(x(hp.sx) + 14, 4, w - 220), top: clamp(y(hp.sy) - 30, 4, h - 84) }}>
          <strong>{hp.s.site.name}</strong>
          <span><VerdictChip v={hp.s.evaluation.overall} /></span>
          <span className="num">{hp.sy.toFixed(1)} h/day · science {hp.s.site.science!.score}/5</span>
          <span className="tip__dim">Click to compare</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const TABS: { id: AnalysisTab; label: string }[] = [
  { id: "slip", label: "Date shift" },
  { id: "dates", label: "Best dates" },
  { id: "trade", label: "Science vs ops" },
];

export function Analysis() {
  const tab = useStore((s) => s.analysisTab);
  const setTab = useStore((s) => s.setAnalysisTab);
  const focusId = useStore((s) => s.focusId);
  const days = useStore((s) => s.days);
  const data = useSiteData(focusId);

  return (
    <section className="panel analysis" aria-label="What-if analysis">
      <header className="panel__head">
        <div className="tabs" role="tablist" aria-label="Analysis">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <p className="analysis__lead">
        {tab === "slip" && data && `What if the landing at ${data.site.name} moves? Each bar is the same ${days}-day mission landed on a different day. Click a bar to move the date.`}
        {tab === "dates" && "The best landing dates ahead, per site and for all tracks together."}
        {tab === "trade" && "Every site by science value and by hours it can operate. Top right is where science and operations agree."}
      </p>
      <div className="analysis__body" role="tabpanel">
        {tab === "slip" && (data ? <SlipChart data={data} /> : <p className="panel__note">Computing…</p>)}
        {tab === "dates" && <BestDates />}
        {tab === "trade" && <TradeScatter />}
      </div>
    </section>
  );
}

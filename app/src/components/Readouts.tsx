// Live numbers under the hero view: Sun, Earth and power at the cursor, with countdowns and a
// true-scale close-up of each disc against the terrain line.

import { ChevronDown, Earth as EarthIcon, Sun as SunIcon, Zap } from "lucide-react";
import { useId, useMemo } from "react";
import type { HorizonProfile } from "../data/types";
import { earthPhase, separation } from "../lib/astro";
import { narrate } from "../lib/narrate";
import { COLOR } from "../lib/theme";
import { cardinal, fmtDuration, HOUR } from "../lib/time";
import { earthMargin, horizonAt, nextChange, sunMargin, type Instant, type NextChange } from "../lib/visibility";
import type { SiteData } from "../hooks/useSiteData";
import { useSay, useStore } from "../state/store";

/** Close-up at 1:1 angular scale: what a camera pointed at the body would frame. */
function BodyLens({
  horizon, az, el, r, fov, body, phase = 1, phaseAngle = 0,
}: {
  horizon: HorizonProfile; az: number; el: number; r: number; fov: number; body: "sun" | "earth"; phase?: number; phaseAngle?: number;
}) {
  const id = useId();
  const S = 64;
  const k = S / fov;
  const cosEl = Math.max(0.05, Math.cos((el * Math.PI) / 180));
  let d = `M0,${S}`;
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24 - 0.5) * fov;
    const hz = horizonAt(horizon, az + x / cosEl);
    d += `L${(i / 24) * S},${S / 2 - (hz - el) * k}`;
  }
  d += `L${S},${S}Z`;
  const rr = r * k;
  const rx = rr * Math.abs(1 - 2 * phase);
  return (
    <svg className="lens" width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden>
      <defs>
        <clipPath id={id}>
          <circle cx={S / 2} cy={S / 2} r={S / 2 - 1} />
        </clipPath>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.7" stopColor="#ffe6a6" />
          <stop offset="1" stopColor={COLOR.sun} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width={S} height={S} fill="#000" />
        {body === "sun" ? (
          <>
            <circle cx={S / 2} cy={S / 2} r={rr * 2.2} fill={COLOR.sun} opacity={0.12} />
            <circle cx={S / 2} cy={S / 2} r={rr} fill={`url(#${id}s)`} />
          </>
        ) : (
          <g transform={`translate(${S / 2} ${S / 2}) rotate(${phaseAngle})`}>
            <circle r={rr} fill="#12305c" />
            <path d={`M0,${-rr}A${rr},${rr} 0 0 1 0,${rr}A${rx},${rr} 0 0 ${phase > 0.5 ? 1 : 0} 0,${-rr}Z`} fill="#5aa9ff" />
          </g>
        )}
        <path d={d} fill="#262626" stroke="#b5b5b5" strokeWidth={1} />
      </g>
      <circle cx={S / 2} cy={S / 2} r={S / 2 - 1} fill="none" stroke={COLOR.lineStrong} />
    </svg>
  );
}

function Countdown({ nc, tMs, upLabel, downLabel }: { nc: NextChange; tMs: number; upLabel: string; downLabel: string }) {
  const label = nc.up ? upLabel : downLabel;
  if (nc.atMs === null) {
    return (
      <div className="kv__lead">
        <dt>{label}</dt>
        <dd className="kv__quiet">not in range</dd>
      </div>
    );
  }
  const h = (nc.atMs - tMs) / HOUR;
  return (
    <div className="kv__lead">
      <dt>{label}</dt>
      <dd className={`num${nc.up && h < 12 ? " is-soon" : ""}`}>{fmtDuration(h)}</dd>
    </div>
  );
}

/** "sets in 9d 12h" / "rises in 2h 05m"; "all mission" / "not this mission" when it never changes. */
function until(nc: NextChange, tMs: number, setWord: string, riseWord: string): string {
  if (nc.atMs === null) return nc.up ? "all mission" : "not this mission";
  return `${nc.up ? setWord : riseWord} in ${fmtDuration((nc.atMs - tMs) / HOUR)}`;
}

const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}°`;

export function Readouts({ data, inst }: { data: SiteData; inst: Instant }) {
  const c = useStore((s) => s.constraints);
  const simple = useStore((s) => s.simple);
  const open = useStore((s) => s.panels.readouts);
  const togglePanel = useStore((s) => s.togglePanel);
  const say = useSay();
  const { geom } = data;
  const sunNext = useMemo(() => nextChange(geom, sunMargin(geom, c), inst.tMs), [geom, c, inst.tMs]);
  const earthNext = useMemo(() => nextChange(geom, earthMargin(geom, c), inst.tMs), [geom, c, inst.tMs]);
  const sep = separation({ az: inst.sunAz, el: inst.sunEl }, { az: inst.earthAz, el: inst.earthEl });
  const phase = earthPhase(sep);
  const phaseAngle =
    (Math.atan2(-(inst.sunEl - inst.earthEl), ((((inst.sunAz - inst.earthAz + 540) % 360) - 180) * Math.cos((inst.earthEl * Math.PI) / 180))) * 180) / Math.PI;
  const text = narrate(data.site, inst, sunNext, earthNext, data.metrics.earthPct === 0, simple);
  const powerPct = Math.round((inst.powerW / c.panelW) * 100);

  // one-line decisions, always visible
  const sunWord = inst.sunFrac >= 0.999 ? "Up" : inst.sunFrac > 0.001 ? `${Math.round(inst.sunFrac * 100)}% visible` : "Down";
  const earthWord = inst.earthVisible ? "In view" : "Blocked";
  const powerWord = say(inst.both ? "Power + comms" : inst.lit ? "Power only" : inst.earthVisible ? "Comms only" : "Neither");

  return (
    <div className={`readouts${open ? " is-open" : ""}`}>
      <button type="button" className="readouts__bar" onClick={() => togglePanel("readouts")} aria-expanded={open} title={open ? "Hide the details" : "Show angles, close-ups and a plain-language summary"}>
        <span className={`sum${inst.lit ? " sum--sun" : ""}`}>
          <SunIcon size={14} aria-hidden /> <b>Sun</b> {sunWord}
          <span className="sum__when num">{until(sunNext, inst.tMs, "sets", "rises")}</span>
        </span>
        <span className={`sum${inst.earthVisible ? " sum--earth" : ""}`}>
          <EarthIcon size={14} aria-hidden /> <b>Earth</b> {earthWord}
          <span className="sum__when num">{until(earthNext, inst.tMs, "sets", "rises")}</span>
        </span>
        <span className={`sum${inst.both ? " sum--both" : inst.lit ? " sum--sun" : ""}`}>
          <Zap size={14} aria-hidden /> <b>Power</b> <span className="num">{Math.round(inst.powerW)} W</span>
          <span className="sum__when">{powerWord}</span>
        </span>
        <ChevronDown size={16} className="disclosure" aria-hidden />
      </button>
      {open && (
        <>
          <div className="readouts__row">
            <section className="ro ro--sun" aria-label="Sun">
              <BodyLens horizon={data.horizon} az={inst.sunAz} el={inst.sunEl} r={inst.sunR} fov={2.4} body="sun" />
              <div className="ro__body">
                <h3>
                  <SunIcon size={14} /> Sun
                  <span className={`state ${inst.lit ? "state--sun" : "state--off"}`}>
                    {inst.sunFrac >= 0.999 ? "Full disc" : inst.sunFrac > 0.001 ? `${Math.round(inst.sunFrac * 100)}% of disc` : "Not visible"}
                  </span>
                  <span className="ro__az num x-expert" title="Azimuth, clockwise from north">{inst.sunAz.toFixed(1)}° {cardinal(inst.sunAz)}</span>
                </h3>
                <dl className="kv">
                  <Countdown nc={sunNext} tMs={inst.tMs} upLabel="Sunset in" downLabel="Sunrise in" />
                  <div className="x-expert"><dt>Elevation</dt><dd className="num">{signed(inst.sunEl)}</dd></div>
                  <div className="x-expert" title="Sun centre minus the terrain horizon at its azimuth"><dt>Clearance</dt><dd className="num">{signed(inst.sunClear)}</dd></div>
                </dl>
              </div>
            </section>

            <section className="ro ro--earth" aria-label="Earth">
              <BodyLens horizon={data.horizon} az={inst.earthAz} el={inst.earthEl} r={inst.earthR} fov={6} body="earth" phase={phase} phaseAngle={phaseAngle} />
              <div className="ro__body">
                <h3>
                  <EarthIcon size={14} /> Earth
                  <span className={`state ${inst.earthVisible ? "state--earth" : "state--off"}`}>
                    {inst.earthVisible ? "Direct link" : "No direct link"}
                  </span>
                  <span className="ro__az num x-expert" title="Azimuth, clockwise from north">{inst.earthAz.toFixed(1)}° {cardinal(inst.earthAz)}</span>
                </h3>
                <dl className="kv">
                  <Countdown nc={earthNext} tMs={inst.tMs} upLabel="Earthset in" downLabel="Earthrise in" />
                  <div className="x-expert"><dt>Elevation</dt><dd className="num">{signed(inst.earthEl)}</dd></div>
                  <div className="x-expert" title="Earth centre minus the terrain horizon at its azimuth"><dt>Clearance</dt><dd className="num">{signed(inst.earthClear)}</dd></div>
                </dl>
              </div>
            </section>

            <section className="ro ro--power" aria-label="Power">
              <div className="ro__body">
                <h3>
                  <Zap size={14} /> Power
                  <span className={`state ${inst.both ? "state--both" : "state--off"}`}>{say(inst.both ? "Power + comms" : inst.lit ? "Power only" : inst.earthVisible ? "Comms only" : "Neither")}</span>
                </h3>
                <div className="power">
                  <span className="power__value num">{Math.round(inst.powerW)}</span>
                  <span className="power__unit">W of {c.panelW}</span>
                </div>
                <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={powerPct} aria-label="Array output">
                  <span style={{ width: `${powerPct}%` }} />
                </div>
              </div>
            </section>
          </div>
          <p className="narration">{text}</p>
        </>
      )}
    </div>
  );
}

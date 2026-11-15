// Centre column: the focused site's sky. Tabs switch between the compared sites and between the
// horizon panorama and the 3D terrain.

import { Box, ChevronDown, Mountain } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, lazy, useMemo } from "react";
import { slipAnalysis, type Check } from "../lib/scenario";
import { CATEGORY_LABEL, VERDICT_LABEL } from "../lib/theme";
import { fmtDayMonth, fmtLatLon } from "../lib/time";
import { useInstant, useSelectedData, useSiteData, type SiteData } from "../hooks/useSiteData";
import { SLIP_AFTER_DAYS, useSay, useStore } from "../state/store";
import { HorizonPanorama } from "./HorizonPanorama";
import { Readouts } from "./Readouts";
import { VerdictChip, VerdictIcon } from "./Scorecards";

const Terrain3D = lazy(() => import("./Terrain3D"));

export function HeroPanel() {
  const focusId = useStore((s) => s.focusId);
  const focus = useStore((s) => s.focus);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selected = useSelectedData();
  const ids = useStore((s) => s.selectedIds);
  const data = useSiteData(focusId);
  const inst = useInstant(data);
  const site = data?.site;

  return (
    <section className="panel hero" aria-label="Sky at the focused site">
      <header className="panel__head hero__head">
        <div className="tabs tabs--sites" role="tablist" aria-label="Compared sites">
          {ids.map((id, i) => {
            const d = selected[i];
            return (
              <button key={id} type="button" role="tab" aria-selected={id === focusId} className={id === focusId ? "is-on" : ""} onClick={() => focus(id)}>
                {d && <VerdictIcon v={d.evaluation.overall} size={13} />}
                {d?.site.name ?? "Loading…"}
              </button>
            );
          })}
        </div>
        {site && (
          <span className="hero__meta">
            <span className="x-expert">
            <span className="num">{fmtLatLon(site.lat, site.lon)}</span>
            {site.elevationM !== undefined && (
              <>
                {" "}· <span className="num">{site.elevationM >= 0 ? "+" : "−"}{Math.abs(Math.round(site.elevationM)).toLocaleString("en-US")} m</span>
              </>
            )}
            {site.approx && <span className="tag" title="Region centre or planning estimate, not a surveyed point">approx.</span>}
            {" "}·{" "}
            </span>
            {site.mission ?? CATEGORY_LABEL[site.category]}
          </span>
        )}
        <div className="seg" role="group" aria-label="View">
          <button type="button" className={view === "panorama" ? "is-on" : ""} aria-pressed={view === "panorama"} onClick={() => setView("panorama")}>
            <Mountain size={13} /> Horizon
          </button>
          <button type="button" className={view === "terrain" ? "is-on" : ""} aria-pressed={view === "terrain"} onClick={() => setView("terrain")}>
            <Box size={13} /> 3D terrain
          </button>
        </div>
      </header>
      {data && <AnswerCard data={data} />}
      <div className="hero__stage">
        {data && inst ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view} className="hero__view"
              initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {view === "panorama" ? (
                <HorizonPanorama data={data} inst={inst} />
              ) : (
                <Suspense fallback={<div className="t3d__loading">Loading 3D view…</div>}>
                  <Terrain3D data={data} inst={inst} />
                </Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="hero__pending">
            <span className="skeleton" />
            <p>Computing the terrain horizon from LOLA for this coordinate…</p>
          </div>
        )}
      </div>
      {data && inst && <Readouts data={data} inst={inst} />}
    </section>
  );
}

const HEADLINE = { GO: "Good to land here.", MARGINAL: "Borderline.", "NO-GO": "Not safe to land here." };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The answer before the evidence: verdict, why, and the three numbers the planner asked for. */
function AnswerCard({ data }: { data: SiteData }) {
  const c = useStore((s) => s.constraints);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const open = useStore((s) => s.panels.answer);
  const say = useSay();
  const togglePanel = useStore((s) => s.togglePanel);
  const { site, metrics: m, evaluation: ev } = data;
  const check = (id: Check["id"]) => ev.checks.find((k) => k.id === id)!;
  // the first later landing day whose verdict differs from today's plan
  const change = useMemo(
    () => slipAnalysis(data.geom, data.flags, c, startMs, days, 1, SLIP_AFTER_DAYS).find((p) => p.complete && p.verdict !== ev.overall),
    [data.geom, data.flags, c, startMs, days, ev.overall],
  );

  return (
    <section className={`answer${open ? " is-open" : ""}`} aria-label={`Verdict for ${site.name}`}>
      <button type="button" className="answer__head" onClick={() => togglePanel("answer")} aria-expanded={open} title={open ? "Hide the details" : "Show why, and the numbers behind it"}>
        <VerdictChip v={ev.overall} />
        <strong>{site.name}:</strong>
        <span className="answer__decision">
          {ev.overall === "GO" ? HEADLINE.GO : `${HEADLINE[ev.overall].slice(0, -1)}: ${say(ev.driver.label).toLowerCase()}`}
        </span>
        <ChevronDown size={16} className="disclosure" aria-hidden />
      </button>
      {open && (
        <div className="answer__more">
          <p className="answer__why">{ev.overall === "GO" ? "Every mission limit is met." : ev.driver.reason}</p>
          <dl className="answer__facts">
            <div>
              <dt>Can work and talk home</dt>
              <dd><VerdictIcon v={check("both").verdict} size={13} /><span className="num">{m.bothHoursPerDay.toFixed(1)} h</span> a day</dd>
              <dd className="answer__sub">needs {c.minBothHoursPerDay} h</dd>
            </div>
            <div>
              <dt>Longest night</dt>
              <dd><VerdictIcon v={check("dark").verdict} size={13} /><span className="num">{Math.round(m.longestDarkH)} h</span></dd>
              <dd className="answer__sub">battery lasts {c.maxDarkH} h</dd>
            </div>
            <div>
              <dt>If the landing slips</dt>
              {change ? (
                <dd><VerdictIcon v={change.verdict} size={13} />{VERDICT_LABEL[change.verdict]} after {plural(change.offsetDays, "day")}</dd>
              ) : (
                <dd><VerdictIcon v={ev.overall} size={13} />Still {VERDICT_LABEL[ev.overall]}</dd>
              )}
              <dd className="answer__sub">{change ? `landing ${fmtDayMonth(change.startMs)}` : `for at least ${SLIP_AFTER_DAYS} days`}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

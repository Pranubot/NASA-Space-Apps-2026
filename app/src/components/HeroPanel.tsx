// Centre column: the focused site's sky. Tabs switch between the compared sites and between the
// horizon panorama and the 3D terrain.

import { Box, Mountain } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, lazy } from "react";
import { CATEGORY_LABEL } from "../lib/theme";
import { fmtLatLon } from "../lib/time";
import { useInstant, useSelectedData, useSiteData } from "../hooks/useSiteData";
import { useStore } from "../state/store";
import { HorizonPanorama } from "./HorizonPanorama";
import { Readouts } from "./Readouts";
import { VerdictIcon } from "./Scorecards";

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
            <span className="num">{fmtLatLon(site.lat, site.lon)}</span>
            {site.elevationM !== undefined && (
              <>
                {" "}· <span className="num">{site.elevationM >= 0 ? "+" : "−"}{Math.abs(Math.round(site.elevationM)).toLocaleString("en-US")} m</span>
              </>
            )}
            {site.approx && <span className="tag" title="Region centre or planning estimate, not a surveyed point">approx.</span>}
            {" "}· {site.mission ?? CATEGORY_LABEL[site.category]}
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

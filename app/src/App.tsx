import { AnimatePresence, motion } from "motion/react";
import { Suspense, lazy, useEffect, useState } from "react";
import { loadDataset } from "./data/dataset";
import { HOUR } from "./lib/time";
import { usePlayback, useUrlSync } from "./hooks/useApp";
import { useStore } from "./state/store";
import { decodeScenario } from "./state/url";
import { Analysis } from "./components/Analysis";
import { ConstraintsPanel } from "./components/ConstraintsPanel";
import { Drawer } from "./components/Drawer";
import { Header } from "./components/Header";
import { HeroPanel } from "./components/HeroPanel";
import { Scorecards } from "./components/Scorecards";
import { SiteList } from "./components/SiteList";
import { SiteMap } from "./components/SiteMap";
import { Timeline } from "./components/Timeline";

const Intro = lazy(() => import("./components/Intro"));

function useBoot() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const shared = decodeScenario(window.location.search);
    if (shared) {
      // a shared link goes straight to the scenario
      useStore.setState({ introOpen: false, ...(shared.customSites ? { customSites: shared.customSites } : {}) });
    }
    loadDataset()
      .then((ds) => {
        const st = useStore.getState();
        st.setDataset(ds);
        if (shared) st.applyScenario(shared);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return error;
}

/** Custom sites need their horizon ray-cast from the DEM before they can be scored. */
function useCustomHorizons() {
  const ds = useStore((s) => s.dataset);
  const customSites = useStore((s) => s.customSites);
  const bump = useStore((s) => s.bumpHorizons);
  useEffect(() => {
    if (!ds) return;
    let live = true;
    for (const s of customSites) {
      if (!ds.horizon(s)) void ds.ensureHorizon(s).then(() => live && bump());
    }
    return () => {
      live = false;
    };
  }, [ds, customSites, bump]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const s = useStore.getState();
      if (s.introOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        s.setTime(s.tMs + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 6 : 1) * HOUR);
      } else if (e.key === "Home") {
        s.setTime(s.startMs);
      } else if (e.key >= "1" && e.key <= "3") {
        const id = s.selectedIds[Number(e.key) - 1];
        if (id) s.focus(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function App() {
  const error = useBoot();
  const ds = useStore((s) => s.dataset);
  const introOpen = useStore((s) => s.introOpen);
  const drawer = useStore((s) => s.drawer);
  const toast = useStore((s) => s.toast);
  usePlayback();
  useUrlSync(!!ds && !introOpen);
  useCustomHorizons();
  useShortcuts();

  if (error) {
    return (
      <div className="boot" role="alert">
        <h1>The planner could not start</h1>
        <p>{error}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  return (
    <>
      {ds ? (
        <div className="app" inert={introOpen}>
          <Header />
          <main className="main">
            <div className="rail rail--left">
              <SiteMap />
              <SiteList />
            </div>
            <HeroPanel />
            <div className="rail rail--right">
              <Scorecards />
              <ConstraintsPanel />
            </div>
          </main>
          <div className="dock">
            <Timeline />
            <Analysis />
          </div>
        </div>
      ) : (
        <div className="boot" aria-live="polite">
          <span className="skeleton skeleton--wide" />
          <p>Loading ephemeris and terrain horizons…</p>
        </div>
      )}

      <AnimatePresence>
        {ds && introOpen && (
          <Suspense fallback={null}>
            <Intro key="intro" />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>{drawer && <Drawer key="drawer" />}</AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id} className="toast" role="status"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

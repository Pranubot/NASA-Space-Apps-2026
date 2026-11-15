// Top bar: identity, scenario title, landing date and mission length, provenance, guide, share.

import { BookOpen, Play, Share2, TriangleAlert } from "lucide-react";
import { isoDate, parseIsoDate } from "../lib/time";
import { scenarioOf } from "../hooks/useApp";
import { DAY_OPTIONS, useStore } from "../state/store";
import { encodeScenario } from "../state/url";

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="10" fill="#e5e5e5" />
      <path d="M16 6a10 10 0 0 0 0 20a13.5 10 0 0 1 0-20z" fill="#000" opacity=".86" />
      <circle cx="26" cy="7" r="2.6" fill="#f5b942" />
    </svg>
  );
}

export function Header() {
  const ds = useStore((s) => s.dataset);
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const setStart = useStore((s) => s.setStart);
  const setDays = useStore((s) => s.setDays);
  const setDrawer = useStore((s) => s.setDrawer);
  const showToast = useStore((s) => s.showToast);
  const simple = useStore((s) => s.simple);
  const setSimple = useStore((s) => s.setSimple);
  const startTour = useStore((s) => s.startTour);

  const outOfRange = ds?.rangeMs ? startMs < ds.rangeMs[0] || startMs + days * 86_400_000 > ds.rangeMs[1] : true;

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeScenario(scenarioOf(useStore.getState()))}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied. It restores sites, dates, limits and the current time.");
    } catch {
      window.history.replaceState(null, "", url);
      showToast("Copy the address bar: it now holds this scenario.");
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <Mark />
        <span className="brand__name">Lunar Landing Site Navigator</span>
      </div>
      <label className="scenario">
        <span className="sr-only">Scenario title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} spellCheck={false} placeholder="Name this scenario" />
      </label>
      <div className="topbar__dates">
        <label className="field field--inline">
          <span>Landing</span>
          <input
            type="date" value={isoDate(startMs)}
            min={ds?.rangeMs ? isoDate(ds.rangeMs[0]) : undefined} max={ds?.rangeMs ? isoDate(ds.rangeMs[1] - days * 86_400_000) : undefined}
            onChange={(e) => {
              const ms = parseIsoDate(e.target.value);
              if (ms !== null) setStart(ms);
            }}
          />
        </label>
        <label className="field field--inline">
          <span>Mission</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {(DAY_OPTIONS.includes(days) ? DAY_OPTIONS : [...DAY_OPTIONS, days].sort((a, b) => a - b)).map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </label>
      </div>
      <div className="topbar__actions">
        <div className="seg" role="group" aria-label="Detail level" title="Simple shows the answer; Expert adds every angle, coordinate and metric">
          <button type="button" className={simple ? "is-on" : ""} aria-pressed={simple} onClick={() => setSimple(true)}>Simple</button>
          <button type="button" className={simple ? "" : "is-on"} aria-pressed={!simple} onClick={() => setSimple(false)}>Expert</button>
        </div>
        {/* data sources live in the Guide; this only appears when the numbers are approximate */}
        {(ds?.name === "mock" || outOfRange) && (
          <button
            type="button" className="badge badge--warn" onClick={() => setDrawer("sources")}
            title="These numbers use an approximate model. Click to see why."
          >
            <TriangleAlert size={13} />
            {ds?.name === "mock" ? "Mock data" : "Approximate: outside Horizons range"}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={startTour} title="A two-minute guided tour of the planner">
          <Play size={14} /> Tour
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setDrawer("guide")}>
          <BookOpen size={14} /> Guide
        </button>
        <button type="button" className="btn btn--primary" onClick={share}>
          <Share2 size={14} /> Share
        </button>
      </div>
    </header>
  );
}

// Right-hand inspector: one job at a time (compare, limits, what-if) instead of three panels at
// once. Also a drop zone: a site dragged here from the list or the map joins the comparison.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { findSite, useStore, type InspectorTab } from "../state/store";
import { Analysis } from "./Analysis";
import { ConstraintsPanel } from "./ConstraintsPanel";
import { Scorecards } from "./Scorecards";

const TABS: { id: InspectorTab; label: string; title: string }[] = [
  { id: "compare", label: "Compare", title: "Side-by-side numbers and verdicts for the tracks in the timeline" },
  { id: "limits", label: "Limits", title: "The engineering and operations limits the verdicts are judged against" },
  { id: "whatif", label: "What if", title: "What happens if the date moves, the best dates ahead, and science against operations" },
];

export function Inspector() {
  const tab = useStore((s) => s.inspectorTab);
  const setTab = useStore((s) => s.setInspectorTab);
  const open = useStore((s) => s.panels.inspector);
  const togglePanel = useStore((s) => s.togglePanel);
  const dragActive = useStore((s) => s.drag !== null);
  const dropKind = useStore((s) => s.drag?.action?.kind ?? null);
  // only light up when the pointer is over this panel, not the timeline
  const overHere = useStore((s) => {
    if (!s.drag?.action) return false;
    const el = document.elementFromPoint(s.drag.x, s.drag.y);
    return !!el?.closest('[data-drop="compare"]');
  });

  const dropClass = `${dragActive ? " is-droppable" : ""}${overHere && (dropKind === "add" || dropKind === "replace") ? " is-target" : ""}`;

  if (!open) {
    // folded away: a slim rail with an arrow pulls it back into view
    return (
      <aside className={`inspector inspector--collapsed${dropClass}`} data-drop="compare" aria-label="Inspector">
        <button type="button" className="inspector__rail" onClick={() => togglePanel("inspector")} aria-expanded={false} title="Show Compare, Limits and What if">
          <ChevronLeft size={16} aria-hidden />
          <span className="inspector__rail-label">{TABS.map((t) => t.label).join("  ·  ")}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`inspector${dropClass}`} data-drop="compare" aria-label="Inspector">
      <div className="inspector__tabs">
        <div className="tabs" role="tablist" aria-label="Inspector">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} title={t.title} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button" className="iconbtn inspector__collapse" onClick={() => togglePanel("inspector")} aria-expanded
          aria-label="Hide this panel" title="Hide this panel to give the sky more room"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="inspector__body" role="tabpanel">
        {tab === "compare" && <Scorecards />}
        {tab === "limits" && <ConstraintsPanel embedded />}
        {tab === "whatif" && <Analysis />}
      </div>
    </aside>
  );
}

/** The chip that follows the pointer while a site is dragged, saying what a drop would do. */
export function DragGhost() {
  const drag = useStore((s) => s.drag);
  const name = useStore((s) => (s.drag ? findSite(s, s.drag.id)?.name : undefined));
  if (!drag) return null;
  const ok = drag.action?.kind === "add" || drag.action?.kind === "replace";
  return (
    <div
      className={`ghost${ok ? " is-ok" : ""}`} aria-hidden
      style={{
        // stay on screen: flip above and to the left of the pointer near the bottom and right edges
        transform: `translate(${drag.x > window.innerWidth - 280 ? drag.x - 14 : drag.x + 14}px, ${drag.y > window.innerHeight - 70 ? drag.y - 58 : drag.y + 12}px)${drag.x > window.innerWidth - 280 ? " translateX(-100%)" : ""}`,
      }}
    >
      <strong>{name}</strong>
      <span>{drag.action?.hint ?? "Drop on the timeline or the compare panel"}</span>
    </div>
  );
}

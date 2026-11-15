// Grab handle on the timeline's top edge. Drag to resize; drag below the snap point (or
// double-click) to fold the timeline to its header. Keyboard: arrow keys resize, Enter folds.

import { useRef } from "react";
import { DOCK_DEFAULT, DOCK_MIN, DOCK_SNAP, useStore } from "../state/store";

const maxH = () => Math.round(window.innerHeight * 0.6);

export function DockHandle() {
  const dockH = useStore((s) => s.dockH);
  const setDockH = useStore((s) => s.setDockH);
  // height to return to when unfolding
  const lastOpen = useRef(dockH >= DOCK_SNAP ? dockH : DOCK_DEFAULT);
  if (dockH >= DOCK_SNAP) lastOpen.current = dockH;
  const folded = dockH <= DOCK_MIN;

  const settle = (h: number) => setDockH(h < DOCK_SNAP ? DOCK_MIN : Math.min(h, maxH()), true);
  const toggle = () => settle(folded ? lastOpen.current : DOCK_MIN);

  return (
    <div
      className={`dockhandle${folded ? " is-folded" : ""}`}
      role="separator" aria-orientation="horizontal" aria-label="Resize the timeline"
      aria-valuemin={DOCK_MIN} aria-valuemax={maxH()} aria-valuenow={dockH} tabIndex={0}
      title={folded ? "Drag up or double-click to show the timeline" : "Drag to resize the timeline, double-click to fold it"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = dockH;
        document.body.classList.add("is-resizing-dock");
        const move = (ev: PointerEvent) => setDockH(Math.min(maxH(), h0 + (y0 - ev.clientY)));
        const up = (ev: PointerEvent) => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          document.body.classList.remove("is-resizing-dock");
          settle(h0 + (y0 - ev.clientY));
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      }}
      onDoubleClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          settle(Math.max(DOCK_MIN, dockH + (e.key === "ArrowUp" ? 24 : -24)));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="dockhandle__grip" aria-hidden />
    </div>
  );
}

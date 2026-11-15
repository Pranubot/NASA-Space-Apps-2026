// Drag a site from the bin (list row or map pin) onto the timeline or the compare panel.
// Pointer-based rather than HTML5 drag-and-drop so it also works from SVG map pins and shows a
// live hint of what the drop will do. The checkbox in the site list remains the keyboard route.

import { useCallback } from "react";
import { MAX_SELECTED, findSite, useStore } from "../state/store";

export const TRACK_AXIS_H = 20;
export const TRACK_ROW_H = 32;

export interface DropAction {
  kind: "add" | "replace" | "already" | "full";
  /** track being replaced */
  targetId?: string;
  hint: string;
}

const DRAG_THRESHOLD = 6;

/** What dropping `siteId` at this screen point would do, or null when not over a drop zone. */
export function resolveDrop(siteId: string, x: number, y: number): DropAction | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
  if (!el) return null;
  const s = useStore.getState();
  if (s.selectedIds.includes(siteId)) return { kind: "already", hint: "Already in the timeline" };

  // over a specific track?
  let targetId: string | undefined;
  if (el.dataset.drop === "timeline") {
    const r = el.getBoundingClientRect();
    const row = Math.floor((y - r.top + el.scrollTop - TRACK_AXIS_H) / TRACK_ROW_H);
    targetId = s.selectedIds[row];
  }
  if (s.selectedIds.length < MAX_SELECTED) return { kind: "add", hint: "Add as a new track" };
  if (targetId) {
    const name = findSite(s, targetId)?.name ?? "this track";
    return { kind: "replace", targetId, hint: `Replace ${name}` };
  }
  return { kind: "full", hint: `${MAX_SELECTED} tracks at most. Drop on a track to replace it.` };
}

export function useSiteDrag(siteId: string) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY;
      let active = false;

      const move = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD) return;
          active = true;
          document.body.classList.add("is-site-dragging");
        }
        ev.preventDefault();
        useStore.getState().setDrag({ id: siteId, x: ev.clientX, y: ev.clientY, action: resolveDrop(siteId, ev.clientX, ev.clientY) });
      };
      const end = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (!active) return;
        document.body.classList.remove("is-site-dragging");
        const st = useStore.getState();
        const action = ev.type === "pointerup" ? resolveDrop(siteId, ev.clientX, ev.clientY) : null;
        st.setDrag(null);
        if (action?.kind === "add") st.toggleSelect(siteId);
        else if (action?.kind === "replace" && action.targetId) st.replaceTrack(action.targetId, siteId);
        else if (action?.kind === "full") st.showToast(action.hint);
        // the click that follows a drag must not also focus the site
        window.addEventListener("click", stopClick, true);
        setTimeout(() => window.removeEventListener("click", stopClick, true), 0);
      };
      const stopClick = (c: Event) => c.stopPropagation();

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [siteId],
  );
  return { onPointerDown };
}

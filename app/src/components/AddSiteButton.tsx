// "Add site" toggle for the maps. Arming it turns the next plain click on the map into a custom
// site; dragging still pans or turns the map. Replaces double-click-to-add, which fired by
// accident when the zoom buttons were clicked quickly.

import { MapPinPlus } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "../state/store";

export function AddSiteButton() {
  const placing = useStore((s) => s.placing);
  const setPlacing = useStore((s) => s.setPlacing);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, setPlacing]);

  return (
    <button
      type="button" className={`iconbtn addsite${placing ? " is-on" : ""}`} aria-pressed={placing}
      onClick={() => setPlacing(!placing)}
      aria-label={placing ? "Cancel adding a site" : "Add a site"}
      title={placing ? "Cancel (Esc)" : "Add a site: then click the map where you want it"}
    >
      <MapPinPlus size={15} />
    </button>
  );
}

/** Banner shown on the map while "Add site" is armed. */
export function PlacingHint() {
  const placing = useStore((s) => s.placing);
  if (!placing) return null;
  return <p className="map__placing">Click the map to add a site · Esc to cancel</p>;
}

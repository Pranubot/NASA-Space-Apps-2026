// Site marker and hover card shared by the polar map and the globe.
// Colour = verdict for the current dates. Filled = in the comparison, hollow = available.

import type { Site } from "../data/types";
import { clamp } from "../lib/astro";
import type { Verdict } from "../lib/scenario";
import { CATEGORY_LABEL, COLOR, FONT_UI, VERDICT_COLOR, VERDICT_LABEL } from "../lib/theme";
import { fmtLatLon } from "../lib/time";
import { useSiteDrag } from "../hooks/useSiteDrag";

export interface Tip {
  x: number;
  y: number;
  site: Site;
  verdict?: Verdict;
}

export function Pin({
  x, y, site, verdict, selected, focused, hovered, showLabel, onEnter, onLeave, onClick,
}: {
  x: number; y: number; site: Site; verdict?: Verdict; selected: boolean; focused: boolean; hovered: boolean; showLabel: boolean;
  onEnter: () => void; onLeave: () => void; onClick: () => void;
}) {
  const color = verdict ? VERDICT_COLOR[verdict] : COLOR.text2;
  const drag = useSiteDrag(site.id);
  return (
    <g
      className="pin" transform={`translate(${x} ${y})`} onPointerEnter={onEnter} onPointerLeave={onLeave}
      onPointerDown={(e) => {
        // keep the map from panning, and let the pin be dragged to the timeline
        e.stopPropagation();
        drag.onPointerDown(e);
      }}
      onClick={onClick} role="button" tabIndex={0}
      aria-label={`${site.name}${verdict ? `, ${VERDICT_LABEL[verdict]}` : ""}`}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
    >
      <circle r={12} fill="transparent" />
      {focused && <circle className="pin__pulse" r={7} fill="none" stroke={color} strokeWidth={1.5} />}
      <circle r={selected ? 5.5 : 4.2} fill={selected ? color : "#000"} stroke={selected ? "#000" : color} strokeWidth={selected ? 1.5 : 1.8} />
      {((selected && showLabel) || hovered) && (
        <text
          x={9} y={4} fontFamily={FONT_UI} fontSize={11} fontWeight={650} fill={COLOR.text}
          stroke="#000" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
        >
          {site.name}
        </text>
      )}
    </g>
  );
}

export function SiteTip({ tip, w, h }: { tip: Tip; w: number; h: number }) {
  return (
    <div className="tip" style={{ left: clamp(tip.x + 14, 4, w - 208), top: clamp(tip.y + 12, 4, h - 92) }}>
      <strong>{tip.site.name}</strong>
      <span className="tip__dim">{tip.site.mission ?? CATEGORY_LABEL[tip.site.category]}</span>
      <span className="num">{fmtLatLon(tip.site.lat, tip.site.lon)}{tip.site.approx ? " (approx.)" : ""}</span>
      {tip.site.science && <span className="tip__dim">{tip.site.science.tags.join(" · ")}</span>}
    </div>
  );
}

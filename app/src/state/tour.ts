// The guided tour's script. Each step names the panel to spotlight, the caption, and the app state
// it needs. A step always applies the full state (BASE plus its own changes), so Back and Next
// land on the same screen whatever the viewer clicked in between.
//
// The captions state facts about the default scenario. tour.test.ts checks them against the
// shipped data, so regenerated data that breaks the story fails a test instead of the demo.

import { DAY, HOUR } from "../lib/time";
import { DEFAULT_CONSTRAINTS } from "../lib/visibility";
import { DEFAULT_SCENARIO, OPEN_PANELS } from "./store";

export const TOUR_SLIP_DAYS = 14;

const START = DEFAULT_SCENARIO.startMs;
const SLIPPED = START + TOUR_SLIP_DAYS * DAY;

const BASE = {
  selectedIds: DEFAULT_SCENARIO.selectedIds,
  focusId: "connecting-ridge",
  startMs: START,
  days: DEFAULT_SCENARIO.days,
  tMs: START + 36 * HOUR,
  constraints: DEFAULT_CONSTRAINTS,
  title: DEFAULT_SCENARIO.title,
  view: "panorama" as "panorama" | "terrain",
  simple: true,
  playing: false,
  speed: 6,
  inspectorTab: "compare" as "compare" | "limits" | "whatif",
  // the tour points at every panel, so it opens them all
  panels: OPEN_PANELS,
  analysisTab: "slip" as const,
  drawer: null,
};

export interface TourStep {
  /** CSS selector of the panel to spotlight */
  target: string;
  /** which side of the panel the caption sits on, and how it lines up along that side */
  place: "right" | "left" | "above" | "below";
  align?: "start" | "center" | "end";
  title: string;
  text: string;
  set?: Partial<typeof BASE>;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: ".hero__stage", place: "right",
    title: "The sky at the Moon's south pole",
    text: "This is the view from Connecting Ridge, near Shackleton crater. The Sun never climbs more than about 2° here. It circles the horizon, skimming the hills.",
    set: { playing: true },
  },
  {
    target: ".timeline", place: "above", align: "center",
    title: "When can the lander work?",
    text: "Yellow bars: sunlight, so there is power. Blue bars: Earth is in view, so the lander can talk home. Green bars: both at once. Only green is working time.",
    set: { playing: true },
  },
  {
    target: ".answer", place: "right",
    title: "The answer comes first",
    text: "Every hour of the mission is checked against the limits: battery, working hours and contact with Earth. Connecting Ridge passes them all, so it is GO.",
  },
  {
    target: ".answer", place: "below",
    title: "A site that fails",
    text: "Same mission, another south-pole site: IM-2 Athena. Its longest night is 171 hours and the battery survives 50. NO-GO, and everyone can see why.",
    set: { focusId: "im2-athena" },
  },
  {
    target: ".inspector", place: "left",
    title: "What if the launch slips?",
    text: "Each bar is the same 14-day mission, landed on a different day. Green days work and red days do not. Here, landing three days late is already too late.",
    set: { inspectorTab: "whatif" },
  },
  {
    target: ".answer", place: "below",
    title: "Two weeks late",
    text: "Same site, landing two weeks later. The Sun and Earth are no longer up together for long enough, and Connecting Ridge turns NO-GO. Malapert Massif fails too.",
    set: { startMs: SLIPPED, tMs: SLIPPED + 36 * HOUR },
  },
  {
    target: ".hero__stage", place: "right",
    title: "The ground itself",
    text: "Real terrain, measured by NASA's LOLA laser altimeter and lit from the Sun's real direction. As time plays, the shadows sweep across the craters.",
    set: { view: "terrain", playing: true },
  },
  {
    target: ".topbar__actions", place: "below", align: "end",
    title: "Real data, one link",
    text: "Sun and Earth positions come from JPL Horizons and match it to within 0.01°. Share copies a link that reopens this exact scenario for your team. The planner is yours.",
  },
];

/** The complete app state for a step. */
export const tourState = (i: number) => ({ ...BASE, ...TOUR_STEPS[i].set });

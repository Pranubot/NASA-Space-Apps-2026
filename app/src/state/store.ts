// One store for the whole scenario. Views read through selectors; nothing else holds state that
// another view needs.

import { create } from "zustand";
import type { Dataset, Site } from "../data/types";
import { clamp } from "../lib/astro";
import { DAY, HOUR } from "../lib/time";
import { DEFAULT_CONSTRAINTS, type Constraints } from "../lib/visibility";

export const MAX_SELECTED = 3;
export const SLIP_BEFORE_DAYS = 15;
export const SLIP_AFTER_DAYS = 30;

export type HeroView = "panorama" | "terrain";
export type MapRegion = "polar" | "global";
export type AnalysisTab = "slip" | "dates" | "trade";
export type Drawer = null | "guide" | "sources";
export type InspectorTab = "compare" | "limits" | "whatif";

/** A site being dragged from the bin, and what dropping it here would do. */
export interface DragState {
  id: string;
  x: number;
  y: number;
  action: { kind: "add" | "replace" | "already" | "full"; targetId?: string; hint: string } | null;
}

/** Default story: a 14-day surface mission in the September 2027 window where the pole is lit and
 *  Earth is above the ridge lines. Slipping two weeks puts Earth below the horizon. */
export const DEFAULT_SCENARIO = {
  selectedIds: ["connecting-ridge", "malapert-massif", "im2-athena"],
  focusId: "connecting-ridge",
  startMs: Date.UTC(2027, 8, 15),
  days: 14,
  title: "South-pole surface mission, 14-day slip study",
};

export interface ScenarioState {
  selectedIds: string[];
  focusId: string;
  startMs: number;
  days: number;
  tMs: number;
  constraints: Constraints;
  customSites: Site[];
  title: string;
  view: HeroView;
}

interface State extends ScenarioState {
  dataset: Dataset | null;
  /** bumped when a custom site's horizon finishes computing */
  horizonVersion: number;
  playing: boolean;
  /** mission hours per real second */
  speed: number;
  mapRegion: MapRegion;
  analysisTab: AnalysisTab;
  inspectorTab: InspectorTab;
  drag: DragState | null;
  drawer: Drawer;
  introOpen: boolean;
  hoverSiteId: string | null;
  toast: { id: number; text: string } | null;
  /** Simple hides the expert numbers (angles, coordinates, extra metrics) so newcomers see the answer first */
  simple: boolean;

  setDataset(d: Dataset): void;
  applyScenario(s: Partial<ScenarioState>): void;
  toggleSelect(id: string): void;
  replaceTrack(oldId: string, newId: string): void;
  setDrag(d: DragState | null): void;
  setInspectorTab(t: InspectorTab): void;
  focus(id: string): void;
  setStart(ms: number, keepOffset?: boolean): void;
  setDays(d: number): void;
  setTime(ms: number): void;
  setPlaying(p: boolean): void;
  setSpeed(s: number): void;
  setConstraint<K extends keyof Constraints>(k: K, v: Constraints[K]): void;
  resetConstraints(): void;
  addCustomSite(lat: number, lon: number, elevationM?: number): Site;
  removeCustomSite(id: string): void;
  bumpHorizons(): void;
  setTitle(t: string): void;
  setView(v: HeroView): void;
  setMapRegion(r: MapRegion): void;
  setAnalysisTab(t: AnalysisTab): void;
  setDrawer(d: Drawer): void;
  closeIntro(): void;
  setHoverSite(id: string | null): void;
  setSimple(s: boolean): void;
  showToast(text: string): void;
}

export const DAY_OPTIONS = [7, 14, 30, 60, 90];
export const SPEEDS = [1, 3, 6, 12, 24, 72];

export function customSiteId(lat: number, lon: number): string {
  return `custom_${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

export function makeCustomSite(lat: number, lon: number, elevationM?: number): Site {
  return {
    id: customSiteId(lat, lon),
    name: `Custom ${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`,
    lat, lon, category: "custom", mission: "Custom coordinate", elevationM,
  };
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  dataset: null,
  horizonVersion: 0,
  selectedIds: DEFAULT_SCENARIO.selectedIds,
  focusId: DEFAULT_SCENARIO.focusId,
  startMs: DEFAULT_SCENARIO.startMs,
  days: DEFAULT_SCENARIO.days,
  tMs: DEFAULT_SCENARIO.startMs + 36 * HOUR,
  constraints: DEFAULT_CONSTRAINTS,
  customSites: [],
  title: DEFAULT_SCENARIO.title,
  view: "panorama",
  playing: false,
  speed: 6,
  mapRegion: "polar",
  analysisTab: "slip",
  inspectorTab: "compare",
  drag: null,
  drawer: null,
  introOpen: true,
  hoverSiteId: null,
  toast: null,
  simple: true,

  setDataset: (dataset) =>
    set((s) => {
      const known = new Set([...dataset.sites, ...s.customSites].map((x) => x.id));
      const selectedIds = s.selectedIds.filter((id) => known.has(id));
      const sel = selectedIds.length ? selectedIds : [dataset.sites[0].id];
      return { dataset, selectedIds: sel, focusId: sel.includes(s.focusId) ? s.focusId : sel[0] };
    }),

  applyScenario: (p) =>
    set((s) => {
      const next = { ...s, ...p };
      next.tMs = clamp(next.tMs, next.startMs, next.startMs + next.days * DAY);
      if (!next.selectedIds.includes(next.focusId)) next.focusId = next.selectedIds[0];
      return next;
    }),

  toggleSelect: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) {
        if (s.selectedIds.length === 1) return s;
        const selectedIds = s.selectedIds.filter((x) => x !== id);
        return { selectedIds, focusId: s.focusId === id ? selectedIds[0] : s.focusId };
      }
      if (s.selectedIds.length >= MAX_SELECTED) {
        get().showToast(`${MAX_SELECTED} tracks at most. Remove one, or drag onto a track to replace it.`);
        return s;
      }
      return { selectedIds: [...s.selectedIds, id], focusId: id };
    }),

  replaceTrack: (oldId, newId) =>
    set((s) => {
      if (!s.selectedIds.includes(oldId) || s.selectedIds.includes(newId)) return s;
      return { selectedIds: s.selectedIds.map((x) => (x === oldId ? newId : x)), focusId: newId };
    }),

  setDrag: (drag) => set({ drag }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  focus: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) return { focusId: id };
      // Focusing an unselected site swaps it in for the current focus when the compare set is full.
      const selectedIds =
        s.selectedIds.length >= MAX_SELECTED ? s.selectedIds.map((x) => (x === s.focusId ? id : x)) : [...s.selectedIds, id];
      return { selectedIds, focusId: id };
    }),

  setStart: (ms, keepOffset = true) =>
    set((s) => {
      const offset = keepOffset ? s.tMs - s.startMs : 0;
      return { startMs: ms, tMs: clamp(ms + offset, ms, ms + s.days * DAY) };
    }),

  setDays: (days) => set((s) => ({ days, tMs: clamp(s.tMs, s.startMs, s.startMs + days * DAY) })),

  setTime: (ms) => set((s) => ({ tMs: clamp(ms, s.startMs, s.startMs + s.days * DAY) })),

  setPlaying: (playing) =>
    set((s) => {
      // pressing play at the very end restarts from the landing
      if (playing && s.tMs >= s.startMs + s.days * DAY - 1) return { playing, tMs: s.startMs };
      return { playing };
    }),

  setSpeed: (speed) => set({ speed }),

  setConstraint: (k, v) => set((s) => ({ constraints: { ...s.constraints, [k]: v } })),
  resetConstraints: () => set({ constraints: DEFAULT_CONSTRAINTS }),

  addCustomSite: (lat, lon, elevationM) => {
    const site = makeCustomSite(lat, lon, elevationM);
    set((s) => (s.customSites.some((x) => x.id === site.id) ? s : { customSites: [...s.customSites, site] }));
    get().focus(site.id);
    return site;
  },

  removeCustomSite: (id) =>
    set((s) => {
      const customSites = s.customSites.filter((x) => x.id !== id);
      let selectedIds = s.selectedIds.filter((x) => x !== id);
      if (!selectedIds.length && s.dataset) selectedIds = [s.dataset.sites[0].id];
      return { customSites, selectedIds, focusId: selectedIds.includes(s.focusId) ? s.focusId : selectedIds[0] };
    }),

  bumpHorizons: () => set((s) => ({ horizonVersion: s.horizonVersion + 1 })),
  setTitle: (title) => set({ title }),
  setView: (view) => set({ view }),
  setMapRegion: (mapRegion) => set({ mapRegion }),
  setAnalysisTab: (analysisTab) => set({ analysisTab }),
  setDrawer: (drawer) => set({ drawer }),
  closeIntro: () => set({ introOpen: false }),
  setHoverSite: (hoverSiteId) => set({ hoverSiteId }),
  setSimple: (simple) => set({ simple }),
  showToast: (text) => {
    const id = ++toastId;
    set({ toast: { id, text } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2600);
  },
}));

export function allSites(s: Pick<State, "dataset" | "customSites">): Site[] {
  return s.dataset ? [...s.dataset.sites, ...s.customSites] : s.customSites;
}

export function findSite(s: Pick<State, "dataset" | "customSites">, id: string): Site | undefined {
  return s.dataset?.sites.find((x) => x.id === id) ?? s.customSites.find((x) => x.id === id);
}

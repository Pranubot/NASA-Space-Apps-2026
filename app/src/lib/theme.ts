// Semantic colours. Fixed across the product (SPEC section 6); mirrored in styles/tokens.css.
// Every use is paired with a label or icon so nothing depends on colour alone.

import type { SiteCategory } from "../data/types";
import type { Verdict } from "./scenario";

export const COLOR = {
  sun: "#f5b942",
  earth: "#4fa3ff",
  both: "#3ddc97",
  dark: "#333333",
  nogo: "#ff5d5d",
  marginal: "#ff9a4d",
  text: "#ededed",
  text2: "#a3a3a3",
  text3: "#7a7a7a",
  line: "#1a1a1a",
  lineStrong: "#2b2b2b",
  panel: "#000000",
  bg: "#000000",
} as const;

export const VERDICT_COLOR: Record<Verdict, string> = {
  GO: COLOR.both,
  MARGINAL: COLOR.marginal,
  "NO-GO": COLOR.nogo,
};

export const CATEGORY_LABEL: Record<SiteCategory, string> = {
  artemis: "Artemis",
  clps: "CLPS",
  commercial: "Commercial",
  international: "International",
  apollo: "Apollo",
  reference: "Reference",
  custom: "Custom",
};

export const FONT_UI = '"Archivo Variable", "Archivo", system-ui, sans-serif';
export const FONT_MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

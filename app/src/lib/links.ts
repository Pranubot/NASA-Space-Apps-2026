// Deep links to the tools the challenge brief names, at a site's coordinates.

import type { Site } from "../data/types";
import { isoDate } from "./time";

/** Moon Trek accepts a view in its URL hash: longitude, latitude and zoom in the global projection. */
export function moonTrekUrl(site: Site): string {
  const p = encodeURIComponent("urn:ogc:def:crs:EPSG::104903");
  return `https://trek.nasa.gov/moon/#v=0.1&x=${site.lon.toFixed(4)}&y=${site.lat.toFixed(4)}&z=7&p=${p}&d=`;
}

/** Quickmap has no stable public deep-link format, so we open it and copy the coordinates. */
export const QUICKMAP_URL = "https://quickmap.lroc.asu.edu/";

/** Coordinates in the "lat, lon" form both tools accept in their search boxes. */
export const coordString = (site: Site) => `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`;

/**
 * The exact JPL Horizons API request for this site: apparent azimuth/elevation of a body from
 * `coord@301`. Opening it shows the reference numbers our geometry is validated against.
 */
export function horizonsUrl(site: Site, body: "sun" | "earth", startMs: number, days: number): string {
  const q = (v: string) => `'${v}'`;
  const lonE = ((site.lon % 360) + 360) % 360;
  const params: Record<string, string> = {
    format: "text",
    COMMAND: q(body === "sun" ? "10" : "399"),
    OBJ_DATA: q("NO"),
    MAKE_EPHEM: q("YES"),
    EPHEM_TYPE: q("OBSERVER"),
    CENTER: q("coord@301"),
    COORD_TYPE: q("GEODETIC"),
    SITE_COORD: q(`${lonE.toFixed(5)},${site.lat.toFixed(5)},${((site.elevationM ?? 0) / 1000).toFixed(3)}`),
    START_TIME: q(isoDate(startMs)),
    STOP_TIME: q(isoDate(startMs + Math.min(days, 30) * 86_400_000)),
    STEP_SIZE: q("60m"),
    QUANTITIES: q("4,13"),
    ANG_FORMAT: q("DEG"),
    CSV_FORMAT: q("YES"),
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${qs}`;
}

export const RESOURCES = [
  {
    name: "JPL Horizons System",
    org: "NASA Jet Propulsion Laboratory",
    url: "https://ssd.jpl.nasa.gov/horizons/",
    use: "Sub-Earth and sub-solar points on the Moon, hourly, used for every Sun and Earth position in the app.",
  },
  {
    name: "LOLA gridded elevation (LRO)",
    org: "NASA GSFC / PDS Geosciences Node",
    url: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
    use: "LDEM_80S_80M and LDEM_64 elevation models: terrain horizons, the live shadow map and 3D terrain.",
  },
  {
    name: "LROC Quickmap",
    org: "Arizona State University",
    url: "https://quickmap.lroc.asu.edu/",
    use: "Reference for site coordinates and polar illumination. Each site links out to it.",
  },
  {
    name: "Moon Trek",
    org: "NASA Solar System Treks",
    url: "https://trek.nasa.gov/moon/",
    use: "Cross-check for terrain shape. Each site opens there at the same coordinates.",
  },
  {
    name: "CGI Moon Kit and Blue Marble",
    org: "NASA Scientific Visualization Studio",
    url: "https://svs.gsfc.nasa.gov/4720",
    use: "LROC colour mosaic for the global map and the opening sequence; Earth imagery for the 3D sky.",
  },
  {
    name: "Moon Exploration",
    org: "Canadian Space Agency",
    url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/",
    use: "Background on Canada's lunar rover mission and Artemis role, used in the guide.",
  },
] as const;

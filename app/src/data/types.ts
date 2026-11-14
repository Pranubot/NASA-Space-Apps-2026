// Data contracts (SPEC.md section 5). Everything the views consume goes through these shapes.

export type SiteCategory =
  | "artemis"
  | "clps"
  | "commercial"
  | "international"
  | "apollo"
  | "reference"
  | "custom";

export interface Site {
  id: string;
  name: string;
  /** planetocentric, degrees, south negative */
  lat: number;
  /** east-positive, degrees, -180..180 */
  lon: number;
  category: SiteCategory;
  mission?: string;
  /** coordinates are a region centre or planning estimate */
  approx?: boolean;
  science?: { score: number; tags: string[]; note?: string };
  elevationM?: number;
}

export interface HorizonProfile {
  siteKey: string;
  azStepDeg: number;
  /** index i <-> azimuth i * azStepDeg, degrees above the local horizontal plane */
  elevationDeg: ArrayLike<number>;
  /** distance to the terrain that defines the horizon at each azimuth */
  distKm?: ArrayLike<number>;
  observerHeightM: number;
  maxRangeKm: number;
  source: string;
  approx?: boolean;
}

/** Where the Sun and Earth stand over the Moon (Mean Earth frame) and how far away they are. */
export interface Subpoints {
  eLat: number;
  eLon: number;
  sLat: number;
  sLon: number;
  earthKm: number;
  sunKm: number;
}

export interface SubpointTable {
  startMs: number;
  stepMin: number;
  count: number;
  subEarth: { lon: number[]; lat: number[] };
  subSun: { lon: number[]; lat: number[] };
  earthDistKm: number[];
  sunDistAu: number[];
  source: string;
}

export interface TerrainPatch {
  n: number;
  pixelM: number;
  /** metres above the 1737.4 km sphere, row 0 = north edge, col 0 = west edge */
  heights: Float32Array;
  minM: number;
  maxM: number;
  source: string;
  approx?: boolean;
}

export interface ValidationCase {
  id: string;
  name: string;
  lat: number;
  lon: number;
  samples: number;
  sunElMaxErrDeg: number;
  sunAzMaxErrDeg: number;
  earthElMaxErrDeg: number;
  earthAzMaxErrDeg: number;
  example: {
    utc: string;
    horizonsSun: [number, number];
    appSun: [number, number];
    horizonsEarth: [number, number];
    appEarth: [number, number];
  };
}

export interface Validation {
  method: string;
  startUtc: string;
  cases: ValidationCase[];
}

/** South-polar stereographic elevation grid (longitude 0 up, 90E right), DN = metres * 2. */
export interface PolarGrid {
  n: number;
  pixelM: number;
  data: Int16Array;
}

/** Simple-cylindrical global elevation grid, longitudes 0..360 east, row 0 at +90. */
export interface GlobalGrid {
  w: number;
  h: number;
  ppd: number;
  data: Int16Array;
}

/**
 * The only thing views talk to. Loaded once at boot; after that every call is synchronous except
 * the ones that may need a DEM download (custom-site horizons, terrain patches, the polar grid).
 */
export interface Dataset {
  readonly name: "horizons" | "mock";
  /** short provenance label for the header badge */
  readonly badge: string;
  readonly ephemerisSource: string;
  readonly terrainSource: string;
  readonly rangeMs: [number, number] | null;
  readonly sites: Site[];
  readonly validation: Validation | null;
  subpoints(tMs: number): { sp: Subpoints; approx: boolean };
  /** synchronous for curated sites; undefined until `ensureHorizon` has resolved for a custom one */
  horizon(site: Site): HorizonProfile | undefined;
  ensureHorizon(site: Site): Promise<HorizonProfile>;
  terrain(site: Site): Promise<TerrainPatch>;
  polarGrid(): Promise<PolarGrid | null>;
}

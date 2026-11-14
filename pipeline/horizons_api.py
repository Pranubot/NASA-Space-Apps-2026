"""Topocentric Sun and Earth azimuth/elevation for a lunar site via the JPL Horizons API.

This is the ephemeris source the updated challenge brief names (https://ssd.jpl.nasa.gov/horizons/).
It produces the same EphemerisSeries contract (SPEC.md §5.3) as ephemeris.py (SPICE), so the two
are interchangeable in export_static.py (`--ephem horizons|spice`). Use it:
  * as the primary source if NAIF kernel downloads or spiceypy give trouble on the day, and
  * as the reference for validation #1 (SPICE vs Horizons within ~0.05 deg).

    python horizons_api.py --lat -89.45 --lon -137.3 --start 2027-01-01 --end 2027-01-02 --step-min 60

Request shape (observer table, one request per body):
  CENTER='coord@301'  COORD_TYPE='GEODETIC'  SITE_COORD='<E-lon deg>,<lat deg>,<alt km>'
  QUANTITIES='4,13'   -> apparent azimuth/elevation (light-time + aberration, like SPICE CN+S)
                         and target angular diameter (arcsec) for the disc radius.
Horizons measures azimuth from north, clockwise (east = 90), which is our convention.
The Moon has no atmosphere, so no refraction flag is involved.

Run against the live API on 2026-11-14: the Apollo 11 case puts Earth about 73 deg up, as expected.
validate.py uses compute() below as the reference for the sub-point geometry the app ships.
Be polite to the service: requests are sequential with a short pause, hourly steps for a year
(~8.8k rows) fit in one request.
"""
from __future__ import annotations

import argparse
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}
PAUSE_S = 1.0


def _q(v: str) -> str:
    return f"'{v}'"


def build_params(body_id: str, lat: float, lon: float, start: datetime, end: datetime,
                 step_min: int, height_m: float = 2.0) -> dict[str, str]:
    lon_e = lon % 360.0  # Horizons wants east longitude; 0..360 avoids sign ambiguity
    return {
        "format": "json",
        "COMMAND": _q(body_id),
        "OBJ_DATA": _q("NO"),
        "MAKE_EPHEM": _q("YES"),
        "EPHEM_TYPE": _q("OBSERVER"),
        "CENTER": _q("coord@301"),
        "COORD_TYPE": _q("GEODETIC"),
        "SITE_COORD": _q(f"{lon_e:.6f},{lat:.6f},{height_m / 1000.0:.4f}"),
        "START_TIME": _q(start.strftime("%Y-%m-%d %H:%M")),
        "STOP_TIME": _q(end.strftime("%Y-%m-%d %H:%M")),
        "STEP_SIZE": _q(f"{step_min}m"),
        "TIME_TYPE": _q("UT"),
        "TIME_DIGITS": _q("MINUTES"),
        "QUANTITIES": _q("4,13"),
        "ANG_FORMAT": _q("DEG"),
        "CSV_FORMAT": _q("YES"),
        "EXTRA_PREC": _q("YES"),
    }


def fetch_text(params: dict[str, str]) -> str:
    url = API + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    with urllib.request.urlopen(url, timeout=120) as r:
        payload = json.loads(r.read().decode())
    if "error" in payload:
        raise RuntimeError(f"Horizons error: {payload['error']}")
    return payload["result"]


def parse_observer_csv(text: str) -> tuple[list[float], list[float], list[float]]:
    """Return (az, el, angular_diameter_arcsec) from a CSV observer table.

    Columns are found by header name, so the parser survives Horizons adding or moving columns.
    """
    lines = text.splitlines()
    try:
        soe = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
        eoe = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    except StopIteration:
        raise RuntimeError("No $$SOE/$$EOE block in Horizons output:\n" + text[:2000])
    header = next(l for l in reversed(lines[:soe]) if "Azi" in l and "Elev" in l)
    cols = [c.strip() for c in header.split(",")]
    i_az = next(i for i, c in enumerate(cols) if c.startswith("Azi"))
    i_el = next(i for i, c in enumerate(cols) if c.startswith("Elev"))
    i_ad = next((i for i, c in enumerate(cols) if c.startswith("Ang-diam")), None)
    az, el, ad = [], [], []
    for row in lines[soe + 1:eoe]:
        f = [c.strip() for c in row.split(",")]
        az.append(float(f[i_az]))
        el.append(float(f[i_el]))
        if i_ad is not None and f[i_ad] not in ("", "n.a."):
            ad.append(float(f[i_ad]))
    return az, el, ad


def compute(lat: float, lon: float, start: datetime, end: datetime, step_min: int,
            height_m: float = 2.0, site_key: str | None = None) -> dict:
    out: dict = {}
    radii: dict[str, float] = {}
    count = None
    for key, body in BODIES.items():
        text = fetch_text(build_params(body, lat, lon, start, end, step_min, height_m))
        az, el, ad = parse_observer_csv(text)
        if count is not None and len(az) != count:
            raise RuntimeError(f"sample count mismatch: {key} has {len(az)}, expected {count}")
        count = len(az)
        out[key] = {"az": [round(a % 360.0, 3) for a in az], "el": [round(e, 3) for e in el]}
        # angular diameter (arcsec) -> radius (deg); fall back to nominal values
        radii[key] = (sum(ad) / len(ad) / 2 / 3600) if ad else (0.267 if key == "sun" else 0.95)
        time.sleep(PAUSE_S)

    start_ms = int(start.replace(tzinfo=timezone.utc).timestamp() * 1000)
    return {
        "siteKey": site_key or f"{lat},{lon}",
        "startMs": start_ms,
        "stepMin": step_min,
        "count": count,
        "sun": out["sun"],
        "earth": out["earth"],
        "sunRadiusDeg": round(radii["sun"], 4),
        "earthRadiusDeg": round(radii["earth"], 4),
        "source": "JPL Horizons API (apparent az/el, coord@301)",
    }


def _parse_date(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "")).replace(tzinfo=None)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--step-min", type=int, default=60)
    ap.add_argument("--out", default="-")
    a = ap.parse_args()
    res = compute(a.lat, a.lon, _parse_date(a.start), _parse_date(a.end), a.step_min)
    if a.out == "-":
        i = res["count"] // 2
        print(f"{res['count']} samples; mid-range Sun az/el {res['sun']['az'][i]}/{res['sun']['el'][i]}, "
              f"Earth az/el {res['earth']['az'][i]}/{res['earth']['el'][i]}; "
              f"radii sun {res['sunRadiusDeg']} earth {res['earthRadiusDeg']}")
    else:
        Path(a.out).write_text(json.dumps(res, separators=(",", ":")))

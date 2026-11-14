"""Sub-Earth and sub-solar points on the Moon from JPL Horizons, and the geometry that turns
them into topocentric azimuth/elevation at any lunar site.

Why sub-points instead of one Horizons query per site: the direction to the Sun and Earth from a
site depends only on where those bodies stand over the Moon (their sub-points, in the Moon-fixed
Mean Earth frame) and how far away they are. One Horizons request for the whole date range
therefore serves every site, including custom coordinates typed into the app, with no further
network access. `validate.py` checks this against direct `coord@301` Horizons queries.

Request: target = Moon (301), observer = geocentre (500@399), quantities
  14  observer sub-longitude / sub-latitude   -> sub-Earth point (east-positive)
  15  Sun sub-longitude / sub-latitude        -> sub-solar point
  19  heliocentric range r (au)               -> Sun distance
  20  observer range delta (au)               -> Earth distance
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np

from horizons_api import _q, fetch_text

AU_KM = 149_597_870.7
R_MOON_KM = 1737.4


def fetch_subpoints(start: datetime, end: datetime, step_min: int = 60) -> dict:
    params = {
        "format": "json",
        "COMMAND": _q("301"),
        "OBJ_DATA": _q("NO"),
        "MAKE_EPHEM": _q("YES"),
        "EPHEM_TYPE": _q("OBSERVER"),
        "CENTER": _q("500@399"),
        "START_TIME": _q(start.strftime("%Y-%m-%d %H:%M")),
        "STOP_TIME": _q(end.strftime("%Y-%m-%d %H:%M")),
        "STEP_SIZE": _q(f"{step_min}m"),
        "TIME_TYPE": _q("UT"),
        "QUANTITIES": _q("14,15,19,20"),
        "ANG_FORMAT": _q("DEG"),
        "CSV_FORMAT": _q("YES"),
        "EXTRA_PREC": _q("YES"),
    }
    text = fetch_text(params)
    lines = text.splitlines()
    soe = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
    eoe = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    header = next(l for l in reversed(lines[:soe]) if "ObsSub-LON" in l)
    cols = [c.strip() for c in header.split(",")]
    ix = {name: cols.index(name) for name in
          ("ObsSub-LON", "ObsSub-LAT", "SunSub-LON", "SunSub-LAT", "r", "delta")}
    out = {k: [] for k in ("eLon", "eLat", "sLon", "sLat", "sunAu", "earthKm")}
    for row in lines[soe + 1:eoe]:
        f = [c.strip() for c in row.split(",")]
        out["eLon"].append(float(f[ix["ObsSub-LON"]]))
        out["eLat"].append(float(f[ix["ObsSub-LAT"]]))
        out["sLon"].append(float(f[ix["SunSub-LON"]]))
        out["sLat"].append(float(f[ix["SunSub-LAT"]]))
        out["sunAu"].append(float(f[ix["r"]]))
        out["earthKm"].append(float(f[ix["delta"]]) * AU_KM)
    count = len(out["eLon"])
    return {
        "startMs": int(start.replace(tzinfo=timezone.utc).timestamp() * 1000),
        "stepMin": step_min,
        "count": count,
        "subEarth": {"lon": [round(v, 4) for v in out["eLon"]], "lat": [round(v, 4) for v in out["eLat"]]},
        "subSun": {"lon": [round(v, 4) for v in out["sLon"]], "lat": [round(v, 4) for v in out["sLat"]]},
        "earthDistKm": [round(v, 1) for v in out["earthKm"]],
        "sunDistAu": [round(v, 6) for v in out["sunAu"]],
        "source": "JPL Horizons (DE441), Moon sub-observer / sub-solar points, geocentric observer",
    }


def _unit(lat_deg, lon_deg):
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def topocentric(site_lat: float, site_lon: float, site_alt_km: float,
                sub_lat, sub_lon, dist_km):
    """Azimuth (deg from north, clockwise) and elevation (deg above the local horizontal plane)
    of a body with the given sub-point and distance, seen from a lunar site. Parallax included."""
    up = _unit(site_lat, site_lon)
    la, lo = math.radians(site_lat), math.radians(site_lon)
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    north = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    body = _unit(np.asarray(sub_lat, float), np.asarray(sub_lon, float)) * np.asarray(dist_km, float)[..., None]
    d = body - up * (R_MOON_KM + site_alt_km)
    e, n, u = d @ east, d @ north, d @ up
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arctan2(u, np.hypot(e, n)))
    return az, el

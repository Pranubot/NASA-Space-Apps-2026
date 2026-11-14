"""Validation #1: sub-point geometry vs direct JPL Horizons topocentric queries.

For a handful of sites, ask Horizons directly for the apparent azimuth/elevation of the Sun and
Earth from `coord@301`, and compare with what the app computes from the published sub-points
(app/public/data/ephemeris.json). Writes app/public/data/validation.json, which the app shows in
its Data sources panel.

    python validate.py
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from horizons_api import compute
from subpoints import AU_KM, topocentric

OUT = Path(__file__).parent.parent / "app" / "public" / "data"
CASES = [
    ("apollo-11", "Apollo 11", 0.67416, 23.47314),
    ("connecting-ridge", "Connecting Ridge", -89.45, -137.31),
    ("malapert-massif", "Malapert Massif", -85.964, -2.319),
    ("change-4", "Chang'e 4", -45.444, 177.599),
]
START = datetime(2027, 6, 1)
HOURS = 72


def angdiff(a, b):
    return (np.asarray(a) - np.asarray(b) + 180.0) % 360.0 - 180.0


def main() -> None:
    eph = json.loads((OUT / "ephemeris.json").read_text())
    i0 = int((START.replace(tzinfo=timezone.utc).timestamp() * 1000 - eph["startMs"]) / (eph["stepMin"] * 60000))
    sl = slice(i0, i0 + HOURS + 1)
    rows = []
    for sid, name, lat, lon in CASES:
        ref = compute(lat, lon, START, START + timedelta(hours=HOURS), 60, height_m=0.0, site_key=sid)
        s_az, s_el = topocentric(lat, lon, 0.0, eph["subSun"]["lat"][sl], eph["subSun"]["lon"][sl],
                                 np.array(eph["sunDistAu"][sl]) * AU_KM)
        e_az, e_el = topocentric(lat, lon, 0.0, eph["subEarth"]["lat"][sl], eph["subEarth"]["lon"][sl],
                                 eph["earthDistKm"][sl])
        # azimuth error is scaled by cos(el) so it is a true on-sky angle
        row = {
            "id": sid, "name": name, "lat": lat, "lon": lon, "samples": HOURS + 1,
            "sunElMaxErrDeg": round(float(np.max(np.abs(s_el - ref["sun"]["el"]))), 4),
            "sunAzMaxErrDeg": round(float(np.max(np.abs(angdiff(s_az, ref["sun"]["az"]) * np.cos(np.radians(s_el))))), 4),
            "earthElMaxErrDeg": round(float(np.max(np.abs(e_el - ref["earth"]["el"]))), 4),
            "earthAzMaxErrDeg": round(float(np.max(np.abs(angdiff(e_az, ref["earth"]["az"]) * np.cos(np.radians(e_el))))), 4),
            "example": {
                "utc": START.strftime("%Y-%m-%d %H:%M"),
                "horizonsSun": [ref["sun"]["az"][0], ref["sun"]["el"][0]],
                "appSun": [round(float(s_az[0]), 3), round(float(s_el[0]), 3)],
                "horizonsEarth": [ref["earth"]["az"][0], ref["earth"]["el"][0]],
                "appEarth": [round(float(e_az[0]), 3), round(float(e_el[0]), 3)],
            },
        }
        rows.append(row)
        print(f"{name:<18} sun el {row['sunElMaxErrDeg']:.4f} az {row['sunAzMaxErrDeg']:.4f} | "
              f"earth el {row['earthElMaxErrDeg']:.4f} az {row['earthAzMaxErrDeg']:.4f}  (max abs error, deg)")
    out = {
        "method": "App geometry from Horizons sub-points vs direct Horizons coord@301 apparent az/el, hourly over 72 h",
        "startUtc": START.strftime("%Y-%m-%d"),
        "cases": rows,
    }
    (OUT / "validation.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

"""Build every static data file the web app reads (app/public/data).

    python export_static.py                 # everything
    python export_static.py --skip-ephem    # terrain only (no network)
    python export_static.py --skip-terrain  # ephemeris only

Outputs
  ephemeris.json        Horizons sub-Earth / sub-solar points, hourly, whole published range
  sites.json            curated sites + DEM elevation
  horizons.json         LOLA terrain horizon for every curated site (0.25 deg azimuth steps)
  dem/{id}.bin          Int16 local terrain patch per site (DN = metres * 2), for the 3D view
  dem/polar_400m.bin    Int16 south-polar stereographic DEM, 400 m/px (custom sites, live shadow map)
  dem/global_4ppd.bin   Int16 global DEM, 4 px/deg (custom non-polar sites)
  textures/moon_2k.jpg  LROC WAC colour mosaic (NASA SVS CGI Moon Kit)
  textures/earth_1k.jpg Blue Marble (NASA SVS)
  manifest.json         ranges, grid descriptions and provenance strings
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np

from lola import Moon, RAW, horizon_profile, local_patch

HERE = Path(__file__).parent
OUT = HERE.parent / "app" / "public" / "data"

EPHEM_START = datetime(2026, 11, 1)
EPHEM_END = datetime(2031, 1, 1)
AZ_STEP = 0.25
POLAR_PATCH = (512, 160.0)   # n, metres per pixel  -> 82 km square
GLOBAL_PATCH = (256, 480.0)  # -> 123 km square


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.relative_to(OUT.parent.parent)}  {path.stat().st_size / 1024:.0f} KB")


def export_ephemeris() -> dict:
    from subpoints import fetch_subpoints
    print("Horizons sub-points ...")
    eph = fetch_subpoints(EPHEM_START, EPHEM_END, 60)
    write_json(OUT / "ephemeris.json", eph)
    return {"startMs": eph["startMs"], "stepMin": eph["stepMin"], "count": eph["count"], "source": eph["source"]}


def export_terrain() -> dict:
    moon = Moon()
    sites = json.loads((HERE / "sites.json").read_text(encoding="utf-8"))["sites"]
    horizons = {}
    patches = {}
    (OUT / "dem").mkdir(parents=True, exist_ok=True)
    for s in sites:
        elev, dist, site_h = horizon_profile(moon, s["lat"], s["lon"], AZ_STEP)
        s["elevationM"] = round(site_h, 1)
        horizons[s["id"]] = {
            "siteKey": s["id"],
            "azStepDeg": AZ_STEP,
            "elevationDeg": [round(float(v), 3) for v in elev],
            "distKm": [round(float(v), 1) for v in dist],
            "observerHeightM": 2.0,
            "maxRangeKm": 400,
            "source": f"{moon.source_for(s['lat'])} ray-cast",
        }
        n, px = POLAR_PATCH if s["lat"] < -80.6 else GLOBAL_PATCH
        patch = local_patch(moon, s["lat"], s["lon"], n, px)
        dn = np.clip(np.round(patch * 2.0), -32768, 32767).astype("<i2")
        (OUT / "dem" / f"{s['id']}.bin").write_bytes(dn.tobytes())
        patches[s["id"]] = {"n": n, "pixelM": px, "minM": float(patch.min()), "maxM": float(patch.max()),
                            "source": moon.source_for(s["lat"])}
        print(f"  {s['id']:<20} elev {site_h:8.1f} m   horizon {elev.min():6.2f} .. {elev.max():6.2f} deg")

    write_json(OUT / "sites.json", {
        "source": "Curated from published mission coordinates and Artemis III candidate regions; elevations from LOLA",
        "sites": sites,
    })
    # bundled copy so the app still has a site list when no data files can be fetched
    (OUT.parent.parent / "src" / "data" / "sites.fallback.json").write_text(
        (OUT / "sites.json").read_text(encoding="utf-8"), encoding="utf-8")
    write_json(OUT / "horizons.json", {"source": "LOLA GDR ray-cast, 2 m observer, no refraction", "horizons": horizons})

    # Browser-side DEMs: block means of the PDS grids.
    polar = np.asarray(moon.polar.data, dtype=np.float32).reshape(1520, 5, 1520, 5).mean(axis=(1, 3))
    (OUT / "dem" / "polar_400m.bin").write_bytes(np.round(polar).astype("<i2").tobytes())
    g16 = np.memmap(RAW / "LDEM_16.IMG", dtype="<i2", mode="r", shape=(2880, 5760))
    g4 = np.asarray(g16, dtype=np.float32).reshape(720, 4, 1440, 4).mean(axis=(1, 3))
    (OUT / "dem" / "global_4ppd.bin").write_bytes(np.round(g4).astype("<i2").tobytes())
    print("  dem/polar_400m.bin, dem/global_4ppd.bin")

    export_textures()
    return {
        "patches": patches,
        "polarDem": {"file": "dem/polar_400m.bin", "n": 1520, "pixelM": 400.0, "minLat": -80.0,
                     "source": "LOLA LDEM_80S_80M, 5x5 block mean"},
        "globalDem": {"file": "dem/global_4ppd.bin", "w": 1440, "h": 720, "ppd": 4,
                      "source": "LOLA LDEM_16, 4x4 block mean"},
    }


def export_textures() -> None:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    tex = OUT / "textures"
    tex.mkdir(parents=True, exist_ok=True)
    moon_src = RAW / "lroc_color_poles_4k.tif"
    if moon_src.exists():
        Image.open(moon_src).convert("RGB").resize((2048, 1024), Image.LANCZOS).save(tex / "moon_2k.jpg", quality=86)
    earth_src = HERE / "raw_earth" / "earth2.jpg"
    if earth_src.exists():
        Image.open(earth_src).convert("RGB").resize((1024, 512), Image.LANCZOS).save(tex / "earth_1k.jpg", quality=84)
    print("  textures/")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-ephem", action="store_true")
    ap.add_argument("--skip-terrain", action="store_true")
    a = ap.parse_args()

    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if not a.skip_ephem:
        manifest["ephemeris"] = export_ephemeris()
    if not a.skip_terrain:
        manifest["terrain"] = export_terrain()
    manifest["generated"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")
    write_json(manifest_path, manifest)

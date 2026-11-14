"""LOLA gridded elevation access, terrain-horizon ray casting and local terrain patches.

Two PDS products are combined so any site on the Moon can be sampled:
  * LDEM_80S_80M  south-polar stereographic, 80 m/px, covers 80S..90S
  * LDEM_64       simple cylindrical, 64 px/deg (~474 m/px at the equator), global
Both store DN = height / 0.5 m above the 1737.4 km reference sphere (int16, little endian).

No atmosphere means no refraction: the horizon is pure geometry on a sphere plus terrain.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

R_MOON = 1_737_400.0  # m
RAW = Path(__file__).parent / "raw"


class PolarDem:
    """South-polar stereographic grid. Longitude 0 points up, 90E to the right."""

    def __init__(self, path: Path, n: int = 7600, scale_m: float = 80.0):
        self.n = n
        self.scale = scale_m
        self.c = (n - 1) / 2.0
        self.data = np.memmap(path, dtype="<i2", mode="r", shape=(n, n))
        self.min_lat = -90.0 + np.degrees(2 * np.arctan(self.c * scale_m / (2 * R_MOON)))

    def rowcol(self, lat, lon):
        r = 2 * R_MOON * np.tan(np.radians(90.0 + lat) / 2.0)
        lam = np.radians(lon)
        return self.c - r * np.cos(lam) / self.scale, self.c + r * np.sin(lam) / self.scale

    def sample(self, lat, lon):
        row, col = self.rowcol(np.asarray(lat, float), np.asarray(lon, float))
        return _bilinear(self.data, row, col, wrap=False)


class GlobalDem:
    """Simple cylindrical grid, longitudes 0..360 east, row 0 at +90."""

    def __init__(self, path: Path, ppd: int):
        self.ppd = ppd
        self.h, self.w = 180 * ppd, 360 * ppd
        self.data = np.memmap(path, dtype="<i2", mode="r", shape=(self.h, self.w))

    def sample(self, lat, lon):
        lat = np.asarray(lat, float)
        lon = np.mod(np.asarray(lon, float), 360.0)
        row = np.clip((90.0 - lat) * self.ppd - 0.5, 0, self.h - 1)
        col = lon * self.ppd - 0.5
        return _bilinear(self.data, row, col, wrap=True)


def _bilinear(data, row, col, wrap: bool):
    h, w = data.shape
    r0 = np.floor(row).astype(np.int64)
    c0 = np.floor(col).astype(np.int64)
    fr = row - r0
    fc = col - c0
    r0c = np.clip(r0, 0, h - 1)
    r1c = np.clip(r0 + 1, 0, h - 1)
    if wrap:
        c0c = np.mod(c0, w)
        c1c = np.mod(c0 + 1, w)
    else:
        c0c = np.clip(c0, 0, w - 1)
        c1c = np.clip(c0 + 1, 0, w - 1)
    a = data[r0c, c0c].astype(np.float64)
    b = data[r0c, c1c].astype(np.float64)
    c = data[r1c, c0c].astype(np.float64)
    d = data[r1c, c1c].astype(np.float64)
    return ((a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr) * 0.5


class Moon:
    """Best-available elevation at any lat/lon (metres above the reference sphere)."""

    def __init__(self, raw: Path = RAW):
        self.polar = PolarDem(raw / "LDEM_80S_80M.IMG")
        g64 = raw / "LDEM_64.IMG"
        self.globe = GlobalDem(g64, 64) if g64.exists() else GlobalDem(raw / "LDEM_16.IMG", 16)
        # small margin so bilinear taps never leave the polar grid
        self.polar_limit = self.polar.min_lat - 0.02

    def elevation(self, lat, lon):
        lat = np.asarray(lat, float)
        lon = np.asarray(lon, float)
        out = np.empty(np.broadcast(lat, lon).shape, float)
        lat_b, lon_b = np.broadcast_arrays(lat, lon)
        m = lat_b < self.polar_limit
        if m.any():
            out[m] = self.polar.sample(lat_b[m], lon_b[m])
        if (~m).any():
            out[~m] = self.globe.sample(lat_b[~m], lon_b[~m])
        return out

    def source_for(self, lat: float) -> str:
        if lat < self.polar_limit:
            return "LOLA LDEM_80S_80M + LDEM_64"
        return f"LOLA LDEM_{self.globe.ppd}"


def destination(lat, lon, az_deg, dist_m):
    """Great-circle destination from (lat, lon) along azimuth az (deg from north, clockwise)."""
    p1 = np.radians(lat)
    l1 = np.radians(lon)
    az = np.radians(az_deg)
    th = np.asarray(dist_m) / R_MOON
    sp2 = np.sin(p1) * np.cos(th) + np.cos(p1) * np.sin(th) * np.cos(az)
    p2 = np.arcsin(np.clip(sp2, -1, 1))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(th) * np.cos(p1), np.cos(th) - np.sin(p1) * sp2)
    return np.degrees(p2), np.degrees(l2)


def ray_distances(max_range_m: float = 400_000.0) -> np.ndarray:
    """40 m steps out to 10 km, then steps of 0.4 % of range."""
    near = np.arange(40.0, 10_000.0, 40.0)
    far = [10_000.0]
    while far[-1] < max_range_m:
        far.append(far[-1] * 1.004)
    return np.concatenate([near, np.array(far)])


def horizon_profile(moon: Moon, lat: float, lon: float, az_step: float = 0.25,
                    observer_height_m: float = 2.0, max_range_m: float = 400_000.0):
    """Terrain horizon elevation angle for every azimuth.

    For a terrain point at great-circle angle theta and radius r_t seen from radius r_o:
        elevation = atan2(r_t cos(theta) - r_o, r_t sin(theta))
    which contains the curvature drop exactly. Returns (elev_deg[], dist_km[], site_elev_m).
    """
    site_h = float(moon.elevation(lat, lon))
    r_o = R_MOON + site_h + observer_height_m
    d = ray_distances(max_range_m)
    az = np.arange(0.0, 360.0, az_step)
    theta = d / R_MOON
    elev = np.empty(az.size)
    dist = np.empty(az.size)
    chunk = 180
    for i in range(0, az.size, chunk):
        a = az[i:i + chunk, None]
        plat, plon = destination(lat, lon, a, d[None, :])
        r_t = R_MOON + moon.elevation(plat, plon)
        ang = np.degrees(np.arctan2(r_t * np.cos(theta) - r_o, r_t * np.sin(theta)))
        k = np.argmax(ang, axis=1)
        elev[i:i + chunk] = ang[np.arange(ang.shape[0]), k]
        dist[i:i + chunk] = d[k] / 1000.0
    return elev, dist, site_h


def local_patch(moon: Moon, lat: float, lon: float, n: int, pixel_m: float) -> np.ndarray:
    """n x n elevation grid on the local tangent plane. Row 0 = north edge, col 0 = west edge."""
    half = (n - 1) / 2.0
    east = (np.arange(n) - half) * pixel_m
    north = (half - np.arange(n)) * pixel_m
    e, nn = np.meshgrid(east, north)
    az = np.degrees(np.arctan2(e, nn))
    d = np.hypot(e, nn)
    plat, plon = destination(lat, lon, az, d)
    return moon.elevation(plat, plon)

"""Offline checks for the pipeline maths and the Horizons CSV parser.  Run:  python -m pytest"""
import numpy as np

from horizons_api import build_params, parse_observer_csv
from lola import R_MOON, destination, ray_distances
from subpoints import topocentric

SAMPLE = """
 Date__(UT)__HR:MN, , ,Azimuth_(a-app), Elevation_(a-app),  Ang-diam,             delta,     deldot,
****************************************************************************************************
$$SOE
 2027-Jan-01 00:00, ,i,  288.479188430,      72.822184903,  6749.016,  0.00260616814468,  0.0578125,
 2027-Jan-01 01:00, ,i,  288.548047939,      72.793567308,  6745.426,  0.00260755514679,  0.0574494,
$$EOE
"""


def test_parser_reads_columns_by_name():
    az, el, ad = parse_observer_csv(SAMPLE)
    assert az == [288.47918843, 288.548047939]
    assert el[0] == 72.822184903
    assert abs(ad[0] / 2 / 3600 - 0.937) < 0.01  # Earth's angular radius from the Moon, deg


def test_request_uses_east_longitude_and_site_on_the_moon():
    from datetime import datetime
    p = build_params("10", -89.45, -137.31, datetime(2027, 1, 1), datetime(2027, 1, 2), 60, 0.0)
    assert p["CENTER"] == "'coord@301'"
    assert p["SITE_COORD"].startswith("'222.69")


def test_topocentric_zenith_and_horizon():
    az, el = topocentric(10.0, 20.0, 0.0, [10.0], [20.0], [384400.0])
    assert abs(el[0] - 90) < 1e-6
    az, el = topocentric(0.0, 0.0, 0.0, [0.0], [90.0], [1.5e8])
    assert abs(az[0] - 90) < 1e-6 and abs(el[0]) < 0.01


def test_destination_distance_round_trip():
    lat, lon = destination(-89.0, 30.0, 77.0, 25_000.0)
    a = np.radians([-89.0, 30.0]); b = np.radians([lat, lon])
    c = np.sin(a[0]) * np.sin(b[0]) + np.cos(a[0]) * np.cos(b[0]) * np.cos(a[1] - b[1])
    assert abs(R_MOON * np.arccos(c) - 25_000.0) < 0.01


def test_ray_steps_are_fine_near_and_reach_far():
    d = ray_distances()
    assert d[0] == 40.0 and d[-1] >= 400_000.0
    assert np.all(np.diff(d) > 0)

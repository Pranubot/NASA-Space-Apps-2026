"""Download the raw NASA products the pipeline needs (about 700 MB, not committed).

    python fetch_data.py

  raw/LDEM_80S_80M.IMG   LOLA south-polar DEM, 80 m/px          115 MB   PDS LOLA GDR
  raw/LDEM_64.IMG        LOLA global DEM, 64 px/deg             531 MB   PDS LOLA GDR
  raw/LDEM_16.IMG        LOLA global DEM, 16 px/deg              33 MB   PDS LOLA GDR
  raw/lroc_color_poles_4k.tif   LROC WAC colour mosaic           13 MB   NASA SVS CGI Moon Kit (4720)
  raw_earth/earth2.jpg   Blue Marble                            1.5 MB   NASA SVS (2915)
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
LOLA = "https://imbrium.mit.edu/DATA/LOLA_GDR"
FILES = [
    (f"{LOLA}/POLAR/IMG/LDEM_80S_80M.IMG", "raw/LDEM_80S_80M.IMG"),
    (f"{LOLA}/POLAR/IMG/LDEM_80S_80M.LBL", "raw/LDEM_80S_80M.LBL"),
    (f"{LOLA}/CYLINDRICAL/IMG/LDEM_64.IMG", "raw/LDEM_64.IMG"),
    (f"{LOLA}/CYLINDRICAL/IMG/LDEM_64.LBL", "raw/LDEM_64.LBL"),
    (f"{LOLA}/CYLINDRICAL/IMG/LDEM_16.IMG", "raw/LDEM_16.IMG"),
    (f"{LOLA}/CYLINDRICAL/IMG/LDEM_16.LBL", "raw/LDEM_16.LBL"),
    ("https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif", "raw/lroc_color_poles_4k.tif"),
    ("https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png", "raw_earth/earth2.jpg"),
]

if __name__ == "__main__":
    for url, rel in FILES:
        dest = HERE / rel
        if dest.exists() and dest.stat().st_size > 0:
            print(f"have  {rel}")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"fetch {rel} ...", flush=True)
        urllib.request.urlretrieve(url, dest)
    print("done. Next: python export_static.py && python validate.py")

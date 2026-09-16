"""Analiza la forma del distrito y lista anclas reales de OSM para ubicar las zonas."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"


def load(name):
    p = RAW / name
    if not p.exists():
        return []
    d = json.loads(p.read_text(encoding="utf-8-sig"))
    return d["elements"] if isinstance(d, dict) else d


def center(el):
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    c = el.get("center")
    if c:
        return c["lat"], c["lon"]
    return None


def main() -> int:
    fc = json.loads((ROOT / "data" / "comas_zonas.geojson").read_text(encoding="utf-8"))
    dist = json.loads((ROOT / "data" / "comas_distrito.geojson").read_text(encoding="utf-8"))
    ring = dist["features"][0]["geometry"]["coordinates"][0]

    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    w, e, s, n = min(lons), max(lons), min(lats), max(lats)
    print(f"BBox real del distrito: W={w:.5f} E={e:.5f}  S={s:.5f} N={n:.5f}")
    print(f"Ancho E-O: {(e - w) * 111.32 * 0.978:.2f} km   Alto N-S: {(n - s) * 110.57:.2f} km")

    # --- Mapa ASCII: marca distrito (#), semillas de zona (digitos) ---
    COLS, ROWS = 96, 40
    grid = [[" "] * COLS for _ in range(ROWS)]

    def inside(lon, lat, pg=None):
        from shapely.geometry import Point, Polygon
        pg = pg or Polygon(ring)
        return pg.contains(Point(lon, lat))

    poly = None
    from shapely.geometry import Polygon, Point
    poly = Polygon(ring)

    for r in range(ROWS):
        lat = n - (r + 0.5) / ROWS * (n - s)
        for c in range(COLS):
            lon = w + (c + 0.5) / COLS * (e - w)
            if inside(lon, lat, poly):
                grid[r][c] = "."

    def plot(lat, lon, ch):
        c = int((lon - w) / (e - w) * COLS)
        r = int((n - lat) / (n - s) * ROWS)
        if 0 <= r < ROWS and 0 <= c < COLS:
            grid[r][c] = ch

    for f in fc["features"]:
        z = f["properties"]["zona"]
        lat, lon = f["properties"]["centro"]
        plot(lat, lon, z[1] if z[0] == "0" else z[0])

    print("\nMapa ASCII del distrito ('.'=Comas, digito=centroide actual de la zona):")
    print("   +" + "-" * COLS + "+")
    for r, row in enumerate(grid):
        lat = n - (r + 0.5) / ROWS * (n - s)
        print(f"{lat:8.4f}|" + "".join(row) + "|")
    print("   +" + "-" * COLS + "+")
    print("    " + " " * 4 + f"{w:.4f}" + " " * (COLS - 24) + f"{e:.4f}")

    # --- Anclas reales ---
    places = load("osm_places.json")
    print("\n=== LUGARES CON NOMBRE (place / landuse=residential), muestra ===")
    seen = set()
    for el in sorted(places, key=lambda x: (x.get("tags", {}).get("place", ""), x.get("tags", {}).get("name", ""))):
        t = el.get("tags", {})
        nm = t.get("name")
        if not nm or nm in seen:
            continue
        seen.add(nm)
        c = center(el)
        if c:
            print(f"  {t.get('place') or t.get('landuse') or '-':<15} {nm[:44]:<45} {c[0]:.5f},{c[1]:.5f}")

    print(f"\nTotal lugares unicos: {len(seen)}")

    lms = load("osm_landmarks.json")
    print("\n=== HITOS RELEVANTES ===")
    WANT = ("hospital", "clinic", "police", "fire_station", "cemetery", "marketplace",
            "townhall", "community_centre", "university", "college", "bus_station", "archaeological_site")
    for el in lms:
        t = el.get("tags", {})
        kind = t.get("amenity") or t.get("landuse") or t.get("historic") or t.get("leisure")
        nm = t.get("name")
        if not nm or kind not in WANT:
            continue
        c = center(el)
        if c:
            print(f"  {kind:<20} {nm[:46]:<47} {c[0]:.5f},{c[1]:.5f}")

    print("\n=== PARQUES Y AREAS VERDES (top 15 por nombre) ===")
    n = 0
    for el in lms:
        t = el.get("tags", {})
        if t.get("leisure") in ("park", "garden") and t.get("name"):
            c = center(el)
            if c:
                print(f"  {t.get('leisure'):<8} {t['name'][:50]:<51} {c[0]:.5f},{c[1]:.5f}")
                n += 1
                if n >= 15:
                    break

    print("\n=== VIAS PRINCIPALES CON NOMBRE (unicas) ===")
    vias = sorted({el.get("tags", {}).get("name") for el in load("osm_vias.json")
                   if el.get("tags", {}).get("name")})
    for v in vias:
        print(f"  {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

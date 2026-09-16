"""Obtiene los limites reales de los distritos vecinos de Comas para fijar la orientacion.

El texto oficial de la Municipalidad de Comas etiqueta mal el Este/Oeste en varias zonales
(por ejemplo pone Los Olivos al Este y San Juan de Lurigancho al Oeste). Este script
determina la orientacion REAL comparando los centroides de los distritos vecinos.
"""
from __future__ import annotations

import io
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
UA = "OjoComas-Prototype/1.0 (prototipo ciudadano de demostracion; datos OSM)"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

VECINOS = ["Los Olivos", "Independencia", "San Juan de Lurigancho", "Carabayllo", "Puente Piedra"]
NAMES = "|".join(VECINOS)
QUERY = f"""
[out:json][timeout:180];
(
  relation["boundary"="administrative"]["admin_level"="8"]["name"~"^({NAMES})$"](-12.10,-77.20,-11.80,-76.90);
);
out geom;
"""


def fetch(query: str) -> dict | None:
    body = urlencode({"data": query}).encode()
    for endpoint in ENDPOINTS * 2:
        try:
            req = Request(endpoint, data=body, headers={"User-Agent": UA,
                          "Content-Type": "application/x-www-form-urlencoded"})
            with urlopen(req, timeout=200) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            print(f"  fallo {endpoint}: {type(exc).__name__} {exc}", file=sys.stderr)
        time.sleep(4)
    return None


def ring_from_members(members):
    frags = [[(p["lat"], p["lon"]) for p in m["geometry"]]
             for m in members if m.get("type") == "way" and m.get("geometry")]
    rings, pool = [], [list(f) for f in frags]
    while pool:
        ring = pool.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, frag in enumerate(pool):
                if frag[0] == ring[-1]:
                    ring.extend(frag[1:]); pool.pop(i); changed = True; break
                if frag[-1] == ring[-1]:
                    ring.extend(list(reversed(frag))[1:]); pool.pop(i); changed = True; break
                if frag[-1] == ring[0]:
                    ring[:0] = frag[:-1]; pool.pop(i); changed = True; break
                if frag[0] == ring[0]:
                    ring[:0] = list(reversed(frag))[:-1]; pool.pop(i); changed = True; break
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        rings.append(ring)
    return rings


def main() -> int:
    print("Consultando vecinos de Comas en OSM...")
    data = fetch(QUERY)
    if data is None:
        print("FALLO la descarga", file=sys.stderr)
        return 1
    (RAW / "osm_vecinos.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    comas = json.loads((ROOT / "data" / "comas_distrito.geojson").read_text(encoding="utf-8"))
    cring = comas["features"][0]["geometry"]["coordinates"][0]
    cpoly = Polygon(cring)
    cc = cpoly.centroid

    print(f"\nComas centroid: {cc.y:.5f},{cc.x:.5f}")
    print(f"Comas bbox: lon {cpoly.bounds[0]:.5f}..{cpoly.bounds[2]:.5f} lat {cpoly.bounds[1]:.5f}..{cpoly.bounds[3]:.5f}\n")
    print(f"{'Distrito':<24}{'centroid lat,lon':<24}{'dLon(km)':>10}{'dLat(km)':>10}  orientacion")

    results = {}
    for el in data["elements"]:
        name = el.get("tags", {}).get("name")
        rings = ring_from_members(el["members"])
        if not rings:
            continue
        polys = [Polygon([(lon, lat) for lat, lon in r]) for r in rings if len(r) > 3]
        merged = unary_union(polys)
        big = max(merged.geoms, key=lambda g: g.area) if hasattr(merged, "geoms") else merged
        g = big.centroid
        dlon = (g.x - cc.x) * 111.32 * 0.978
        dlat = (g.y - cc.y) * 110.57
        orient = []
        if dlon > 1.0:
            orient.append("ESTE")
        elif dlon < -1.0:
            orient.append("OESTE")
        if dlat > 1.0:
            orient.append("NORTE")
        elif dlat < -1.0:
            orient.append("SUR")
        results[name] = (round(g.y, 5), round(g.x, 5), round(dlon, 2), round(dlat, 2), "+".join(orient) or "centro")
        print(f"{name:<24}{f'{g.y:.5f},{g.x:.5f}':<24}{dlon:>10.2f}{dlat:>10.2f}  {'+'.join(orient) or 'centro'}")

        # Cuanto del perimetro de Comas toca este vecino
        try:
            inter = cpoly.boundary.intersection(big.buffer(0.0008))
            if not inter.is_empty:
                print(f"{'':24}frontera compartida: {inter.length * 111.0:.2f} km aprox")
        except Exception:
            pass

    print("\n=== ORIENTACION REAL (para corregir el texto municipal) ===")
    for k, v in results.items():
        print(f"  {k}: {v[4]}  (dLon {v[2]} km, dLat {v[3]} km)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

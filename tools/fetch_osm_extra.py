"""Descarga datos geoespaciales reales de Comas desde Overpass (OSM).

Salidas en data/raw/:
  osm_subdivisiones.json  -> relaciones admin_level 9/10/11 dentro de Comas
  osm_places.json         -> barrios / urbanizaciones / asentamientos con nombre
  osm_landmarks.json      -> parques, hospitales, comisarias, mercados, cementerio, etc.
  osm_vias.json           -> avenidas principales (primary/secondary)
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
RAW.mkdir(parents=True, exist_ok=True)

COMAS_RELATION = 1944720
AREA_ID = 3600000000 + COMAS_RELATION
UA = "OjoComas-Prototype/1.0 (prototipo ciudadano de demostracion; datos OSM)"

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

QUERIES: dict[str, str] = {
    "osm_subdivisiones": f"""
[out:json][timeout:180];
area({AREA_ID})->.a;
rel["boundary"="administrative"]["admin_level"~"^(9|10|11)$"](area.a);
out tags center;
""",
    "osm_places": f"""
[out:json][timeout:180];
area({AREA_ID})->.a;
(
  node["place"~"^(neighbourhood|suburb|quarter|hamlet|city_block|isolated_dwelling)$"](area.a);
  way["place"~"^(neighbourhood|suburb|quarter|hamlet|city_block|isolated_dwelling)$"](area.a);
  node["landuse"="residential"]["name"](area.a);
  way["landuse"="residential"]["name"](area.a);
  way["residential"~"^(apartment|garages|terrace)$"]["name"](area.a);
);
out center tags;
""",
    "osm_landmarks": f"""
[out:json][timeout:180];
area({AREA_ID})->.a;
(
  nwr["leisure"~"^(park|garden|sports_centre|pitch|playground)$"]["name"](area.a);
  nwr["amenity"~"^(hospital|clinic|doctors|police|fire_station|cemetery|marketplace|townhall|community_centre|place_of_worship|school|college|university|bus_station|fuel|pharmacy|bank)$"]["name"](area.a);
  nwr["healthcare"="hospital"]["name"](area.a);
  nwr["landuse"="cemetery"]["name"](area.a);
  nwr["tourism"="attraction"]["name"](area.a);
  nwr["historic"~"^(archaeological_site|monument|ruins)$"]["name"](area.a);
);
out center tags;
""",
    "osm_vias": f"""
[out:json][timeout:180];
area({AREA_ID})->.a;
(
  way["highway"~"^(primary|secondary|tertiary)$"]["name"](area.a);
);
out center tags;
""",
}


def fetch(query: str, label: str) -> dict | None:
    body = urlencode({"data": query}).encode()
    for attempt, endpoint in enumerate(MIRRORS * 2, start=1):
        try:
            req = Request(
                endpoint,
                data=body,
                headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urlopen(req, timeout=200) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            print(f"  [{label}] OK via {endpoint} (intento {attempt}) -> {len(payload.get('elements', []))} elementos")
            return payload
        except HTTPError as exc:
            print(f"  [{label}] HTTP {exc.code} en {endpoint}", file=sys.stderr)
        except (URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            print(f"  [{label}] fallo en {endpoint}: {type(exc).__name__} {exc}", file=sys.stderr)
        time.sleep(3)
    print(f"  [{label}] TODOS LOS ESPEJOS FALLARON", file=sys.stderr)
    return None


def main() -> int:
    ok, failed = [], []
    for label, query in QUERIES.items():
        target = RAW / f"{label}.json"
        print(f"-> {label}")
        payload = fetch(query, label)
        if payload is None:
            failed.append(label)
            continue
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  guardado en {target.relative_to(ROOT)}")
        ok.append(label)
    print("\nRESUMEN:", {"ok": ok, "fallidos": failed})
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

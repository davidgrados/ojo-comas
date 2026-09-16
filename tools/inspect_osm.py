"""Inspecciona las relaciones OSM candidatas y reporta cual corresponde a Comas (Lima)."""
import io
import json
import statistics
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "comas_osm_overpass.json"

# Centro aproximado del distrito de Comas (Lima, Peru)
LIMA_COMAS = (-11.95, -77.05)


def main() -> int:
    data = json.loads(RAW.read_text(encoding="utf-8-sig"))
    # PowerShell guardo solo el array de elementos; soportamos ambas formas.
    elements = data["elements"] if isinstance(data, dict) else data
    for el in elements:
        tags = el.get("tags", {})
        print("=" * 72)
        print(f"id={el['id']}  name={tags.get('name')!r}  admin_level={tags.get('admin_level')}")
        interesting = {
            k: v
            for k, v in tags.items()
            if k
            in (
                "name", "official_name", "boundary", "admin_level", "type", "place",
                "addr:city", "addr:district", "addr:province", "addr:region",
                "ISO3166-2", "wikidata", "wikipedia", "ref", "INEI",
            )
        }
        print("tags:", json.dumps(interesting, ensure_ascii=False))

        members = el.get("members", [])
        with_geom = [m for m in members if m.get("geometry")]
        print(f"members={len(members)}  with_geometry={len(with_geom)}")
        print("roles:", sorted({m.get("role") or "(empty)" for m in members}))
        print("types:", sorted({m.get("type") for m in members}))

        lats = [p["lat"] for m in with_geom for p in m["geometry"]]
        lons = [p["lon"] for m in with_geom for p in m["geometry"]]
        if not lats:
            print("!! sin geometria")
            continue

        clat = statistics.mean([min(lats), max(lats)])
        clon = statistics.mean([min(lons), max(lons)])
        print(f"bbox lat {min(lats):.4f}..{max(lats):.4f}  (mid {clat:.4f})")
        print(f"bbox lon {min(lons):.4f}..{max(lons):.4f}  (mid {clon:.4f})")
        print(f"points={len(lats)}  closed_ways={sum(1 for m in with_geom if m['geometry'][0] == m['geometry'][-1])}")
        dist = ((clat - LIMA_COMAS[0]) ** 2 + (clon - LIMA_COMAS[1]) ** 2) ** 0.5
        print(f"distancia al centro de Comas-Lima: {dist:.4f} deg  -> {'MATCH' if dist < 0.15 else 'descartar'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

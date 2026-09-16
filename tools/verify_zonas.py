"""Verificacion topologica y visual (ASCII) de las 14 zonas generadas.

Comprueba:
  * contiguedad: cada zona debe ser un solo poligono (sin fragmentos sueltos)
  * cuadrante: la posicion cardinal real debe coincidir con la oficial
  * colindancias: que zonas comparten realmente frontera, comparado con el texto oficial
  * mapa ASCII con el relleno de cada zona
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

from shapely.geometry import Polygon, Point

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]

# Colindancias oficiales declaradas por la municipalidad (texto literal).
OFICIAL = {
    "01": {"norte": ["02", "06", "11"], "sur": [], "este": [], "oeste": []},
    "02": {"norte": ["13", "03"], "sur": ["01"], "este": ["11"], "oeste": []},
    "03": {"norte": ["04"], "sur": ["02", "13"], "este": [], "oeste": ["13"]},
    "04": {"norte": ["05", "09"], "sur": ["03", "10", "13"], "este": [], "oeste": ["10", "09"]},
    "05": {"norte": ["12", "08"], "sur": ["04"], "este": [], "oeste": ["09", "08"]},
    "06": {"norte": ["07", "13"], "sur": ["01", "11"], "este": ["11", "13"], "oeste": []},
    "07": {"norte": ["09", "10", "14"], "sur": ["06", "13"], "este": ["10", "13"], "oeste": ["14"]},
    "08": {"norte": [], "sur": ["09", "05"], "este": ["05"], "oeste": ["14"]},
    "09": {"norte": ["08"], "sur": ["04", "07", "10"], "este": ["05", "04", "10"], "oeste": ["14", "08"]},
    "10": {"norte": ["09", "04"], "sur": ["13", "07"], "este": ["04", "13"], "oeste": ["07", "09"]},
    "11": {"norte": ["13", "06"], "sur": ["01"], "este": ["01"], "oeste": ["06"]},
    "12": {"norte": [], "sur": [], "este": [], "oeste": ["05"]},
    "13": {"norte": ["04", "10"], "sur": ["02", "11", "06"], "este": ["03"], "oeste": ["06", "07", "10"]},
    "14": {"norte": [], "sur": ["07"], "este": ["08", "09"], "oeste": []},
}


def main() -> int:
    fc = json.loads((ROOT / "data" / "comas_zonas.geojson").read_text(encoding="utf-8"))
    dist = json.loads((ROOT / "data" / "comas_distrito.geojson").read_text(encoding="utf-8"))

    polys = {}
    for f in fc["features"]:
        g = f["geometry"]
        polys[f["properties"]["zona"]] = Polygon(g["coordinates"][0])

    dring = dist["features"][0]["geometry"]["coordinates"][0]
    dpoly = Polygon(dring)
    c = dpoly.centroid

    print("=== 1. CONTIGUIDAD (cada zona debe ser 1 solo poligono) ===")
    bad = []
    for z, p in sorted(polys.items()):
        if not p.is_valid:
            print(f"  Z{z}: POLIGONO INVALIDO")
            bad.append(z)
        parts = 1 if p.geom_type == "Polygon" else len(p.geoms)
        if parts > 1:
            print(f"  Z{z}: {parts} fragmentos -> no contigua")
            bad.append(z)
        elif not p.is_simple:
            print(f"  Z{z}: anillo no simple")
    print(f"  zonas no contiguas o invalidas: {bad or 'ninguna'}")

    print("\n=== 2. POSICION CARDINAL (texto oficial vs centroide obtenido) ===")
    # Tokens de direccion tal como los declara la municipalidad en `ubicacion_oficial`.
    ofic_ubic = {f["properties"]["zona"]: f["properties"]["ubicacion_oficial"] for f in fc["features"]}
    fallos = []
    for z, p in sorted(polys.items()):
        lp = p.representative_point()
        dx, dy = lp.x - c.x, lp.y - c.y
        ew = "E" if dx > 0.004 else ("O" if dx < -0.004 else "C")
        ns = "N" if dy > 0.004 else ("S" if dy < -0.004 else "C")
        got = (ns if ns != "C" else "") + (ew if ew != "C" else "")
        got = got or "C"
        txt = ofic_ubic[z].lower()
        # Direccion dominante declarada oficialmente
        if "nor-este" in txt or "norte-este" in txt:
            want = "NE"
        elif "nor-oeste" in txt or "norte-oeste" in txt:
            want = "NO"
        elif "sur-oeste" in txt:
            want = "SO"
        elif "central este" in txt:
            want = "E"
        elif "central sur" in txt or "central-sur" in txt:
            want = "S"
        elif "extremo norte" in txt:
            want = "N"
        elif "norte" in txt:
            want = "N"
        elif "sur" in txt:
            want = "S"
        else:
            want = "C"
        # Acepta coincidencia parcial (SO contiene S, NE contiene N, ...)
        ok = got == want or (want in got) or (got != "C" and want != "C" and set(want) <= set(got))
        if not ok:
            fallos.append(z)
        print(f"  Z{z}: oficial '{ofic_ubic[z][:32]:<32}' -> {want:<3} | obtenido {got:<3} "
              f"{'OK ' if ok else 'REVISAR'} (dx {dx * 111 * 0.978:+.2f} km, dy {dy * 110.6:+.2f} km)")
    print(f"  desviaciones de posicion cardinal: {fallos or 'ninguna'}")

    print("\n=== 3. COLINDANCIAS (frontera compartida real vs texto oficial) ===")
    zonas = sorted(polys)
    real: dict[str, set[str]] = {z: set() for z in zonas}
    for i, a in enumerate(zonas):
        for b in zonas[i + 1:]:
            inter = polys[a].boundary.intersection(polys[b].boundary)
            if inter.length * 111.0 > 0.40:  # > 400 m de frontera comun real
                real[a].add(b)
                real[b].add(a)
    aciertos = total = 0
    for z in zonas:
        decl = set(OFICIAL[z]["norte"]) | set(OFICIAL[z]["sur"]) | set(OFICIAL[z]["este"]) | set(OFICIAL[z]["oeste"])
        decl = {d for d in decl if d in polys}
        obt = real[z]
        inter = decl & obt
        aciertos += len(inter)
        total += len(decl | obt)
        faltan = sorted(decl - obt)
        extra = sorted(obt - decl)
        marca = "OK" if not faltan and not extra else "dif"
        print(f"  Z{z} [{marca}] coincide={sorted(inter)}")
        if faltan:
            print(f"        declarada pero no colinda en el mapa: {faltan}")
        if extra:
            print(f"        colinda en el mapa pero no declarada: {extra}")
    print(f"  coincidencia global de colindancias: {aciertos}/{total} = {aciertos / total * 100:.0f}%")

    print("\n=== 4. MAPA ASCII (digito de zona rellenando el area) ===")
    letra = {z: (z[1] if z.startswith("0") else "ABCDE"[int(z) - 10]) for z in zonas}
    w, e = dpoly.bounds[0], dpoly.bounds[2]
    s, n = dpoly.bounds[1], dpoly.bounds[3]
    COLS, ROWS = 112, 46
    print("   +" + "-" * COLS + "+")
    for r in range(ROWS):
        lat = n - (r + 0.5) / ROWS * (n - s)
        row = []
        for col in range(COLS):
            lon = w + (col + 0.5) / COLS * (e - w)
            pt = Point(lon, lat)
            ch = " "
            for z, p in polys.items():
                if p.contains(pt):
                    ch = letra[z]
                    break
            row.append(ch)
        print(f"{lat:8.4f}|" + "".join(row) + "|")
    print("   +" + "-" * COLS + "+")
    print("    " + " " * 8 + f"W {w:.4f}" + " " * (COLS - 30) + f"E {e:.4f}")
    print("\n   leyenda: 1..9 = Zona 01..09,  A=Z10  B=Z11  C=Z12  D=Z13  E=Z14")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

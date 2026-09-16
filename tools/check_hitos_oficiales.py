"""Comprueba que los hitos que la Municipalidad de Comas cita en su descripcion oficial
de cada zonal caen realmente dentro de esa zonal en la cartografia generada.

Es la principal metrica de fidelidad de la reconstruccion: no depende de interpretar textos
ambiguos, sino de hechos verificables (el hito esta donde esta, y la municipalidad dice en
que zonal esta).

Para hitos con geometria conocida (poligonos) se mide que FRACCION de su area cae en cada
zonal, porque un equipamiento grande puede quedar a caballo de una frontera reconstruida:
  OK       >= 50% de su area (o su punto) en la zonal esperada
  PARCIAL  entre 15% y 50% en la zonal esperada (a caballo de la frontera)
  FALLA    menos del 15%

Uso:  python tools/check_hitos_oficiales.py
Salida: codigo 0 si no hay FALLA, 1 si alguna.
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]

# Hitos citados literalmente por la Municipalidad Distrital de Comas en la descripcion de su
# zonal, localizados en OpenStreetMap. `geom` = caja real del elemento OSM cuando es un area.
HITOS = [
    dict(nombre="Parque Zonal Sinchi Roca (Club Metropolitano)", zonal="04",
         lat=-11.9221263, lon=-77.0490901,
         geom=(-77.05177, -11.92774, -77.04641, -11.91651),   # way 110062002
         cita="ZONAL 4: 'En esta zonal se localiza el unico parque zonal distrital, "
              "el Parque zonal Sinchi Roca'"),
    dict(nombre="Huaca Sinchi Roca", zonal="04", lat=-11.9303407, lon=-77.0457236,
         geom=(-77.04675, -11.93149, -77.04469, -11.92919),   # way 344744477
         cita="ZONAL 4: mismo entorno del parque zonal Sinchi Roca"),
    dict(nombre="Institucion Educativa 2022 Sinchi Roca", zonal="04",
         lat=-11.9305958, lon=-77.0494373,
         geom=(-77.05001, -11.93128, -77.04887, -11.92991),   # way 344742277
         cita="ZONAL 4: mismo entorno del parque zonal Sinchi Roca"),
    dict(nombre="Hospital Marino Molina Scippa (ESSALUD)", zonal="06",
         lat=-11.9431649, lon=-77.0572333,
         cita="ZONAL 6: 'Encontrandose en esta zonal el Hospital del Seguro Social'"),
    dict(nombre="Compania de Bomberos Comas N.124", zonal="06",
         lat=-11.9427860, lon=-77.0623956, cita="ZONAL 6: 'la Compania de Bomberos'"),
    dict(nombre="Comisaria PNP Universitaria", zonal="06",
         lat=-11.9474565, lon=-77.0599981, cita="ZONAL 6: 'y comisaria'"),
    dict(nombre="Mercado Modelo (Comas)", zonal="06", lat=-11.9468524, lon=-77.0596638,
         cita="ZONAL 6: comercio zonal a lo largo de la Av. Universitaria"),
    dict(nombre="Mercado Santa Luzmila", zonal="06", lat=-11.9422144, lon=-77.0623792,
         cita="ZONAL 6: comercio zonal a lo largo de la Av. Universitaria"),
    dict(nombre="Cementerio de Collique", zonal="12", lat=-11.9090957, lon=-77.0029445,
         cita="ZONAL 12: 'Encontrandose tambien la presencia del cementerio municipal' + Collique"),
]

# Referencias de contraste: NO son afirmaciones de la municipalidad; solo se informa donde cae.
CONTRASTE = [
    ("Hospital Nacional Sergio E. Bernales", -11.9141196, -77.0376892),
    ("Comisaria PNP Comas Collique", -11.9130804, -77.0161997),
    ("Mercado Central 1ra Zona Collique", -11.9153695, -77.0330272),
    ("Cementerio de Comas", -11.9542464, -77.0312932),
    ("Mercado de Comas", -11.9556219, -77.0481595),
    ("Comisaria PNP La Pascana", -11.9349512, -77.0458428),
    ("Mercado El Pinar", -11.9151274, -77.0559846),
]


def bbox_polygon(geom) -> Polygon:
    x0, y0, x1, y1 = geom
    return Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def main() -> int:
    fc = json.loads((ROOT / "data" / "comas_zonas.geojson").read_text(encoding="utf-8"))
    polys = {f["properties"]["zona"]: Polygon(f["geometry"]["coordinates"][0])
             for f in fc["features"]}

    def which(lat: float, lon: float) -> str:
        pt = Point(lon, lat)
        for z, p in polys.items():
            if p.contains(pt):
                return z
        return "FUERA"

    print("=== HITOS QUE LA MUNICIPALIDAD DE COMAS CITA EN LA DESCRIPCION DE CADA ZONAL ===\n")
    conteo = {"OK": 0, "PARCIAL": 0, "FALLA": 0}
    for h in HITOS:
        esperada = h["zonal"]
        if "geom" in h:
            area = bbox_polygon(h["geom"])
            reparto = {z: polys[z].intersection(area).area / area.area
                       for z in polys if polys[z].intersects(area)}
            share = reparto.get(esperada, 0.0)
            detalle = ", ".join(f"Z{z} {v * 100:.1f}%" for z, v in
                                sorted(reparto.items(), key=lambda kv: -kv[1])[:3])
            veredicto = "OK" if share >= 0.50 else ("PARCIAL" if share >= 0.15 else "FALLA")
            extra = f"  [reparto: {detalle}]"
        else:
            got = which(h["lat"], h["lon"])
            veredicto = "OK" if got == esperada else "FALLA"
            extra = f"  -> Z{got}"
        conteo[veredicto] += 1
        print(f"  {veredicto:<8} {h['nombre']:<44} zonal {esperada}{extra}")
        if veredicto != "OK":
            print(f"           {h['cita']}")

    total = len(HITOS)
    print(f"\nresultado: {conteo['OK']}/{total} OK, {conteo['PARCIAL']} parcial, {conteo['FALLA']} falla")

    if conteo["PARCIAL"]:
        print("\n  NOTA sobre los PARCIAL: la Municipalidad de Comas publica las hectareas, la posicion")
        print("  cardinal y las colindancias de sus 14 zonales, pero NO su geometria. Los poligonos de")
        print("  este prototipo son una reconstruccion ilustrativa, asi que un equipamiento grande puede")
        print("  quedar a caballo de una frontera reconstruida. Es el limite esperable del dato publico,")
        print("  no un error de calculo: el reparto de area medido se muestra arriba.")

    print("\n--- referencias de contraste (no son afirmaciones oficiales; solo se informa) ---")
    for nombre, lat, lon in CONTRASTE:
        print(f"       {nombre:<44} cae en la Zona {which(lat, lon)}")

    return 1 if conteo["FALLA"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

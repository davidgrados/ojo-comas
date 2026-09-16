"""Genera los datos FICTICIOS del prototipo Ojo Comas.

Salidas:
  * worker/seed.sql                      -> 28 reportes (2 por zona) listos para D1
  * frontend/data/reportes_demo.geojson  -> los mismos reportes como GeoJSON (respaldo offline)
  * frontend/fotos/*.svg                 -> 6 "fotos" de evidencia simuladas, subidas a R2

Todos los puntos se generan DENTRO del poligono de su zona (se comprueba con shapely), de modo
que el mapa y el filtro por zona son coherentes. Los textos usan nombres reales de barrios e
hitos tomados de OpenStreetMap para que la demostracion resulte creible.

ADVERTENCIA: estos reportes son ficticios. No describen problemas reales del distrito.
"""
from __future__ import annotations

import io
import json
import random
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
random.seed(20260916)  # reproducible

# --- Plantillas de descripcion (<= 140 caracteres, en espanol) -------------------------------
PLANTILLAS = {
    "bache": [
        "Hueco grande en la pista de {lugar}. Los vehiculos tienen que esquivarlo.",
        "Pista deteriorada en {lugar}. Hay riesgo para motos y bicicletas.",
        "Bache profundo en {lugar}, se llena de agua cuando llueve.",
        "Pavimento agrietado en {lugar}. Ya lleva semanas asi.",
    ],
    "basura": [
        "Acumulacion de basura en {lugar}. Los vecinos piden recojo urgente.",
        "Contenedor desbordado en {lugar}. Hay malos olores y moscas.",
        "Basura acumulada en la esquina de {lugar} desde hace varios dias.",
        "Punto critico de residuos en {lugar}. Necesita limpieza y un contenedor.",
    ],
    "alumbrado": [
        "Luminaria apagada en {lugar}. La calle queda muy oscura de noche.",
        "Poste sin luz en {lugar}. Inseguridad para quienes vuelven tarde.",
        "Luz intermitente en {lugar}. Se prende y apaga toda la noche.",
        "Tres luminarias apagadas en {lugar}. Zona muy transitada de noche.",
    ],
    "otro": [
        "Vereda levantada en {lugar}. Dificil para sillas de ruedas y carritos.",
        "Pista sin pintar y sin senalizacion en {lugar}.",
        "Alcantarilla sin tapa en {lugar}. Peligroso para los peatones.",
        "Parque con juegos rotos en {lugar}. Los ninos no pueden usarlo.",
    ],
}

ESTADOS = (
    ["pendiente"] * 5 + ["en_proceso"] * 3 + ["resuelto"] * 3
)  # ~45% / 27% / 27%

NOTAS_HISTORIAL = {
    "pendiente": "Reporte recibido. En cola de revision por la subgerencia de obras.",
    "en_proceso": "Derivado al equipo de campo. Cuadrilla asignada.",
    "resuelto": "Trabajo concluido y verificado en campo.",
}

COLORES_FOTO = {
    "bache": ("#3F3F46", "#71717A"),
    "basura": ("#1F2937", "#4B5563"),
    "alumbrado": ("#1E293B", "#334155"),
    "otro": ("#292524", "#57534E"),
}

ICONO_FOTO = {"bache": "&#128371;", "basura": "&#128465;", "alumbrado": "&#128161;", "otro": "&#128204;"}


def cargar_zonas():
    fc = json.loads((ROOT / "data" / "comas_zonas.geojson").read_text(encoding="utf-8"))
    zonas = []
    for f in fc["features"]:
        p = f["properties"]
        zonas.append({
            "zona": p["zona"],
            "poligono": Polygon(f["geometry"]["coordinates"][0]),
            "centro": p["centro"],
            "semilla": p["semilla"],
            "barrios": p["barrios_reales"] or ["la zona"],
            "hitos": p["hitos_reales"] or [],
        })
    return zonas


def punto_dentro(poligono: Polygon, lat0: float, lng0: float, max_intentos: int = 300):
    """Desplaza (lat0,lng0) al azar hasta que caiga dentro del poligono."""
    for _ in range(max_intentos):
        dlat = random.uniform(-0.0035, 0.0035)
        dlng = random.uniform(-0.0035, 0.0035)
        pt = Point(lng0 + dlng, lat0 + dlat)
        if poligono.contains(pt):
            # Se exige margen al borde para que el marcador no caiga sobre la frontera.
            if poligono.boundary.distance(pt) > 0.0006:
                return pt.y, pt.x
    return None, None


def elegir_lugar(zona: dict) -> str:
    """Elige un lugar creible: un hito real o un barrio real de la zona."""
    if zona["hitos"] and random.random() < 0.5:
        return random.choice(zona["hitos"])["nombre"]
    return random.choice(zona["barrios"])


def svg_foto(categoria: str, zona: str, indice: int, lugar: str) -> str:
    c1, c2 = COLORES_FOTO[categoria]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768" role="img" aria-label="Foto simulada de {categoria}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
    <pattern id="ruido" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.9" fill="#ffffff" opacity="0.05"/>
      <circle cx="5" cy="5" r="0.7" fill="#000000" opacity="0.07"/>
    </pattern>
  </defs>
  <rect width="1024" height="768" fill="url(#g)"/>
  <rect width="1024" height="768" fill="url(#ruido)"/>
  <g opacity="0.20" fill="none" stroke="#ffffff" stroke-width="3">
    <path d="M0 520 L240 470 L470 505 L720 460 L1024 500"/>
    <path d="M0 600 L260 560 L520 590 L780 548 L1024 580"/>
    <path d="M120 768 L200 540 L300 768Z"/>
    <path d="M700 768 L790 520 L900 768Z"/>
  </g>
  <ellipse cx="512" cy="560" rx="190" ry="70" fill="#000000" opacity="0.35"/>
  <text x="512" y="330" font-size="150" text-anchor="middle" opacity="0.55">{ICONO_FOTO[categoria]}</text>
  <text x="512" y="430" font-size="40" font-family="Inter,Segoe UI,Arial" font-weight="700" fill="#ffffff" text-anchor="middle" opacity="0.92">{categoria.upper()}</text>
  <text x="512" y="480" font-size="30" font-family="Inter,Segoe UI,Arial" fill="#ffffff" text-anchor="middle" opacity="0.75">Zona {zona} - {lugar[:34]}</text>
  <rect x="0" y="700" width="1024" height="68" fill="#C8102E" opacity="0.92"/>
  <text x="512" y="744" font-size="30" font-family="Inter,Segoe UI,Arial" font-weight="700" fill="#ffffff" text-anchor="middle">FOTO SIMULADA - PROTOTIPO DE DEMOSTRACION - DATOS FICTICIOS</text>
</svg>
"""


def escapar_sql(texto: str) -> str:
    return texto.replace("'", "''")


def main() -> int:
    zonas = cargar_zonas()
    fotos_dir = ROOT / "frontend" / "fotos"
    fotos_dir.mkdir(parents=True, exist_ok=True)

    # --- 6 fotos simuladas (2 por categoria de infraestructura) ---
    fotos = []
    for i, (categoria, zona) in enumerate(
        [("bache", zonas[0]), ("bache", zonas[3]), ("basura", zonas[1]), ("basura", zonas[11]),
         ("alumbrado", zonas[5]), ("alumbrado", zonas[8])], start=1):
        lugar = elegir_lugar(zona)
        nombre = f"demo-{i:02d}-{categoria}-z{zona['zona']}.svg"
        (fotos_dir / nombre).write_text(svg_foto(categoria, zona["zona"], i, lugar), encoding="utf-8")
        fotos.append({"nombre": nombre, "categoria": categoria, "zona": zona["zona"]})
    print(f"fotos simuladas: {len(fotos)} en frontend/fotos/")

    # --- 28 reportes repartidos por zona (2 por zona) ---
    categorias_ciclo = ["bache", "basura", "alumbrado", "otro"]
    reportes = []
    rid = 0
    for z in zonas:
        for k in range(2):
            lat, lng = punto_dentro(z["poligono"], z["centro"][0], z["centro"][1])
            if lat is None:
                lat, lng = z["centro"][0], z["centro"][1]
            lugar = elegir_lugar(z)
            categoria = categorias_ciclo[(int(z["zona"]) + k) % 4]
            descripcion = random.choice(PLANTILLAS[categoria]).format(lugar=lugar)
            if len(descripcion) > 140:
                descripcion = descripcion[:137] + "..."
            estado = ESTADOS[(int(z["zona"]) * 2 + k) % len(ESTADOS)]
            rid += 1
            dias = random.randint(1, 45)
            uso_foto = rid % 4 == 1  # uno de cada cuatro lleva foto simulada
            foto = next((f["nombre"] for f in fotos if f["categoria"] == categoria), None) if uso_foto else None
            reportes.append({
                "id": rid,
                "categoria": categoria,
                "descripcion": descripcion,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "zona": z["zona"],
                "lugar": lugar,
                "estado": estado,
                "dias": dias,
                "confirmaciones": random.randint(0, 12),
                "photo_key": f"demo/{foto}" if foto else None,
            })

    # --- seed.sql ---
    lineas = [
        "-- Datos FICTICIOS de demostracion para Ojo Comas. Generado por tools/build_seed.py",
        "-- ADVERTENCIA: estos reportes NO describen problemas reales del distrito de Comas.",
        "-- Se pueden borrar por completo con: DELETE FROM reports;",
        "",
        "DELETE FROM confirmations;",
        "DELETE FROM status_history;",
        "DELETE FROM reports;",
        "DELETE FROM sqlite_sequence WHERE name IN ('reports','status_history');",
        "",
    ]
    for r in reportes:
        lineas.append(
            "INSERT INTO reports (id, category, description, latitude, longitude, zona, address, "
            "photo_key, status, confirmations, consent, created_at, updated_at) VALUES ("
            f"{r['id']}, '{r['categoria']}', '{escapar_sql(r['descripcion'])}', {r['lat']}, {r['lng']}, "
            f"'{r['zona']}', '{escapar_sql(r['lugar'])}', "
            f"{'NULL' if not r['photo_key'] else chr(39) + r['photo_key'] + chr(39)}, "
            f"'{r['estado']}', {r['confirmaciones']}, 0, "
            f"strftime('%Y-%m-%dT%H:%M:%SZ','now','-{r['dias']} days'), "
            f"strftime('%Y-%m-%dT%H:%M:%SZ','now','-{max(r['dias'] - 2, 0)} days'));"
        )
        lineas.append(
            f"INSERT INTO status_history (report_id, status, note, changed_at) VALUES ({r['id']}, "
            f"'pendiente', 'Reporte recibido. En cola de revision.', "
            f"strftime('%Y-%m-%dT%H:%M:%SZ','now','-{r['dias']} days'));"
        )
        if r["estado"] != "pendiente":
            lineas.append(
                f"INSERT INTO status_history (report_id, status, note, changed_at) VALUES ({r['id']}, "
                f"'{r['estado']}', '{escapar_sql(NOTAS_HISTORIAL[r['estado']])}', "
                f"strftime('%Y-%m-%dT%H:%M:%SZ','now','-{max(r['dias'] - 3, 0)} days'));"
            )
    lineas.append("")
    (ROOT / "worker" / "seed.sql").write_text("\n".join(lineas), encoding="utf-8")
    print(f"worker/seed.sql: {len(reportes)} reportes")

    # --- reportes_demo.geojson (respaldo offline del frontend) ---
    features = []
    for r in reportes:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": {
                "id": r["id"],
                "categoria": r["categoria"],
                "descripcion": r["descripcion"],
                "zona": r["zona"],
                "estado": r["estado"],
                "foto_url": None,
                "direccion": r["lugar"],
                "confirmaciones": r["confirmaciones"],
                "creado_en": f"hace-{r['dias']}-dias",
                "actualizado_en": f"hace-{max(r['dias'] - 2, 0)}-dias",
                "ficticio": True,
            },
        })
    demo = {
        "type": "FeatureCollection",
        "name": "reportes_demo",
        "metadata": {
            "advertencia": "Datos FICTICIOS del prototipo Ojo Comas. No describen problemas reales.",
            "generado_por": "tools/build_seed.py",
            "total": len(features),
        },
        "features": features,
    }
    destino = ROOT / "frontend" / "data" / "reportes_demo.geojson"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(demo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"frontend/data/reportes_demo.geojson: {len(features)} reportes")

    # --- Validacion: cada punto dentro de su zona ---
    print("\n--- VALIDACION ---")
    malos = []
    for r in reportes:
        poly = next(z["poligono"] for z in zonas if z["zona"] == r["zona"])
        if not poly.contains(Point(r["lng"], r["lat"])):
            malos.append(r["id"])
    print(f"reportes fuera de su zona declarada: {malos or 'ninguno'}")
    por_zona: dict[str, int] = {}
    for r in reportes:
        por_zona[r["zona"]] = por_zona.get(r["zona"], 0) + 1
    print(f"zonas cubiertas: {len(por_zona)}/14  (min {min(por_zona.values())}, max {max(por_zona.values())})")
    estados: dict[str, int] = {}
    for r in reportes:
        estados[r["estado"]] = estados.get(r["estado"], 0) + 1
    print(f"reparto de estados: {estados}")
    cats: dict[str, int] = {}
    for r in reportes:
        cats[r["categoria"]] = cats.get(r["categoria"], 0) + 1
    print(f"reparto de categorias: {cats}")
    return 0 if not malos else 1


if __name__ == "__main__":
    raise SystemExit(main())

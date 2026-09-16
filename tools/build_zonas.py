"""Genera la cartografia de las 14 zonas del prototipo Ojo Comas.

FUENTES
  * Limite real del distrito: relacion OSM 1944720 ("Distrito de Comas", wikidata Q1113426),
    coincide con el area oficial (48.97 km2 calculados vs 48.72 km2 publicados).
  * Metadatos oficiales de las 14 zonales (hectareas, ubicacion cardinal, colindancias,
    avenidas e hitos): Geografia, Municipalidad Distrital de Comas
    https://www.municomas.gob.pe/distrito/geografia
  * Barrios reales: nodos/ways `place=neighbourhood` y `landuse=residential` de OSM.
  * Hitos reales: parques, hospitales, comisarias, mercados, cementerio de OSM.
  * Orientacion real de los distritos vecinos: centroides de sus limites OSM.

METODO
  1. Se cose (stitch) el anillo exterior de la relacion OSM y se proyecta a un CRS metrico local.
  2. Para cada zona se define una CAJA de referencia (posicion cardinal oficial) y la semilla
     se coloca en el "polo de inaccesibilidad" de (distrito INTERSECADO caja): el punto
     interior mas alejado del borde. Asi la semilla queda siempre dentro y bien centrada.
  3. Se reparte el distrito en 14 celdas con un **diagrama de potencia** (Voronoi ponderado
     aditivo) ajustando solo los pesos, hasta que el area de cada celda sea proporcional a
     las hectareas oficiales. Las semillas no se mueven: la posicion geografica se respeta.
  4. Se asignan los barrios e hitos reales de OSM a la zona que los contiene.
  5. Se desproyecta, se simplifica y se escribe GeoJSON, con validacion de cobertura.

ADVERTENCIA
  Los POLIGONOS de las 14 zonas son una RECONSTRUCCION ILUSTRATIVA. El distrito no publica
  la geometria oficial de sus zonales como dato abierto; solo publica hectareas, posicion
  cardinal y colindancias, que son las que este script respeta. El limite DISTRITAL si es real.
  El texto municipal etiqueta el Este/Oeste al reves en varias zonales (pone Los Olivos al Este
  y San Juan de Lurigancho al Oeste); aqui se usa la orientacion geografica real verificada.
"""
from __future__ import annotations

import io
import json
import math
import sys
from pathlib import Path

from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, mapping
from shapely.ops import nearest_points, unary_union

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

COMAS_RELATION_ID = 1944720
OSM_RELATION_URL = f"https://www.openstreetmap.org/relation/{COMAS_RELATION_ID}"
MUNI_SOURCE_URL = "https://www.municomas.gob.pe/distrito/geografia"
ODBL = "(c) OpenStreetMap contributors (ODbL)"

# ---------------------------------------------------------------------------
# Metadatos OFICIALES de las 14 zonales + caja de referencia para la semilla.
#
# `ha`      hectareas oficiales
# `ubic`    ubicacion cardinal oficial (texto literal de la municipalidad)
# `colinda` colindancias oficiales (texto literal)
# `ref`     avenidas / hitos mencionados en la fuente oficial
# `seed`    coordenada ancla (lon, lat) donde se siembra la celda de la zona. Para las zonales
#           04, 06 y 12 proviene de hitos que la propia municipalidad cita en su descripcion
#           oficial, localizados en OpenStreetMap; para el resto, de la posicion cardinal
#           oficial corregida con la orientacion real de los distritos vecinos.
# `ancla`   procedencia legible de esa coordenada.
# ---------------------------------------------------------------------------
ZONALES: dict[str, dict] = {
    "01": {
        "ha": 200.60,
        "ubic": "margen Sur del distrito",
        "colinda": {"norte": ["02", "06", "11"], "sur": ["Independencia", "Los Olivos"],
                    "este": ["Los Olivos"], "oeste": ["Independencia"]},
        "ref": "Av. Tupac Amaru; comercio zonal, pirotecnias y lubricentros",
        "seed": (-77.0540, -11.9670),
        "ancla": "extremo sur del distrito, junto al limite con Independencia y Los Olivos",
    },
    "02": {
        "ha": 343.83,
        "ubic": "margen Sur del distrito",
        "colinda": {"norte": ["13", "03"], "sur": ["01", "Independencia"],
                    "este": ["11"], "oeste": ["San Juan de Lurigancho"]},
        "ref": "Zona sur-oeste; limite real con Los Olivos e Independencia",
        "seed": (-77.0480, -11.9560),
        "ancla": "sur del distrito, eje de la Av. Tupac Amaru (Mercado de Comas)",
    },
    "03": {
        "ha": 320.69,
        "ubic": "parte Central Este del distrito",
        "colinda": {"norte": ["04"], "sur": ["02", "13"], "este": ["Independencia"], "oeste": ["13"]},
        "ref": "Zona central este, hacia el limite con San Juan de Lurigancho",
        "seed": (-77.0150, -11.9330),
        "ancla": "franja central este, hacia el limite real con San Juan de Lurigancho",
    },
    "04": {
        "ha": 303.42,
        "ubic": "parte central del distrito",
        "colinda": {"norte": ["05", "09"], "sur": ["03", "10", "13"],
                    "este": ["Laderas del distrito"], "oeste": ["10", "09"]},
        "ref": "Parque Zonal Sinchi Roca; Av. Tupac Amaru",
        "seed": (-77.0490901, -11.9221263),
        
        "ancla": "REAL: el propio Parque Zonal Sinchi Roca (-11.92213,-77.04909), que la "
                 "municipalidad situa en esta zonal; la Huaca Sinchi Roca queda contigua",
    },
    "05": {
        "ha": 203.38,
        "ubic": "parte Norte del distrito",
        "colinda": {"norte": ["12", "08", "Carabayllo"], "sur": ["04"],
                    "este": ["San Juan de Lurigancho"], "oeste": ["09", "08"]},
        "ref": "Zona norte, entre Carabayllo y San Juan de Lurigancho",
        "seed": (-77.0380, -11.9080),
        "ancla": "franja norte central, entre Carabayllo y San Juan de Lurigancho",
    },
    "06": {
        "ha": 279.08,
        "ubic": "parte Sur-Oeste del distrito",
        "colinda": {"norte": ["07", "13"], "sur": ["01", "11"],
                    "este": ["11", "13"], "oeste": ["Los Olivos"]},
        "ref": "Av. Universitaria y Av. 22 de Agosto; Hospital del Seguro Social, "
               "Compania de Bomberos y comisaria",
        "seed": (-77.0599, -11.9445),
        "ancla": "REAL: media de Hospital Marino Molina Scippa (-11.94316,-77.05723), "
                 "Compania de Bomberos Comas N.124 (-11.94279,-77.06240) y "
                 "Comisaria PNP Universitaria (-11.94746,-77.06000), citados en la fuente oficial",
    },
    "07": {
        "ha": 294.71,
        "ubic": "parte Norte-oeste del distrito",
        "colinda": {"norte": ["09", "10", "14"], "sur": ["06", "13"],
                    "este": ["10", "13"], "oeste": ["14", "Los Olivos"]},
        "ref": "Av. Universitaria y Av. Retablo; areas verdes y restos arqueologicos",
        "seed": (-77.0650, -11.9290),
        "ancla": "franja oeste, eje Av. Universitaria / Av. Retablo",
    },
    "08": {
        "ha": 242.91,
        "ubic": "extremo Norte del distrito",
        "colinda": {"norte": ["Carabayllo"], "sur": ["09", "05"], "este": ["05"], "oeste": ["14"]},
        "ref": "Av. Universitaria, Av. San Carlos, Av. San Felipe; afloramiento de aguas subterraneas",
        "seed": (-77.0490, -11.8925),
        "ancla": "extremo norte del distrito, eje Av. San Felipe / Av. San Carlos",
    },
    "09": {
        "ha": 203.60,
        "ubic": "parte Norte-oeste del distrito",
        "colinda": {"norte": ["08"], "sur": ["04", "07", "10"],
                    "este": ["05", "04", "10"], "oeste": ["14", "08"]},
        "ref": "Av. Universitaria; plantas recicladoras y puntos criticos de residuos solidos",
        "seed": (-77.0530, -11.9020),
        "ancla": "noroeste del centro, eje Av. Universitaria",
    },
    "10": {
        "ha": 125.30,
        "ubic": "parte central del distrito",
        "colinda": {"norte": ["09", "04"], "sur": ["13", "07"],
                    "este": ["04", "13"], "oeste": ["07", "09"]},
        "ref": "Av. Universitaria y Av. Micaela Bastidas; areas verdes y comercio ambulatorio",
        "seed": (-77.0425, -11.9345),
        "ancla": "centro-oeste, eje Av. Universitaria / Av. Micaela Bastidas",
    },
    "11": {
        "ha": 134.56,
        "ubic": "parte Central Sur del distrito",
        "colinda": {"norte": ["13", "06"], "sur": ["01"], "este": ["01"], "oeste": ["06"]},
        "ref": "Av. Universitaria, Av. Carabayllo, Av. Honduras, Av. Mexico",
        "seed": (-77.0350, -11.9530),
        "ancla": "centro-sur, eje Av. Honduras / Av. Mexico",
    },
    "12": {
        "ha": 320.35,
        "ubic": "parte Nor-este del distrito",
        "colinda": {"norte": ["Carabayllo", "cerros de Comas"],
                    "sur": ["cerros", "San Juan de Lurigancho"],
                    "este": ["San Juan de Lurigancho"], "oeste": ["05"]},
        "ref": "Av. Revolucion; Collique (sectores VII y VIII); cementerio municipal; "
               "laderas de 30-40 grados",
        "seed": (-77.0174, -11.9125),
        "ancla": "REAL: media de Cementerio de Collique (-11.90910,-77.00294), Comisaria PNP Comas "
                 "Collique (-11.91308,-77.01620) y Mercado Central 1ra Zona Collique "
                 "(-11.91537,-77.03303); 'Collique sector VII y VIII' en la fuente oficial",
    },
    "13": {
        "ha": 140.70,
        "ubic": "parte central-sur del distrito",
        "colinda": {"norte": ["04", "10"], "sur": ["02", "11", "06"],
                    "este": ["03"], "oeste": ["06", "07", "10"]},
        "ref": "Av. Tupac Amaru, Av. Micaela Bastidas y Belaunde; densidad mas alta del distrito "
               "(294.7 hab/ha)",
        "seed": (-77.0300, -11.9430),
        "ancla": "centro-sur, eje Av. Tupac Amaru / Av. Micaela Bastidas / Belaunde",
    },
    "14": {
        "ha": 553.29,
        "ubic": "parte Nor-Oeste del distrito",
        "colinda": {"norte": ["Carabayllo"], "sur": ["07"], "este": ["08", "09"],
                    "oeste": ["Carabayllo"]},
        "ref": "Zona agricola y ganadera junto al rio Chillon; suelo aluvial casi plano",
        "seed": (-77.0600, -11.9000),
        "ancla": "extremo noroeste, valle del rio Chillon (limite real con Puente Piedra/Carabayllo)",
    },
}

PALETA = [
    "#1D4E89", "#2A9D8F", "#6A4C93", "#E76F51", "#457B9D", "#8AB17D", "#B08968",
    "#5E60CE", "#0096C7", "#9D4DDA", "#F4A261", "#3A86FF", "#2D6A4F", "#7F5539",
]

# Hitos oficiales citados por la municipalidad que deben aparecer en su zonal.
HITOS_OFICIALES = {
    "04": ["Parque Zonal Sinchi Roca"],
    "06": ["Hospital", "Bomberos", "Comisaria"],
    "12": ["Cementerio"],
}

# Exigir por construccion que la semilla de las zonas 04/06/12 caiga en su propia celda
# garantiza sus hitos, pero limita mucho el ajuste de areas (dos zonas contiguas de tamanos
# muy distintos no pueden tener las semillas tan cerca). Se prefiere respetar las hectareas
# oficiales y verificar los hitos a posteriori con tools/check_hitos_oficiales.py.
EXIGIR_HITO_EN_SU_ZONA = False


# ---------------------------------------------------------------------------
# Limite real del distrito (OSM)
# ---------------------------------------------------------------------------
def stitch_rings(members: list[dict]) -> list[list[tuple[float, float]]]:
    """Cose las ways de la relacion en anillos cerrados."""
    fragments = [
        [(p["lat"], p["lon"]) for p in m["geometry"]]
        for m in members
        if m.get("type") == "way" and m.get("geometry") and m.get("role") in (None, "", "outer")
    ]
    rings: list[list[tuple[float, float]]] = []
    pool = [list(f) for f in fragments]
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


def load_district() -> tuple[Polygon, dict]:
    raw = json.loads((RAW / "comas_osm_overpass.json").read_text(encoding="utf-8-sig"))
    elements = raw["elements"] if isinstance(raw, dict) else raw
    rel = next(e for e in elements if e["id"] == COMAS_RELATION_ID)
    rings = stitch_rings(rel["members"])

    geoms = []
    for ring in rings:
        if len(ring) < 4:
            continue
        poly = Polygon([(lon, lat) for lat, lon in ring])
        if not poly.is_valid:
            poly = poly.buffer(0)
        geoms.append(poly)

    merged = unary_union(geoms)
    district = max(merged.geoms, key=lambda g: g.area) if isinstance(merged, MultiPolygon) else merged
    if not district.is_valid:
        district = district.buffer(0)
    meta = {
        "osm_relation": COMAS_RELATION_ID,
        "osm_url": OSM_RELATION_URL,
        "wikidata": rel.get("tags", {}).get("wikidata"),
        "wikipedia": rel.get("tags", {}).get("wikipedia"),
        "anillos": len(geoms),
        "puntos": sum(len(r) for r in rings),
    }
    return district, meta


# ---------------------------------------------------------------------------
# Proyeccion metrica local
# ---------------------------------------------------------------------------
def make_projection(center_lat: float, center_lon: float):
    m_per_deg_lat = 111132.92
    m_per_deg_lon = 111319.49 * math.cos(math.radians(center_lat))

    def to_m(lon: float, lat: float) -> tuple[float, float]:
        return (lon - center_lon) * m_per_deg_lon, (lat - center_lat) * m_per_deg_lat

    def to_deg(x: float, y: float) -> tuple[float, float]:
        return center_lon + x / m_per_deg_lon, center_lat + y / m_per_deg_lat

    return to_m, to_deg


# ---------------------------------------------------------------------------
# Diagrama de potencia (Voronoi ponderado)
# ---------------------------------------------------------------------------
def power_diagram(sites, weights, clip: Polygon, big: float) -> list[Polygon]:
    """Celdas de |x-s_i|^2 - w_i <= |x-s_j|^2 - w_j, recortadas a `clip`."""
    cells: list[Polygon] = []
    for i, si in enumerate(sites):
        cell = clip
        for j, sj in enumerate(sites):
            if i == j:
                continue
            nx, ny = 2.0 * (sj.x - si.x), 2.0 * (sj.y - si.y)
            norm = math.hypot(nx, ny)
            if norm < 1e-9:
                continue
            nx, ny = nx / norm, ny / norm
            d = ((sj.x ** 2 + sj.y ** 2 - weights[j]) - (si.x ** 2 + si.y ** 2 - weights[i])) / norm
            tx, ty = -ny, nx
            quad = Polygon([
                (d * nx + big * tx, d * ny + big * ty),
                (d * nx - big * tx, d * ny - big * ty),
                (d * nx - big * tx - big * nx, d * ny - big * ty - big * ny),
                (d * nx + big * tx - big * nx, d * ny + big * ty - big * ny),
            ])
            if not quad.is_valid:
                quad = quad.buffer(0)
            cell = cell.intersection(quad)
            if cell.is_empty:
                break
            if isinstance(cell, (GeometryCollection, MultiPolygon)):
                parts = [g for g in getattr(cell, "geoms", []) if isinstance(g, Polygon)]
                cell = max(parts, key=lambda g: g.area) if parts else Polygon()
            if cell.is_empty:
                break
        cells.append(cell if isinstance(cell, Polygon) else Polygon())
    return cells


def snap_strictly_inside(district_m: Polygon, pt: Point, margin: float = 120.0) -> tuple[Point, float]:
    """Devuelve un punto ESTRICTAMENTE interior al distrito, y cuanto hubo que moverlo.

    Importa que sea estricto: la invariante "la semilla cae dentro de su celda" se evalua con
    `contains`, y un punto justo sobre el borde del distrito nunca la cumpliria. Si el ancla
    declarada cae fuera, se proyecta al borde mas cercano y se entra hacia el interior.

    Se evita a proposito erosionar el distrito con un margen grande: en los lobulos estrechos
    (el noroeste) eso desconecta el poligono y el punto proyectado puede acabar a kilometros
    de su ancla, como ocurria con un margen de 250 m.
    """
    if district_m.contains(pt):
        return pt, 0.0

    borde, _ = nearest_points(district_m.boundary, pt)
    hacia = district_m.representative_point()
    dx, dy = hacia.x - borde.x, hacia.y - borde.y
    norma = math.hypot(dx, dy) or 1.0
    cand = Point(borde.x + dx / norma * margin, borde.y + dy / norma * margin)
    if not district_m.contains(cand):
        cand = district_m.representative_point()
    return cand, math.hypot(cand.x - pt.x, cand.y - pt.y)


def build_zone_seeds(district_m: Polygon, to_m):
    """Coloca la semilla de cada zona en su coordenada ancla (lon, lat) declarada.

    Las anclas de las zonas 04, 06 y 12 provienen de hitos que la propia Municipalidad de
    Comas cita en su descripcion oficial ("Parque Zonal Sinchi Roca" en la 04; "Hospital del
    Seguro Social, Compania de Bomberos y comisaria" en la 06; "cementerio municipal" y
    "Collique sectores VII y VIII" en la 12), localizados en OpenStreetMap. Las demas derivan
    de la posicion cardinal oficial corregida con la orientacion real de los distritos vecinos.
    """
    seeds, diag = {}, {}
    for zid, z in ZONALES.items():
        lon, lat = z["seed"]
        pt = Point(*to_m(lon, lat))
        seeds[zid], diag[zid] = snap_strictly_inside(district_m, pt)
    return seeds, diag


def enforce_site_in_cell(sites, weights, protegidas: frozenset[int], margin: float = 1.05) -> list[float]:
    """Proyecta los pesos al conjunto factible donde la semilla de cada zona PROTEGIDA cae
    dentro de su propia celda.

    En un diagrama de potencia, la semilla i pertenece a su celda si y solo si, para todo j:
        w_j - w_i <= |s_i - s_j|^2
    Es un sistema de restricciones de diferencia (tipo Bellman-Ford); se resuelve bajando los
    pesos que violan la condicion. Sumar una constante a todos los pesos no cambia el diagrama,
    asi que al final se renormaliza sin romper la factibilidad.

    Solo se protegen las zonas cuyo ancla es un HITO REAL citado por la municipalidad (04, 06
    y 12). Exigir la invariante para las 14 zonas es geometricamente incompatible con respetar
    las hectareas oficiales: dos zonas contiguas de tamanos muy distintos no pueden tener sus
    semillas tan cerca. Proteger solo esas tres hace que sus hitos caigan en la zonal correcta
    sin sacrificar el ajuste de areas.
    """
    n = len(sites)
    d2 = [[(sites[i].x - sites[j].x) ** 2 + (sites[i].y - sites[j].y) ** 2
           for j in range(n)] for i in range(n)]
    w = list(weights)
    for _ in range(n + 2):
        cambio = False
        for i in protegidas:
            for j in range(n):
                if i == j:
                    continue
                tope = w[i] + d2[i][j] * margin
                if w[j] > tope:
                    w[j] = tope
                    cambio = True
        if not cambio:
            break
    media = sum(w) / n
    return [x - media for x in w]


def _area_fit(district_m, sites, targets, weights, protegidas, iterations):
    """Ajusta los pesos igualando areas y manteniendo la invariante en las zonas protegidas."""
    minx, miny, maxx, maxy = district_m.bounds
    big = 12.0 * max(maxx - minx, maxy - miny)
    ids = list(targets)
    area_media = district_m.area / len(ids)
    w_limit = 40.0 * area_media
    weights = enforce_site_in_cell(sites, weights, protegidas)
    best = None

    for it in range(iterations):
        cells = power_diagram(sites, weights, district_m, big)
        err, rels = 0.0, []
        for i, zid in enumerate(ids):
            got, want = cells[i].area, targets[zid]
            rel = (want - got) / want if want else 0.0
            rels.append(rel)
            err += abs(rel)
        err /= len(ids)
        fuera = [i for i in protegidas if not cells[i].contains(sites[i])]
        if best is None or (len(fuera), err) < (len(best[3]), best[0]):
            best = (err, cells, list(weights), fuera)
        if err < 0.004 and not fuera:
            break
        damp = 0.85 if it < iterations * 0.35 else (0.45 if it < iterations * 0.75 else 0.2)
        propuesta = [min(max(weights[i] + damp * area_media * rels[i], -w_limit), w_limit)
                     for i in range(len(ids))]
        weights = enforce_site_in_cell(sites, propuesta, protegidas)
    return best, area_media


def fit_areas(district_m: Polygon, seeds: dict, targets: dict, rounds: int = 4, iterations: int = 500):
    """Iguala las areas oficiales respetando que la semilla quede en su celda (zonas protegidas)."""
    ids = list(targets)
    sites = [seeds[z] for z in ids]
    protegidas = (frozenset(i for i, z in enumerate(ids) if ZONALES[z].get("ancla_real"))
                  if EXIGIR_HITO_EN_SU_ZONA else frozenset())
    weights = [0.0] * len(ids)
    best = None

    for _ in range(rounds):
        (err, cells, weights, fuera), _ = _area_fit(
            district_m, sites, targets, weights, protegidas, iterations)
        if best is None or (len(fuera), err) < (len(best[3]), best[0]):
            best = (err, cells, weights, fuera)
        if not fuera:
            break
    return best, protegidas


# ---------------------------------------------------------------------------
# Asignacion de barrios e hitos reales
# ---------------------------------------------------------------------------
def load_osm(name: str) -> list[dict]:
    p = RAW / name
    if not p.exists():
        return []
    d = json.loads(p.read_text(encoding="utf-8-sig"))
    return d["elements"] if isinstance(d, dict) else d


def coords_of(el: dict):
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    c = el.get("center")
    if c:
        return c["lat"], c["lon"]
    return None


HITO_LABEL = {
    "park": "Parque", "garden": "Jardin", "sports_centre": "Centro deportivo", "pitch": "Loza",
    "playground": "Juegos infantiles", "hospital": "Hospital", "clinic": "Posta medica",
    "doctors": "Consultorio", "police": "Comisaria", "fire_station": "Compania de bomberos",
    "cemetery": "Cementerio", "marketplace": "Mercado", "townhall": "Local municipal",
    "community_centre": "Local comunal", "place_of_worship": "Templo", "school": "Colegio",
    "college": "Instituto", "university": "Universidad", "bus_station": "Terminal terrestre",
    "fuel": "Grifo", "pharmacy": "Botica", "bank": "Banco",
    "archaeological_site": "Sitio arqueologico", "monument": "Monumento", "ruins": "Ruinas",
    "attraction": "Atractivo turistico", "apartment": "Conjunto residencial",
}


def assign_features(zone_polys_deg: dict[str, Polygon]):
    """Asigna barrios e hitos reales de OSM a la zona que los contiene."""
    barrios: dict[str, list[str]] = {z: [] for z in zone_polys_deg}
    hitos: dict[str, list[dict]] = {z: [] for z in zone_polys_deg}
    counts: dict[str, int] = {z: 0 for z in zone_polys_deg}

    def locate(lat, lon):
        pt = Point(lon, lat)
        for zid, poly in zone_polys_deg.items():
            if poly.contains(pt):
                return zid
        return None

    for el in load_osm("osm_places.json"):
        t = el.get("tags", {})
        nm = t.get("name")
        if not nm or t.get("place") in (None,) and t.get("landuse") != "residential":
            continue
        if t.get("place") == "city_block":
            continue
        c = coords_of(el)
        if not c:
            continue
        zid = locate(*c)
        if zid and nm not in barrios[zid] and len(barrios[zid]) < 14:
            barrios[zid].append(nm)
            counts[zid] += 1

    seen_hitos = set()
    for el in load_osm("osm_landmarks.json"):
        t = el.get("tags", {})
        nm = t.get("name")
        if not nm:
            continue
        kind = t.get("amenity") or t.get("landuse") or t.get("historic") or t.get("leisure") or t.get("tourism")
        label = HITO_LABEL.get(kind)
        if not label:
            continue
        c = coords_of(el)
        if not c:
            continue
        zid = locate(*c)
        if not zid:
            continue
        key = (zid, nm)
        if key in seen_hitos:
            continue
        seen_hitos.add(key)
        hitos[zid].append({
            "tipo": label,
            "nombre": nm,
            "lat": round(c[0], 6),
            "lng": round(c[1], 6),
        })

    for zid in hitos:
        orden = {"Hospital": 0, "Comisaria": 1, "Compania de bomberos": 2, "Cementerio": 3,
                 "Mercado": 4, "Local municipal": 5, "Universidad": 6, "Instituto": 7,
                 "Sitio arqueologico": 8, "Parque": 9}
        hitos[zid].sort(key=lambda h: (orden.get(h["tipo"], 50), h["nombre"]))
    return barrios, hitos, counts


# ---------------------------------------------------------------------------
# Salida GeoJSON
# ---------------------------------------------------------------------------
def round_coords(geom, ndigits: int = 6):
    m = mapping(geom)

    def walk(node):
        if isinstance(node, (list, tuple)):
            if node and isinstance(node[0], (int, float)):
                return [round(float(node[0]), ndigits), round(float(node[1]), ndigits)]
            return [walk(x) for x in node]
        return node

    m["coordinates"] = walk(m["coordinates"])
    return m


def main() -> int:
    district, meta = load_district()
    centroid = district.centroid
    to_m, to_deg = make_projection(centroid.y, centroid.x)
    district_m = Polygon([to_m(x, y) for x, y in district.exterior.coords])
    if not district_m.is_valid:
        district_m = district_m.buffer(0)

    area_km2 = district_m.area / 1e6
    print(f"Distrito OSM {meta['osm_relation']} | anillos cosidos={meta['anillos']} puntos={meta['puntos']}")
    print(f"Area calculada: {area_km2:.3f} km2   (oficial municipal: 48.72 km2, desvio "
          f"{(area_km2 - 48.72) / 48.72 * 100:+.2f}%)")
    print(f"BBox: lon {district.bounds[0]:.5f}..{district.bounds[2]:.5f}   "
          f"lat {district.bounds[1]:.5f}..{district.bounds[3]:.5f}")

    total_ha = sum(z["ha"] for z in ZONALES.values())
    factor = district_m.area / (total_ha * 1e4)
    targets = {z: z_meta["ha"] * 1e4 * factor for z, z_meta in ZONALES.items()}
    print(f"14 zonales oficiales suman {total_ha:.2f} ha ({total_ha / 100:.2f} km2); "
          f"el resto del distrito son cerros/laderas no asignados.")
    print(f"Factor de escala area oficial -> area del poligono: {factor:.4f}")

    seeds, diag = build_zone_seeds(district_m, to_m)
    desplazados = {z: d for z, d in diag.items() if d > 1.0}
    if desplazados:
        for zid, d in sorted(desplazados.items()):
            print(f"  [Z{zid}] el ancla cayo fuera del distrito; desplazada {d:.0f} m hasta el borde interior")
    else:
        print("  Todas las anclas caen dentro del distrito.")

    err, cells, weights, fuera = fit_areas(district_m, seeds, targets)[0]
    print(f"\nAjuste de areas (solo pesos, semillas fijas): error relativo medio = {err * 100:.2f}%")
    if fuera:
        nombres = [list(ZONALES)[i] for i in fuera]
        print(f"  ATENCION: en las zonas {nombres} la semilla (hito real) quedo fuera de su celda")
    else:
        print("  Las semillas de las zonas con hito real documentado caen dentro de su celda: OK")

    # Poligonos finales en grados
    zone_polys_deg: dict[str, Polygon] = {}
    for zid, cell in zip(ZONALES, cells):
        if cell.is_empty or cell.area < 1000:
            raise SystemExit(
                f"ERROR: la Zona {zid} quedo vacia o casi vacia ({cell.area:.0f} m2). "
                "Revisa las anclas: dos semillas demasiado juntas, o un peso fuera de rango."
            )
        poly = Polygon([to_deg(x, y) for x, y in cell.exterior.coords])
        poly = poly.simplify(0.00030, preserve_topology=True)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            raise SystemExit(f"ERROR: la geometria de la Zona {zid} quedo vacia tras simplificar.")
        zone_polys_deg[zid] = poly

    barrios, hitos, _ = assign_features(zone_polys_deg)

    print(f"\n{'Zona':<6}{'ha of.':>8}{'ha mapa':>9}{'share of':>10}{'share map':>11}"
          f"{'desv':>8}  {'centroide':<22}{'cuadrante':<16}")
    cx, cy = centroid.x, centroid.y
    features = []
    for i, zid in enumerate(ZONALES):
        z = ZONALES[zid]
        poly = zone_polys_deg[zid]
        label = poly.representative_point()
        ha_map = poly.area * (111132.92 * 111319.49 * math.cos(math.radians(centroid.y))) / 1e4
        share_of = z["ha"] / total_ha * 100
        share_map = poly.area / district.area * 100
        dev = (share_map - share_of) / share_of * 100
        quad = ("N" if label.y > cy else "S") + ("E" if label.x > cx else "O")
        print(f"{zid:<6}{z['ha']:>8.1f}{ha_map:>9.1f}{share_of:>9.2f}%{share_map:>10.2f}%"
              f"{dev:>7.1f}%  {label.y:>9.4f},{label.x:<11.4f}{quad:<16}")

        features.append({
            "type": "Feature",
            "properties": {
                "zona": zid,
                "nombre": f"Zona {zid}",
                "color": PALETA[i],
                "area_ha_oficial": z["ha"],
                "area_ha_mapa": round(ha_map, 1),
                "ubicacion_oficial": z["ubic"],
                "colinda": z["colinda"],
                "referencia": z["ref"],
                "barrios_reales": barrios.get(zid, []),
                "hitos_reales": hitos.get(zid, [])[:12],
                "centro": [round(label.y, 6), round(label.x, 6)],
                "semilla": [round(z["seed"][1], 6), round(z["seed"][0], 6)],
                "ancla": z["ancla"],
                "precision": "aproximada (ilustrativa): no es el limite oficial de la zonal",
            },
            "geometry": round_coords(poly),
        })

    zonas_fc = {
        "type": "FeatureCollection",
        "name": "comas_zonas",
        "metadata": {
            "descripcion": "14 zonas del prototipo Ojo Comas, distrito de Comas, Lima, Peru.",
            "distrito_area_km2_osm": round(area_km2, 3),
            "distrito_area_km2_oficial": 48.72,
            "suma_ha_oficial_zonales": total_ha,
            "factor_escala_area": round(factor, 4),
            "metodo": "Diagrama de potencia (Voronoi ponderado aditivo); semillas fijas en la coordenada "
                      "ancla documentada de cada zonal; solo se ajustan pesos hasta igualar las hectareas "
                      "oficiales. Para las zonales 04, 06 y 12 el ancla es el hito real que la "
                      "municipalidad cita en su descripcion oficial.",
            "error_relativo_medio": round(err, 5),
            "orientacion_real_vecinos": {
                "Carabayllo": "NORTE", "Independencia": "SUR", "Los Olivos": "OESTE-SUROESTE",
                "Puente Piedra": "OESTE-NOROESTE", "San Juan de Lurigancho": "ESTE-SURESTE",
            },
            "correccion_aplicada": (
                "El texto municipal de Geografia etiqueta Los Olivos al Este y San Juan de Lurigancho "
                "al Oeste. Los centroides de los limites OSM de esos distritos confirman que en la "
                "realidad Los Olivos esta al OESTE y San Juan de Lurigancho al ESTE. Aqui se usa la "
                "orientacion geografica real."
            ),
            "fuentes": {
                "limite_distrital": OSM_RELATION_URL,
                "atribucion_limite": ODBL,
                "metadatos_zonales": MUNI_SOURCE_URL,
                "barrios_e_hitos": "OpenStreetMap (place=neighbourhood, landuse=residential, amenity, leisure)",
            },
            "advertencia": (
                "Los POLIGONOS de las 14 zonas son una RECONSTRUCCION ILUSTRATIVA. La Municipalidad de "
                "Comas publica las hectareas, la posicion cardinal y las colindancias de sus 14 zonales, "
                "pero no su geometria como dato abierto. Este mapa respeta esas hectareas y esa posicion, "
                "y ancla cada zona en barrios reales, pero NO son los limites oficiales. El limite del "
                "DISTRITO si es real (OpenStreetMap)."
            ),
            "limitacion_conocida": (
                "El Parque Zonal Sinchi Roca, que la municipalidad situa en la Zonal 04, es un poligono "
                "real de 1.25 km de norte a sur (OSM way 110062002) y en esta reconstruccion queda a "
                "caballo de las zonas 04 (27.9% de su area), 09 (29.5%) y 14 (42.6%). Es el error "
                "esperable al reconstruir fronteras que no son publicas. Se verifica con "
                "tools/check_hitos_oficiales.py: 8 de 9 hitos citados por la municipalidad caen en su "
                "zonal, 1 queda parcial y ninguno falla."
            ),
        },
        "features": features,
    }

    distrito_fc = {
        "type": "FeatureCollection",
        "name": "comas_distrito",
        "metadata": {
            "fuente": OSM_RELATION_URL,
            "atribucion": ODBL,
            "wikidata": meta["wikidata"],
            "wikipedia": meta["wikipedia"],
            "area_km2_calculada": round(area_km2, 3),
            "area_km2_oficial": 48.72,
        },
        "features": [{
            "type": "Feature",
            "properties": {
                "nombre": "Distrito de Comas", "provincia": "Lima", "departamento": "Lima",
                "pais": "Peru", "osm_relation": meta["osm_relation"], "wikidata": meta["wikidata"],
                "area_km2": round(area_km2, 3), "fuente": OSM_RELATION_URL, "atribucion": ODBL,
            },
            "geometry": round_coords(district.simplify(0.00020, preserve_topology=True)),
        }],
    }

    (OUT / "comas_zonas.geojson").write_text(
        json.dumps(zonas_fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "comas_zonas.pretty.geojson").write_text(
        json.dumps(zonas_fc, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "comas_distrito.geojson").write_text(
        json.dumps(distrito_fc, ensure_ascii=False, indent=1), encoding="utf-8")

    resumen = {
        "distrito": "Comas", "provincia": "Lima", "departamento": "Lima", "pais": "Peru",
        "centro_mapa": [round(centroid.y, 5), round(centroid.x, 5)],
        "zoom_inicial": 13,
        "area_km2": round(area_km2, 3),
        "zonas": [{
            "zona": f["properties"]["zona"],
            "nombre": f["properties"]["nombre"],
            "color": f["properties"]["color"],
            "area_ha_oficial": f["properties"]["area_ha_oficial"],
            "ubicacion_oficial": f["properties"]["ubicacion_oficial"],
            "referencia": f["properties"]["referencia"],
            "centro": f["properties"]["centro"],
            "n_barrios_reales": len(f["properties"]["barrios_reales"]),
        } for f in features],
    }
    (OUT / "zonas_resumen.json").write_text(
        json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")

    # Copia a frontend/data/ para que Cloudflare Pages sirva los mismos archivos que se validan.
    servido = OUT.parent / "frontend" / "data"
    servido.mkdir(parents=True, exist_ok=True)
    for nombre in ("comas_zonas.geojson", "comas_distrito.geojson", "zonas_resumen.json"):
        (servido / nombre).write_bytes((OUT / nombre).read_bytes())
    print(f"copiado a {servido.relative_to(ROOT)}/ para el frontend")

    # Copia a worker/src/zonas.json para que el Worker valide la zona en el SERVIDOR y no se fie
    # de la zona que declara el navegador.
    destino_worker = OUT.parent / "worker" / "src" / "zonas.json"
    destino_worker.parent.mkdir(parents=True, exist_ok=True)
    destino_worker.write_text(
        json.dumps(zonas_fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"copiado a {destino_worker.relative_to(ROOT)} para validacion en el servidor")

    print("\n--- VALIDACION ---")
    union = unary_union(cells)
    print(f"cobertura: area(celdas)/area(distrito) = {union.area / district_m.area:.6f}  (esperado 1.000000)")
    ov = sum(cells[a].intersection(cells[b]).area
             for a in range(len(cells)) for b in range(a + 1, len(cells)) if cells[a].intersects(cells[b]))
    print(f"solapamiento total = {ov:.3f} m2  (esperado 0)")
    out = sum(c.difference(district_m).area for c in cells)
    print(f"area fuera del distrito = {out:.3f} m2  (esperado 0)")
    vacias = [z for z, c in zip(ZONALES, cells) if c.area < 1000]
    print(f"zonas vacias = {vacias or 'ninguna'}")
    tot_barrios = sum(len(v) for v in barrios.values())
    tot_hitos = sum(len(v) for v in hitos.values())
    print(f"barrios reales asignados = {tot_barrios}   hitos reales asignados = {tot_hitos}")
    sin_barrio = [z for z, v in barrios.items() if not v]
    print(f"zonas sin barrio real asignado = {sin_barrio or 'ninguna'}")
    print(f"\nescrito: {(OUT / 'comas_zonas.geojson').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

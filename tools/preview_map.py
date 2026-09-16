"""Renderiza un PNG de verificacion de las 14 zonas de Comas."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches as mpatches  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    zonas = json.loads((ROOT / "data" / "comas_zonas.geojson").read_text(encoding="utf-8"))
    dist = json.loads((ROOT / "data" / "comas_distrito.geojson").read_text(encoding="utf-8"))

    fig, ax = plt.subplots(figsize=(13, 13))
    for f in dist["features"]:
        ring = f["geometry"]["coordinates"][0]
        ax.plot([p[0] for p in ring], [p[1] for p in ring], color="#111", lw=2.5, zorder=3)

    for f in zonas["features"]:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        rings = [coords] if f["geometry"]["type"] == "Polygon" else coords
        for ring in rings:
            ax.fill([q[0] for q in ring], [q[1] for q in ring],
                    color=p["color"], alpha=0.42, zorder=1)
            ax.plot([q[0] for q in ring], [q[1] for q in ring],
                    color=p["color"], lw=1.4, zorder=2)
        lat, lon = p["centro"]
        ax.plot(lon, lat, "o", color="#111", ms=4, zorder=4)
        ax.annotate(f"{p['zona']}\n{p['area_ha_oficial']:.0f}ha", (lon, lat),
                    textcoords="offset points", xytext=(0, 0), ha="center", va="center",
                    fontsize=11, fontweight="bold", color="#111", zorder=5)

    # Hitos clave citados por la municipalidad
    for f in zonas["features"]:
        for h in f["properties"].get("hitos_reales", []):
            if h["tipo"] in ("Hospital", "Comisaria", "Cementerio", "Compania de bomberos", "Mercado"):
                ax.plot(h["lng"], h["lat"], "s", color="#B00020", ms=3.5, zorder=6)

    handles = [mpatches.Patch(color=f["properties"]["color"],
                              label=f"Z{f['properties']['zona']}  {f['properties']['area_ha_oficial']:.0f} ha")
               for f in zonas["features"]]
    ax.legend(handles=handles, ncol=5, fontsize=9, loc="lower left", framealpha=0.95)
    ax.set_title("PROTOTIPO Ojo Comas - 14 zonas (reconstruccion ilustrativa)\n"
                 "limite distrital real: OpenStreetMap; areas: hectareas oficiales de la MD Comas",
                 fontsize=13)
    ax.set_xlabel("longitud")
    ax.set_ylabel("latitud")
    ax.set_aspect(1.0 / 0.978)
    ax.grid(alpha=0.25, lw=0.5)
    ax.text(0.99, 0.01, "DATOS FICTICIOS - prototipo de demostracion",
            transform=ax.transAxes, ha="right", va="bottom", fontsize=9, color="#B00020")

    out = ROOT / "data" / "preview_zonas.png"
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    print(f"escrito: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

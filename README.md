# Ojo Comas — Prototipo de reporte ciudadano

> ⚠️ **PROTOTIPO DE DEMOSTRACIÓN — Datos 100 % ficticios. No representa oficialmente a la
> Municipalidad Distrital de Comas. Cumple con la Ley N° 29733 de Protección de Datos Personales.**

Aplicación web *móvil-first* para que los vecinos del distrito de **Comas** (Lima, Perú) reporten
problemas de su calle con una foto y geolocalización, y hagan seguimiento del estado de cada
reporte. Incluye un mapa del distrito dividido en sus **14 zonas oficiales**, filtros por zona,
panel de transparencia y un banner legal permanente.

Es un **prototipo demostrativo sin fines oficiales**, pensado para mostrar a los vecinos cómo la
tecnología puede mejorar la gestión municipal. **No es un canal oficial de reclamos** y no
sustituye a la Municipalidad Distrital de Comas.

---

## Índice

- [Qué hace](#qué-hace)
- [Cumplimiento legal](#cumplimiento-legal)
- [Arquitectura](#arquitectura)
- [Los datos: qué es real y qué es ficticio](#los-datos-qué-es-real-y-qué-es-ficticio)
- [Cómo ejecutarlo en local](#cómo-ejecutarlo-en-local)
- [API](#api)
- [Pruebas y verificación](#pruebas-y-verificación)
- [Despliegue](#despliegue)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Atribuciones y créditos](#atribuciones-y-créditos)

---

## Qué hace

1. **Reportar** un problema en tres pasos: categoría (bache, basura, alumbrado, otro) → zona y
   descripción con foto → envío. Al tocar el mapa aparece un botón flotante «➕ Reportar aquí».
2. **Ubicar** el punto con `navigator.geolocation` (con el clic en el mapa como respaldo),
   geocodificación inversa con Nominatim y **detección automática de la zona** con Turf.js.
3. **Seguimiento** del estado de cada reporte: `pendiente` → `en_proceso` → `resuelto`, con
   historial de cambios trazable.
4. **Filtrar** por las 14 zonas del distrito y por estado, con el mapa centrándose en la zona
   elegida.
5. **Apoyo vecinal**: los vecinos pueden respaldar un reporte (una vez por origen), para
   demostrar prioridades sentidas por la comunidad (Ley N° 27972, Art. 53).
6. **Transparencia**: contadores, gráfico de barras por zona y ranking de zonas con más reportes.

---

## Cumplimiento legal

### Ley N° 29733 — Protección de Datos Personales

| Requisito | Cómo se cumple |
|---|---|
| No recopilar datos identificables | El reporte es **anónimo por defecto**. No se piden DNI, nombres, correo ni teléfono. |
| Consentimiento informado si hay contacto | El campo de contacto está deshabilitado hasta marcar la casilla: *«Acepto que mis datos de contacto sean tratados conforme a la Ley N° 29733 para fines de seguimiento de este reporte.»* |
| Minimización | El servidor **descarta el contacto** si `consentimiento` es `false`, y una restricción `CHECK` en D1 impide guardar contacto sin consentimiento. |
| No exponer datos personales | Ninguna respuesta pública incluye `contact`, `consent` ni `ip_hash`. Está verificado automáticamente en la prueba de humo. |
| Direcciones IP | **No se almacenan.** Solo se guarda un SHA-256 de `(IP + fecha + sal secreta)` que rota a diario y sirve únicamente para limitar abusos. |
| Política de privacidad | Modal accesible desde el banner superior y el pie de página. |

### D.S. N° 029-2021-PCM — Gobierno Digital

- **Accesibilidad**: contraste AA, tipografía mínima de 16 px, áreas táctiles de 44 px, foco
  visible, navegación por teclado, `aria-modal`/`role="dialog"` en los modales, `aria-live` en los
  avisos y respeto a `prefers-reduced-motion`.
- **Interoperabilidad**: API REST con respuestas **GeoJSON** estándar, filtros por consulta y
  códigos de estado HTTP correctos.
- **Experiencia del ciudadano**: tres pasos, feedback inmediato y funcionamiento degradado
  (si la API no responde, la app usa datos de demostración locales en vez de quedarse vacía).

### Ley N° 27972 — Ley Orgánica de Municipalidades

- Fomenta la **participación vecinal** (Art. 53): reporte abierto y apoyo a reportes de otros.
- **No suplanta** a la Municipalidad: el banner de advertencia es fijo y visible en toda la
  interfaz, y el pie de página lo repite.

---

## Arquitectura

```
Navegador (móvil primero)
  └── Cloudflare Pages  ·  HTML + CSS + JS vanilla, sin build step
        · Leaflet 1.9.4      mapa y polígonos de las 14 zonas
        · Turf.js 7          detección automática de zona (booleanPointInPolygon)
        · Turnstile          verificación antibot (widget)
        · Chart.js 4         panel de transparencia
        · canvas-confetti    confirmación visual al enviar
              │  fetch JSON / GeoJSON
              ▼
        Cloudflare Worker «ojo-comas-api» (Hono + TypeScript)
              · Valida Turnstile contra siteverify (falla cerrado)
              · Deduce la zona en el SERVIDOR a partir de las coordenadas
              · Valida y limita el tamaño de la imagen
              · Limita abusos por hash de IP con sal diaria
              ├── D1   (SQLite)  reportes, historial de estados, apoyos
              └── R2             fotos de evidencia
              │
              └── Nominatim (OpenStreetMap)  dirección aproximada
```

| Capa | Tecnología |
|---|---|
| Frontend | Cloudflare Pages · HTML/CSS/JS + Leaflet + Turf.js + Chart.js |
| Backend | Cloudflare Workers + Hono (TypeScript) |
| Base de datos | Cloudflare D1 (SQLite) con migraciones versionadas |
| Almacenamiento | Cloudflare R2 |
| Antibots | Cloudflare Turnstile (siteverify en el servidor) |
| Geocodificación | Nominatim (OpenStreetMap) |
| CI/CD | GitHub Actions (CI sin credenciales + despliegue) |

---

## Los datos: qué es real y qué es ficticio

Este proyecto mezcla datos **reales y verificables** con datos **ficticios**. La distinción importa
y está marcada en la propia interfaz.

### Real ✅

| Dato | Fuente |
|---|---|
| **Límite del distrito de Comas** | OpenStreetMap, relación [`1944720`](https://www.openstreetmap.org/relation/1944720) (wikidata Q1113426). Área calculada **48,97 km²** frente a los **48,72 km²** oficiales (desvío +0,51 %). |
| **Las 14 zonas existen y son oficiales** | Municipalidad Distrital de Comas, [Geografía](https://www.municomas.gob.pe/distrito/geografia). |
| **Hectáreas oficiales de cada zonal** | Ibíd. (p. ej. Zonal 14 = 553,29 ha; Zonal 10 = 125,30 ha). |
| **Posición cardinal y colindancias de cada zonal** | Ibíd. |
| **Barrios reales** | OpenStreetMap (`place=neighbourhood`, `landuse=residential`). 119 barrios asignados. |
| **Hitos reales** | OpenStreetMap (`amenity`, `leisure`, `historic`). 794 hitos asignados. |
| **Avenidas y equipamientos citados por la municipalidad** | Ibíd. (Av. Túpac Amaru, Av. Universitaria, Parque Zonal Sinchi Roca, etc.). |
| **Orientación real de los distritos vecinos** | Centroides de sus límites en OpenStreetMap. |

### Ficticio ⚠️

| Dato | Aclaración |
|---|---|
| **Todos los reportes, fotos, descripciones y estados** | Generados por `tools/build_seed.py`. No describen problemas reales. Las «fotos» son ilustraciones SVG con la marca de agua «FOTO SIMULADA». |
| **Contadores, apoyos y fechas** | Inventados. |
| **Los polígonos de las 14 zonas** | **Reconstrucción ilustrativa**, ver abajo. |

### La advertencia más importante: los polígonos de las zonas

La Municipalidad de Comas publica las **hectáreas**, la **posición cardinal** y las
**colindancias** de sus 14 zonales, pero **no publica su geometría como dato abierto**. Buscamos un
GeoJSON o shapefile oficial y no existe; en OpenStreetMap tampoco hay subdivisiones
(`admin_level` 9/10/11) dentro del distrito.

Por eso los polígonos de las 14 zonas son una **reconstrucción generada por
`tools/build_zonas.py`** que respeta lo que sí es público:

- se reparte el **límite real del distrito** en 14 celdas con un **diagrama de potencia**
  (Voronoi ponderado aditivo); sólo se ajustan pesos hasta que el área de cada celda sea
  proporcional a las **hectáreas oficiales** (error relativo medio **0,38 %**);
- las celdas se siembran en **anclas documentadas**: para las Zonales 04, 06 y 12 el ancla es el
  hito real que la municipalidad cita en su descripción (Parque Zonal Sinchi Roca; hospital,
  compañía de bomberos y comisaría; Collique y su cementerio), localizado en OpenStreetMap;
- la cobertura es **exacta** (suma de áreas = área del distrito, sin solapes ni huecos), así que
  cualquier clic cae en una y sólo una zona.

**Los polígonos NO son los límites oficiales.** Cualquier uso que dependa de la frontera exacta
entre zonas necesita el dato oficial de la municipalidad.

#### Corrección de orientación

El texto municipal etiqueta mal el Este y el Oeste en varias zonales (pone Los Olivos al Este y
San Juan de Lurigancho al Oeste). Los centroides de los límites OSM de esos distritos confirman
que en la realidad **Los Olivos está al OESTE**, **San Juan de Lurigancho al ESTE**,
**Independencia al SUR** y **Carabayllo al NORTE**. La reconstrucción usa la orientación
geográfica real.

---

## Cómo ejecutarlo en local

### Requisitos

- Node.js ≥ 20
- Python ≥ 3.10 con `shapely` (sólo para regenerar la cartografía y los datos ficticios)
- Sin cuenta de Cloudflare: todo corre contra D1 y R2 **simulados en disco**

### Puesta en marcha

```bash
# 1) Dependencias del Worker
npm --prefix worker install

# 2) (Opcional) Regenerar la cartografía y los datos ficticios desde el dato crudo de OSM
python -m pip install shapely
python tools/build_zonas.py        # 14 zonas + límite distrital
python tools/check_hitos_oficiales.py
python tools/build_seed.py         # 28 reportes ficticios + fotos simuladas

# 3) Base de datos local y fotos
npm --prefix worker run db:migrate:local
npm --prefix worker run db:seed:local
# subir las fotos simuladas a R2 local (PowerShell):
Get-ChildItem frontend/fotos/*.svg | ForEach-Object {
  npx --prefix worker wrangler r2 object put "ojo-comas-fotos/demo/$($_.Name)" `
    --file="$($_.FullName)" --content-type="image/svg+xml" --local
}

# 4) Arrancar la API (terminal 1)
npm --prefix worker run dev            # http://127.0.0.1:8787

# 5) Servir el frontend (terminal 2)
npx wrangler pages dev frontend --port 8788

# 6) Abrir http://127.0.0.1:8788
```

Para que el frontend llame a la API en otro puerto, edita `frontend/config.js` y pon
`apiBase: 'http://127.0.0.1:8787'`. Ese origen ya está incluido en `CORS_ORIGINS`.

### Turnstile en local

El proyecto usa por defecto las **claves de prueba oficiales** de Cloudflare, así que el flujo
real de `siteverify` se ejecuta de verdad sin necesidad de cuenta:

| Clave | Comportamiento |
|---|---|
| sitekey `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA` | siempre pasa |
| secret `2x0000000000000000000000000000000AA` | siempre rechaza |
| secret `3x0000000000000000000000000000000AA` | fuerza desafío interactivo |

> Verificado contra el endpoint real: con las claves de prueba `siteverify` devuelve
> `success: true` para cualquier token no vacío, pero con **`action` vacío** y
> `hostname: "example.com"`. Por eso el Worker **no exige `action` cuando detecta una clave de
> prueba**; con una clave real la exige siempre. No confundas «pasa en local» con «protegido en
> producción».

---

## API

Base local: `http://127.0.0.1:8787`. Todas las respuestas son JSON; los listados son **GeoJSON**.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio, D1 y R2. |
| `GET` | `/api/zonas` | Las 14 zonas con su geometría, hectáreas oficiales, colindancias, barrios e hitos reales. |
| `GET` | `/api/reports` | Listado como `FeatureCollection`. Filtros: `zona`, `estado`, `categoria`, `bbox`, `limit`. |
| `GET` | `/api/reports/:id` | Un reporte y su **historial de estados**. |
| `POST` | `/api/report` | Crea un reporte. Requiere token de Turnstile. |
| `POST` | `/api/reports/:id/confirm` | Apoyo vecinal (uno por origen). Requiere Turnstile. |
| `PATCH` | `/api/reports/:id/status` | Cambia el estado. Requiere `Authorization: Bearer <ADMIN_TOKEN>`. |
| `GET` | `/api/stats` | Contadores, reparto por estado, categoría y zona, y ranking. |
| `GET` | `/api/photos/*` | Sirve la foto desde R2. |

### Crear un reporte

```http
POST /api/report
Content-Type: application/json

{
  "categoria": "bache",
  "descripcion": "Hueco grande en la pista de la Av. Tupac Amaru",
  "lat": -11.9507,
  "lng": -77.0432,
  "zona": "01",
  "direccion": "Av. Tupac Amaru",
  "fotoBase64": "data:image/jpeg;base64,...",
  "turnstileToken": "...",
  "contacto": null,
  "consentimiento": false
}
```

Respuesta `201`:

```json
{ "ok": true, "id": 29, "zona": "01", "estado": "pendiente",
  "foto_url": "/api/photos/reportes/2026/09/<uuid>.jpg",
  "mensaje": "¡Gracias! Tu reporte fue registrado." }
```

**La zona la calcula el servidor.** Si el navegador envía una zona distinta a la que corresponde
a las coordenadas, el servidor la ignora y guarda la correcta (probado en la suite de humo).

### Códigos de error

| Código | Cuándo |
|---|---|
| `400` | Validación: categoría, coordenadas, descripción > 140 caracteres, imagen no válida, punto fuera del distrito. |
| `401` | `PATCH` de estado sin token válido. |
| `403` | Turnstile ausente o rechazado. |
| `404` | Reporte o foto inexistente. |
| `409` | Apoyo duplicado al mismo reporte. |
| `413` | Foto que supera `MAX_FOTO_BYTES` (2 MB por defecto). |
| `429` | Se superó `MAX_REPORTES_POR_HORA` por origen. |

---

## Pruebas y verificación

### Prueba de humo end-to-end

Ejercita el Worker **real** por HTTP contra `wrangler dev`, con D1, R2 y el `siteverify` real de
Turnstile. No hay simulaciones.

```bash
# API (terminal 1)
npm --prefix worker run dev

# Suite completa (terminal 2)
node worker/scripts/smoke.mjs --base http://127.0.0.1:8787 --admin-token <tu-ADMIN_TOKEN>
```

Modos adicionales:

```bash
# Turnstile configurado para bloquear: todo reporte debe ser rechazado con 403
npx --prefix worker wrangler dev --port 8790 --var TURNSTILE_SECRET:2x0000000000000000000000000000000AA
node worker/scripts/smoke.mjs --base http://127.0.0.1:8790 --modo bloqueo

# Limite de abuso en 1 por hora: el primero entra, los siguientes reciben 429
npx --prefix worker wrangler dev --port 8791 --var MAX_REPORTES_POR_HORA:1
node worker/scripts/smoke.mjs --base http://127.0.0.1:8791 --modo limite
```

Cobertura de la suite: salud y bindings, zonas, listado GeoJSON, filtros y validación de
parámetros, detalle con historial, estadísticas coherentes, fotos desde R2, creación real con
subida a R2, la zona la decide el servidor, seguridad de Turnstile, validación de entrada,
privacidad (el contacto nunca se devuelve), apoyo vecinal, cambio de estado con token y errores.

### Verificaciones de cartografía

```bash
python tools/verify_zonas.py            # topología, cuadrantes, colindancias y mapa ASCII
python tools/check_hitos_oficiales.py   # hitos citados por la municipalidad en su zonal
python tools/preview_map.py             # PNG de vista previa
```

Resultados de la última ejecución completa: ver [`docs/VERIFICACION.md`](docs/VERIFICACION.md).

---

## Despliegue

### 1. Crear los recursos en Cloudflare

```bash
npx wrangler d1 create ojo-comas-db          # copia el database_id
npx wrangler r2 bucket create ojo-comas-fotos
```

Sustituye `database_id` en `worker/wrangler.jsonc` (bloque `env.produccion`) por el ID real y los
marcadores `REEMPLAZAR-CON-*` por tus valores.

### 2. Cargar los secretos del Worker

```bash
cd worker
npx wrangler secret put TURNSTILE_SECRET --env produccion   # secreto REAL del widget
npx wrangler secret put ADMIN_TOKEN      --env produccion
npx wrangler secret put IP_SALT          --env produccion
```

Los secretos **nunca** se escriben en el repositorio: en local viven en `worker/.dev.vars`
(ignorado por git) y en producción en el almacén de secretos de Cloudflare.

### 3. Crear el widget de Turnstile

En el panel de Cloudflare, crea un widget en modo *managed* y **registra el dominio de Pages**.
Copia la sitekey a `frontend/config.js` (`turnstileSitekey`) y el secreto al paso anterior.

### 4. Migrar y sembrar la base remota

```bash
cd worker
npx wrangler d1 migrations apply ojo-comas-db --remote --env produccion
npx wrangler d1 execute ojo-comas-db --remote --env produccion --file=./seed.sql   # opcional: datos ficticios
```

### 5. Desplegar

```bash
cd worker && npx wrangler deploy --env produccion
cd .. && npx wrangler pages deploy frontend --project-name ojo-comas
```

O deja que lo haga GitHub Actions: configura los *secrets* `CLOUDFLARE_API_TOKEN` y
`CLOUDFLARE_ACCOUNT_ID`, y las *variables* `D1_DATABASE_ID`, `TURNSTILE_SITEKEY` y
`PAGES_DOMINIO`. El flujo [`deploy.yml`](.github/workflows/deploy.yml) sustituye los marcadores,
regenera tipos, aplica migraciones, despliega el Worker y publica Pages.

> El flujo [`ci.yml`](.github/workflows/ci.yml) **no necesita credenciales**: verifica la
> cartografía, los hitos, los tipos, la sintaxis y toda la suite de humo contra el runtime local.

---

## Estructura del repositorio

```
ojo-comas/
├── frontend/                    Cloudflare Pages (sin build step)
│   ├── index.html               banner legal, mapa, formulario de 3 pasos, feed, transparencia
│   ├── styles.css               diseño móvil-first (Inter, bordes 20px, foco visible)
│   ├── app.js                   Leaflet, Turf, geolocalización, Turnstile, Chart.js, confeti
│   ├── config.js                apiBase y sitekey (se puede reescribir al desplegar)
│   ├── _headers                 cabeceras de seguridad de Pages
│   ├── data/                    GeoJSON de zonas y distrito + respaldo offline
│   └── fotos/                   «fotos» simuladas (SVG con marca de agua)
├── worker/                      Cloudflare Worker (Hono + TypeScript)
│   ├── src/index.ts             rutas de la API
│   ├── src/turnstile.ts         siteverify con fallo cerrado
│   ├── src/zonas.ts             geometría y validación de zona en el servidor
│   ├── src/util.ts              validación, privacidad, imágenes, respuestas
│   ├── src/zonas.json           copia del GeoJSON (generada)
│   ├── migrations/0001_init.sql esquema D1 con restricciones de privacidad
│   ├── seed.sql                 28 reportes ficticios (generado)
│   ├── wrangler.jsonc           bindings D1/R2, vars y entorno de producción
│   └── scripts/smoke.mjs        prueba de humo end-to-end
├── data/                        dato de referencia y crudo
│   ├── raw/                     respuestas crudas de Overpass + página municipal archivada
│   ├── comas_zonas.geojson      14 zonas (generado)
│   └── comas_distrito.geojson   límite distrital real (generado)
├── tools/                       pipeline de datos en Python
│   ├── build_zonas.py           cartografía de las 14 zonas
│   ├── build_seed.py            datos ficticios y fotos simuladas
│   ├── check_hitos_oficiales.py verificación contra las afirmaciones municipales
│   ├── verify_zonas.py          verificación topológica
│   ├── fetch_osm_extra.py       descarga de barrios, hitos y vías
│   └── fetch_vecinos.py         orientación real de los distritos vecinos
├── docs/VERIFICACION.md         bitácora de evidencias de la última ejecución
└── .github/workflows/           ci.yml (sin credenciales) y deploy.yml
```

---

## Limitaciones conocidas

1. **Los polígonos de las 14 zonas son ilustrativos**, no oficiales (ver arriba). Es la limitación
   más importante del prototipo.
2. **El Parque Zonal Sinchi Roca queda a caballo de las zonas reconstruidas 04, 09 y 14.** La
   municipalidad lo sitúa en la Zonal 04 y el polígono real del parque mide 1,25 km de norte a
   sur, así que la frontera reconstruida lo parte. De los **9 hitos** que la municipalidad cita en
   sus descripciones, **8 caen en la zonal correcta y 1 queda parcial** (ninguno falla). Es el
   error esperable al reconstruir fronteras que no son públicas.
3. **La Zona 14 no tiene barrios asignados** porque, según la propia municipalidad, es la zona
   agrícola y ganadera del valle del Chillón; en OpenStreetMap no hay `place=neighbourhood` allí.
4. **Datos ficticios**: ningún reporte, foto ni contador refleja la realidad del distrito.
5. **La geocodificación inversa usa Nominatim**, que tiene límites de uso y no debe recibir tráfico
   alto; para producción conviene un proveedor con SLA o cachear en D1.
6. **No hay autenticación de vecinos**: el apoyo vecinal se limita por origen, no por identidad.
   Es una decisión de privacidad deliberada (Ley N° 29733), no un descuido.
7. **No hay panel administrativo real**: el cambio de estado se hace por API con un token
   compartido, suficiente para la demostración pero no para operación municipal.

---

## Atribuciones y créditos

- **Límite distrital, barrios, hitos y vías**: © OpenStreetMap contributors, licencia
  [ODbL](https://www.openstreetmap.org/copyright). Relación del distrito de Comas:
  [1944720](https://www.openstreetmap.org/relation/1944720).
- **Hectáreas, posición cardinal, colindancias y equipamientos de las 14 zonales**:
  Municipalidad Distrital de Comas, sección
  [Geografía](https://www.municomas.gob.pe/distrito/geografia).
- **Geocodificación inversa**: [Nominatim](https://nominatim.org/), OpenStreetMap Foundation.
- **Mapas base**: teselas de OpenStreetMap.
- **Antibot**: Cloudflare Turnstile.
- **Librerías del frontend**: Leaflet, Turf.js, Chart.js, canvas-confetti, Tailwind CSS (CDN).

---

## Licencia

El código de este repositorio se publica bajo licencia MIT. Los **datos de OpenStreetMap** quedan
bajo **ODbL** y los metadatos de las zonales provienen de la Municipalidad Distrital de Comas; al
reutilizarlos debes mantener la atribución correspondiente.

Este prototipo **no está afiliado ni respaldado por la Municipalidad Distrital de Comas**.

# Bitácora de verificación — Ojo Comas

Registro de las comprobaciones ejecutadas sobre este prototipo, con los resultados literales.
Todo lo que aparece aquí se ejecutó realmente en local; no hay resultados estimados.

> ⚠️ Prototipo de demostración con datos ficticios. No representa oficialmente a la
> Municipalidad Distrital de Comas.

**Entorno de la última ejecución**

| Dato | Valor |
|---|---|
| Fecha | 2026-09-16 |
| Sistema | Windows, OneDrive Desktop |
| Node.js | v22.23.2 |
| Python | 3.11.15 (shapely 2.1.2) |
| Wrangler | 4.133.0 |
| Hono | 4.13.8 |
| `compatibility_date` del Worker | 2026-09-16 |

---

## 1. Cartografía de las 14 zonas

Comando: `python tools/build_zonas.py`

| Comprobación | Resultado |
|---|---|
| Límite distrital real (OSM relación 1944720) | 1 anillo cosido, 314 puntos |
| Área calculada del distrito | **48,970 km²** frente a **48,72 km²** oficiales → desvío **+0,51 %** |
| Suma de hectáreas oficiales de las 14 zonales | 3 666,42 ha (36,66 km²; el resto son cerros y laderas no asignados) |
| Ajuste de áreas al reparto oficial | error relativo **medio 0,38 %** |
| Cobertura (`área de celdas / área del distrito`) | **1,000000** (exacta) |
| Solapamiento entre zonas | **0 m²** |
| Área fuera del distrito | **0 m²** |
| Zonas vacías | ninguna |
| Barrios reales de OSM asignados | **119** |
| Hitos reales de OSM asignados | **794** |

Comando: `python tools/verify_zonas.py`

| Comprobación | Resultado |
|---|---|
| Contigüidad e validez de las 14 zonas | ninguna no contigua ni inválida |
| Posición cardinal frente al texto oficial | **10/14** dentro de tolerancia; 4 con un desplazamiento menor a 0,75 km o con un eje sin etiqueta (Z04, Z07, Z09, Z10) |
| Coincidencia global de colindancias con el texto oficial | 39/70 = **56 %** |

> Las colindancias se compararon con el texto municipal, que **etiqueta mal el Este y el Oeste**
> en varias zonales (sitúa Los Olivos al Este y San Juan de Lurigancho al Oeste). La comparación
> es por tanto una cota inferior pesimista.

---

## 2. Hitos que la municipalidad cita en cada zonal

Comando: `python tools/check_hitos_oficiales.py`

Esta es la métrica de fidelidad más exigente: contrasta afirmaciones explícitas de la
Municipalidad de Comas contra la reconstrucción.

| Hito citado por la municipalidad | Zonal que le asigna | Resultado |
|---|---|---|
| Parque Zonal Sinchi Roca (Club Metropolitano) | 04 | **PARCIAL** — reparto: Z14 42,6 %, Z09 29,5 %, Z04 27,9 % |
| Huaca Sinchi Roca | 04 | OK — Z04 100 % |
| Institución Educativa 2022 Sinchi Roca | 04 | OK — Z04 100 % |
| Hospital Marino Molina Scippa (ESSALUD) | 06 | OK — cae en Z06 |
| Compañía de Bomberos Comas N.º 124 | 06 | OK — cae en Z06 |
| Comisaría PNP Universitaria | 06 | OK — cae en Z06 |
| Mercado Modelo (Comas) | 06 | OK — cae en Z06 |
| Mercado Santa Luzmila | 06 | OK — cae en Z06 |
| Cementerio de Collique | 12 | OK — cae en Z12 |
| **Total** | | **8/9 OK, 1 parcial, 0 fallas** |

El Parque Zonal Sinchi Roca es un polígono real de **1,25 km de norte a sur**
(OSM `way 110062002`): la frontera reconstruida entre Z04, Z09 y Z14 lo parte. Es el error
esperable al reconstruir límites que la municipalidad no publica. Se intentó corregir por tres
vías (mover las anclas, proteger la semilla dentro de su celda con proyección de pesos al cono
factible, y sembrar en el centroide del parque): proteger la invariante bajaba el ajuste de
áreas al 15–45 % de error y llegaba a dejar la Zona 10 vacía, así que **se priorizó respetar las
hectáreas oficiales** y se documenta la limitación.

---

## 3. Coherencia de la detección de zona: navegador frente a servidor

Comando: `node tools/verificar_deteccion_zona.mjs`

El formulario muestra la zona calculada en el cliente con **Turf.js**
(`booleanPointInPolygon`), mientras que el Worker la recalcula en el servidor con lanzamiento de
rayo para no fiarse del navegador. Si ambos discrepasen, el vecino vería una zona y el reporte
quedaría en otra.

| Comprobación | Resultado |
|---|---|
| Rejilla de **17 161** puntos sobre la envolvente del distrito | 8 946 puntos dentro del distrito |
| Discrepancias entre Turf.js y el servidor | **0** |
| Puntos que caen en más de una zona | **0** |
| Zonas con puntos de la rejilla | **14/14** |
| Hitos reales probados (navegador vs servidor) | **9/9** coinciden |
| Reportes ficticios en la zona que declaran | **28/28** |

---

## 4. API: prueba de humo end-to-end

Comando:
```bash
node worker/scripts/smoke.mjs --base http://127.0.0.1:8787 --admin-token <ADMIN_TOKEN>
```

Ejercita el Worker real por HTTP contra `wrangler dev`, con **D1 y R2 reales** (simulados en
disco) y el **siteverify real de Cloudflare Turnstile**. Sin simulaciones.

### 4.1 Suite completa — 61/61 comprobaciones correctas

| Bloque | Comprobaciones |
|---|---|
| 1. Salud y disponibilidad | 4 (D1 responde, R2 enlazado, 14 zonas) |
| 2. Zonas | 4 (14 zonas, polígonos, hectáreas oficiales, barrios reales) |
| 3. Listado GeoJSON | 5 (FeatureCollection, 28 reportes, 14 zonas, **sin `contacto` ni `ip_hash`**, sin DNI) |
| 4. Filtros y validación | 5 (por zona, por estado, por categoría, 400 en valores inválidos) |
| 5. Detalle e historial | 3 |
| 6. Estadísticas | 5 (totales y sumas coherentes con el listado) |
| 7. Fotos desde R2 | 6 (se sirven, con content-type, con caché, y 404 si no existe) |
| 8. Creación real (Turnstile + R2) | 7 (201, zona correcta, estado inicial, subida a R2 y relectura de la foto) |
| 9. **La zona la decide el servidor** | 2 (se envía `zona=14` para un punto de la Zona 01 y el servidor guarda `01`) |
| 10. Seguridad y validación | 8 (sin token → 403, token vacío → 403, categoría inválida → 400, fuera del distrito → 400, descripción > 140 → 400, foto > 2 MB → 413, archivo que no es imagen → 400, ruta inexistente → 404) |
| 11. Privacidad (Ley N° 29733) | 3 (el contacto **no** se devuelve; el correo enviado sin consentimiento no aparece) |
| 12. Apoyo vecinal | 3 (apoyo registrado, duplicado → 409, sin Turnstile → 403) |
| 13. Cambio de estado | 6 (sin token → 401, token falso → 401, token válido → 200, historial crece, estado inválido → 400, inexistente → 404) |

### 4.2 Turnstile bloqueando — 4/4

Comando:
```bash
npx wrangler dev --port 8790 --var TURNSTILE_SECRET:2x0000000000000000000000000000000AA
node worker/scripts/smoke.mjs --base http://127.0.0.1:8790 --modo bloqueo
```

| Comprobación | Resultado |
|---|---|
| `POST /api/report` con secreto que bloquea | **403** |
| La respuesta trae `ok:false` | sí |
| El apoyo vecinal también queda bloqueado | **403** |
| Las lecturas siguen funcionando | 200 |

### 4.3 Limitador de abuso — 4/4

Comando:
```bash
npx wrangler dev --port 8791 --var MAX_REPORTES_POR_HORA:1
node worker/scripts/smoke.mjs --base http://127.0.0.1:8791 --modo limite
```

| Comprobación | Resultado |
|---|---|
| Primer reporte de una IP nueva | **201** |
| Siguientes intentos | **429, 429** |
| Las lecturas no están limitadas | 200 |
| Sin cabecera de IP responde de forma controlada | 429 (nunca 500) |

### 4.4 Comportamiento real de las claves de prueba de Turnstile

Sondeo directo contra `https://challenges.cloudflare.com/turnstile/v0/siteverify`:

| Secreto | Token | `success` | `action` | `hostname` |
|---|---|---|---|---|
| `1x…AA` (siempre pasa) | cualquiera no vacío | `true` | **vacío** | `example.com` |
| `1x…AA` | vacío | `false` (`missing-input-response`) | — | — |
| `2x…AA` (siempre bloquea) | cualquiera | `false` (`invalid-input-response`) | — | — |
| `3x…AA` (desafío interactivo) | cualquiera | `false` (`timeout-or-duplicate`) | — | — |
| secreto inválido | cualquiera | HTTP **400** | — | — |

Hallazgo relevante: con las claves de prueba `action` vuelve **vacío**, así que exigir la acción
habría hecho fallar la demostración completa. El Worker **no exige `action` cuando detecta una
clave de prueba documentada** y sí la exige siempre con una clave real.

---

## 5. CORS y cabeceras de seguridad

Frontend en Pages (`http://127.0.0.1:8788`) contra la API (`http://127.0.0.1:8787`).

| Comprobación | Resultado |
|---|---|
| Origen permitido | `Access-Control-Allow-Origin: http://127.0.0.1:8788` |
| `Vary` | `Origin` |
| Preflight `OPTIONS` | **204** con `GET,POST,PATCH,OPTIONS` y `Content-Type,Authorization` |
| Origen **no** permitido (`https://sitio-malicioso.example`) | sin `Access-Control-Allow-Origin` → el navegador lo bloquea |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| Caché del listado | `public, max-age=20` |

---

## 6. Frontend

Comandos:
```bash
node --check frontend/app.js
node tools/verificar_frontend.mjs --base http://127.0.0.1:8787 --html http://127.0.0.1:8788
```

El segundo comando monta el `index.html` **real** (descargado de `wrangler pages dev`, no del
disco) en un DOM real con **jsdom**, con **Leaflet 1.9.4 real** (el mismo paquete que carga la
página) y **Turf real**, apuntando a la API real. Solo se sustituyen Chart.js, canvas-confetti y el
widget de Turnstile, porque jsdom no implementa `<canvas>`.

### 6.1 Arranque — 3/3

| Comprobación | Resultado |
|---|---|
| La aplicación arranca sin errores de JavaScript | **sin errores** |
| Leaflet queda cargado en la página | sí |
| Leaflet inicializa el contenedor del mapa (`#map`) | sí |

### 6.2 Banner legal obligatorio — 6/6

| Comprobación | Resultado |
|---|---|
| Contiene «PROTOTIPO DE DEMOSTRACIÓN» | sí |
| Avisa de que los datos son 100 % ficticios | sí |
| Aclara que no representa a la Municipalidad Distrital de Comas | sí |
| Cita la Ley N° 29733 | sí |
| Título «Tu voz construye el distrito» | sí |
| Subtítulo «Sin registros. Sin filas.» | sí |

### 6.3 Mapa y capas — 3/3

| Comprobación | Resultado |
|---|---|
| Se dibujan las 14 zonas + el límite del distrito | **55 elementos SVG interactivos** |
| Hay un marcador por cada reporte de la API | 14 zonas + 41 reportes ≤ 55 |
| Capas de etiquetas creadas | sí |

### 6.4 Interfaz — 2/2

| Comprobación | Resultado |
|---|---|
| Aparecen las 14 fichas de zona | **14/14** |
| El gráfico del panel de transparencia tiene una barra por zona | 14 etiquetas |

### 6.5 Política de privacidad — 4/4

| Comprobación | Resultado |
|---|---|
| Hay enlaces a la política de privacidad | 2 disparadores |
| El modal cita la Ley N° 29733 | sí |
| El modal explica que el reporte es anónimo | sí |
| Hay atribución a OpenStreetMap | sí |

### 6.6 Antibot — 1/1

| Comprobación | Resultado |
|---|---|
| El widget de Turnstile está integrado | sí |

### 6.7 Accesibilidad del mapa

Se detectó que el mapa usaba `preferCanvas: true`, lo que hace que Leaflet pinte polígonos y
marcadores dentro de un `<canvas>`. Con esa opción **los marcadores de los reportes dejan de ser
elementos del DOM**, así que pierden foco de teclado, nombre accesible y lectura por lector de
pantalla, incumpliendo el requisito de accesibilidad del D.S. N° 029-2021-PCM. Se cambió a
`preferCanvas: false` (SVG), que con 55 capas es perfectamente adecuado.

---

## 7. Reproducibilidad y secretos

| Comprobación | Resultado |
|---|---|
| `worker/.dev.vars` ignorado por git | sí (`git check-ignore` lo confirma) |
| Archivos de secretos en el índice de git | ninguno |
| Valores de secretos dentro de `worker-configuration.d.ts` | ninguno: solo el nombre y el tipo `string` |
| `tsc --noEmit` con los secretos declarados en `secrets.required` y ausentes | **pasa** (el código falla cerrado si falta el secreto) |
| `tsc --noEmit` con `.dev.vars` presente | **pasa** |
| Sintaxis de los flujos de GitHub Actions | válida (2 flujos, 34 pasos) |

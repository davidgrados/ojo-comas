# Auditoría de vulnerabilidades — Ojo Comas

Fecha: **17 de setiembre de 2026** · Alcance: frontend (Cloudflare Pages), API (Cloudflare
Worker), datos (D1 y R2) y configuración del despliegue.

Método: revisión del código fuente, pruebas de concepto ejecutadas contra el sitio real y
comprobación de cabeceras HTTP y archivos expuestos. No es un pentest formal: no se hicieron
pruebas de carga ni de denegación de servicio.

---

## Resumen

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | `?api=` permitía redirigir toda la app a un servidor del atacante | **Alta** | **Corregido** |
| 2 | Sin `Content-Security-Policy` | Media | **Corregido** |
| 3 | CDN de Tailwind cargado sin usarse (tercero con acceso total a la página) | Media | **Corregido** |
| 4 | Claves de Turnstile de **prueba** en producción | Media | **Pendiente** (documentado) |
| 5 | Sin `Strict-Transport-Security`, `COOP` ni `CORP` | Baja | **Corregido** |
| 6 | La política de privacidad afirmaba usar Nominatim, que no se usa | Baja (legal) | **Corregido** |
| 7 | Inyección SQL | — | **No hay**: todo parametrizado |
| 8 | XSS almacenado | — | **No hay**: 86 escapes, sumideros revisados a mano |
| 9 | Archivos sensibles expuestos | — | **No hay** |
| 10 | Vulnerabilidades en dependencias | — | **No hay**: 0 en ambos proyectos |

**Veredicto:** no encontré ninguna vulnerabilidad crítica explotable sin interacción del usuario.
El único hallazgo Alto era un fallo propio que ya está cerrado, y era el más peligroso de todos
porque **convertía un enlace viral en una fuga de datos de los vecinos**.

---

## 1. `?api=` permitía redirigir la aplicación a un tercero — Alta

### Qué pasaba

`frontend/config.js` aceptaba el parámetro `?api=` de la URL **sin validar nada**:

```js
var apiForzada = new URLSearchParams(location.search).get('api');
apiBase: apiForzada !== null ? apiForzada : API_POR_DEFECTO
```

### Prueba de concepto (ejecutada)

```
URL : https://ojo-comas.pages.dev/?api=https://sitio-malicioso.example
apiBase -> "https://sitio-malicioso.example"   <-- REDIRIGIDO A UN TERCERO
```

### Impacto

1. **Fuga de datos personales**: un vecino que abriera ese enlace y enviara un reporte mandaría
   **su fotografía, sus coordenadas y, si marcaba el consentimiento, su dato de contacto**
   directamente al atacante.
2. **Contenido falso bajo el dominio real**: el atacante controlaría los reportes que la app
   pinta en el mapa, así que podría mostrar contenido inventado u ofensivo atribuido al proyecto.

Combinado con el plan de difundir el enlace en redes, el vector era realista: bastaba con
publicar el enlace manipulado.

### Corrección

Lista blanca de orígenes. La sobrescritura solo se acepta si apunta al mismo origen de la página,
al Worker de producción o —únicamente cuando la propia página se sirve en local— a los orígenes
locales de desarrollo. En cualquier otro caso se ignora y se avisa por consola.

### Verificación (casos de evasión probados)

| Entrada | Resultado |
|---|---|
| `https://sitio-malicioso.example` | ignorado |
| `https://ojo-comas-api.dunkeljhonz.workers.dev.evil.example` | ignorado |
| `//sitio-malicioso.example` (relativo a protocolo) | ignorado |
| `javascript:alert(1)` | ignorado |
| `https://ojo-comas-api.dunkeljhonz.workers.dev/` | aceptado |
| `?api=` vacío en producción | ignorado |

Los cuatro casos maliciosos están ahora en la batería automática (sección 10 de
`tools/verificar_frontend.mjs`).

---

## 2. Sin Content-Security-Policy — Media

El sitio no enviaba CSP. Sin ella, cualquier inyección de script tendría vía libre.

### Corrección

CSP estricta en `frontend/_headers`, sin `'unsafe-inline'` ni `'unsafe-eval'` para scripts:

```
default-src 'self'; script-src 'self' https://unpkg.com https://cdn.jsdelivr.net
https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' ...
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

`style-src` sí necesita `'unsafe-inline'` porque Leaflet y el propio `app.js` escriben atributos
`style=""` en el HTML generado. Es una concesión consciente y documentada: sin ella el mapa se
rompe. `script-src` no la necesita porque la página **no tiene ningún `<script>` en línea ni
ningún atributo `on*`** (verificado: 0 de cada).

---

## 3. CDN de Tailwind cargado sin usarse — Media

La página cargaba `https://cdn.tailwindcss.com` con acceso total al DOM. Se midió su uso real:
**de 132 clases declaradas en el HTML, 0 son de Tailwind** — todas son clases propias definidas en
`styles.css` (38 KB de CSS propio).

Mantenerlo era riesgo sin beneficio, y además su versión *Play* **exige `'unsafe-eval'`**, lo que
hacía imposible la CSP estricta. **Eliminado.** Ahora una comprobación automática falla si la CSP
vuelve a permitir `'unsafe-eval'`, lo que delata a cualquier dependencia que lo necesite.

---

## 4. Claves de Turnstile de prueba en producción — Media (pendiente)

El widget usa las claves de prueba oficiales de Cloudflare, que **aceptan cualquier token**: no
hay protección antibot efectiva. El limitador de envíos (8 por hora y por origen) sí funciona, así
que el daño está acotado, pero cualquiera puede automatizar reportes dentro de ese cupo.

**No es un error inadvertido: es una decisión consciente** para que la demo funcione sin cuenta.
Los pasos para cambiarlo están en el README. **Es lo primero que hay que hacer antes de difundir el
proyecto en redes sociales**, porque una campaña viral multiplica el tráfico y el abuso.

---

## 5. Cabeceras que faltaban — Baja

Añadidas: `Strict-Transport-Security`, `Cross-Origin-Opener-Policy: same-origin` y
`X-Permitted-Cross-Domain-Policies: none`. Ya estaban `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy` y `Permissions-Policy` (que restringe cámara y
geolocalización al propio origen).

---

## 6. Afirmación falsa sobre Nominatim — Baja, pero legal

La política de privacidad (y el README) afirmaban que la dirección se obtenía por
**geocodificación inversa con Nominatim**. **Comprobado en el código: Nominatim no se llama en
ningún sitio**, ni en el navegador ni en el Worker. El campo `direccion` es simplemente el texto
que escribe el vecino.

Un documento que se presenta como análisis de cumplimiento no puede permitirse afirmar algo que el
código no hace. Se corrigieron las **7 menciones** en `README.md`, `LICENCIAS.md` y
`docs/CUMPLIMIENTO-LEGAL.md`. La versión corregida además es **mejor para la privacidad**: al no
haber geocodificación inversa, las coordenadas no se envían a ningún servicio de mapas externo.

---

## 7. Inyección SQL — no hay

Todas las consultas usan sentencias preparadas con `bind()`. La única interpolación de plantilla es
`COLUMNAS_PUBLICAS`, una **constante del módulo**, nunca entrada del usuario. El filtro `bbox` y
los parámetros `zona`/`estado`/`categoria` se validan antes y se pasan como parámetros.

## 8. XSS almacenado — no hay

Hay 21 usos de `innerHTML` y 86 llamadas a `esc()`. Se revisaron **a mano** los dos sumideros que
concatenan datos del servidor:

- `htmlPopupReporte` / `htmlTarjetaReporte` / `htmlDetalleReporte`: escapan descripción, id, zona,
  fechas, dirección, notas del historial y nombres.
- El ranking del panel de transparencia: escapa color, nombre y zona; los totales son numéricos.

Las descripciones de los reportes (texto libre del usuario, máximo 140 caracteres) se escapan
siempre antes de pintarse. **No hay ninguna ruta en la que un texto de usuario llegue al DOM sin
escapar.**

## 9. Archivos sensibles expuestos — no hay

Se probaron rutas como `/.git/config`, `/package.json`, `/worker/wrangler.jsonc`, `/.dev.vars` y
`/.dev.vars.produccion`. Todas devuelven el índice de la SPA, nunca el contenido real. Lo único que
se sirve es lo que está dentro de `frontend/`: HTML, CSS, JS, sus datos de demostración y las
imágenes.

Los secretos (`TURNSTILE_SECRET`, `ADMIN_TOKEN`, `IP_SALT`) viven en el almacén de Cloudflare y en
`worker/.dev.vars.produccion`, que **está ignorado por git**. Se comprobó que sus valores no
aparecen ni en el repositorio ni en el JavaScript publicado.

## 10. Dependencias — 0 vulnerabilidades

`npm audit` en la raíz y en `worker/`: **0 vulnerabilidades** en ambos árboles.

---

## Lo que aún no está cubierto

- **Turnstile real** (hallazgo 4): lo único que impide la protección antibot efectiva.
- **Sin límite de tasa en el propio Cloudflare** (WAF / Rate Limiting rules): el limitador actual
  vive en D1 y es por hash de IP diario. Suficiente para una demo, no para un ataque distribuido.
- **Sin prueba de carga**: no se evaluó el comportamiento con tráfico viral. D1 y Workers escalan,
  pero el límite de 8 reportes por hora por origen podría dejar fuera a vecinos legítimos si
  compartieran IP (por ejemplo, una cabina de internet o una red móvil con NAT).
- **Sin pentest formal** ni revisión por un tercero.
- **Nombre de dominio propio**: hoy es `ojo-comas.pages.dev`, un subdominio compartido de
  Cloudflare. Un dominio propio daría más control (HSTS con `includeSubDomains`, correo, etc.).

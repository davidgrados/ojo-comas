# Guion para TikTok — Ojo Comas (60 segundos)

> **Lee primero la sección «Antes de publicar».** Un video viral sobre un prototipo que muestra
> reportes ficticios tiene riesgos concretos, y hay uno técnico que hay que cerrar antes.

---

## Estructura y por qué funciona

El guion usa cuatro palancas de retención:

1. **Gancho con verdad incómoda** (0–4 s): no empieza con «hola, hoy les traigo». Empieza con algo
   que el espectador ya piensa.
2. **Giro de autoría** (4–10 s): «así que lo construí». Convierte la queja en algo que se puede
   ver. La gente se queda a ver el resultado.
3. **Demo rápida** (10–22 s): tres toques. Es el momento de satisfacción, sin explicaciones
   técnicas.
4. **Escala social** (22–35 s): el mapa de colores y el panel. Es lo que hace que la gente comente
   «en mi zona también».
5. **Cierre honesto** (35–48 s): el aviso. Está integrado con humor, no como letra chica, y
   **no se puede quitar**: es la diferencia entre un experimento cívico y un problema legal.
6. **CTA** (48–60 s): pregunta, no solicitud. Las preguntas generan comentarios; los pedidos, no.

**157 palabras de voz.** Medido: a ritmo de TikTok (unas 2,6 palabras por segundo) son **60,4
segundos**, así que entra justo. A ritmo rápido (3 palabras por segundo) son 52 s y te queda aire
para respirar. Si te sobra tiempo, alarga el paso 4; si te falta, recorta el paso 2.

---

## Guion plano a plano

### [0:00 – 0:04] GANCHO

**TEXTO EN PANTALLA:** `Baches más viejos que mi DNI 💀`
**VISUAL:** plano tuyo caminando y, de fondo, un bache real.
**VOZ:** «En Lima hay baches más viejos que mi DNI. Y reportarlos es un trámite eterno.»

> Si quieres variar el gancho (graba los tres y prueba cuál retiene más):
> - «Mi calle tiene un hueco que ya tiene nombre propio.»
> - «Saqué una foto al bache de mi esquina. Esto pasó después.»
> - «¿Y si reportar un bache tomara diez segundos en vez de dos semanas?»

### [0:04 – 0:10] GIRO

**TEXTO EN PANTALLA:** `14 zonas reales de Comas`
**VISUAL:** el mapa de Comas abriéndose con las 14 zonas coloreadas, un zoom rápido.
**VOZ:** «Así que agarré el mapa de Comas, lo dividí en sus 14 zonas reales, y me puse a construir.»

### [0:10 – 0:22] DEMO — LOS TRES TOQUES

**TEXTO EN PANTALLA:** `toque → foto → enviar`
**VISUAL:** grabación de pantalla del celular: tocas el mapa, aparece el botón «➕ Reportar aquí»,
eliges el ícono del bache, pones la foto, envías y sale el confeti.
**VOZ:** «Tocas el mapa donde está el problema, eliges qué es, le pones foto y ya. Tres toques. Y te
detecta solo en qué zona estás.»

> Graba esto en vertical, con el celular de a uno. Que se vean los dedos. Es el plano que la gente
> vuelve a ver.

### [0:22 – 0:35] ESCALA SOCIAL ← el plano que genera comentarios

**TEXTO EN PANTALLA:** `🔴 pendiente · 🟡 en proceso · 🟢 resuelto`
**VISUAL:** el mapa llenándose de marcadores de colores, y después el panel de transparencia con el
gráfico de barras por zona.
**VOZ:** «Pero lo bueno no es eso. Es que todos ven lo mismo que tú ves. Los reportes se pintan en
el mapa: rojo pendiente, ámbar en proceso, verde resuelto. Y hay un panel donde se ve qué zona
tiene más problemas. Eso es presión, no queja.»

### [0:35 – 0:48] AVISO HONESTO ← no quitar nunca

**TEXTO EN PANTALLA (grande, centrado):** `⚠️ PROTOTIPO · DATOS FICTICIOS · NO OFICIAL`
**VISUAL:** primer plano de la marca de agua «DATOS FICTICIOS» sobre el mapa.
**VOZ:** «Ojo, antes de que alguien se confunda: esto es un prototipo, no es de la municipalidad, y
los reportes son inventados para la demo. Es para mostrar lo que se podría hacer, no para poner un
reclamo oficial.»

> **No quites esta parte ni la acortes.** Un video viral sin este aviso es exactamente el escenario
> de riesgo que analiza `docs/CUMPLIMIENTO-LEGAL.md`: 28 reportes falsos sobre calles reales,
> circulando sin contexto, atribuidos a una municipalidad real. Además es lo que hace que el video
> se vea creíble y no como una estafa. La honestidad aquí **suma** retención.

### [0:48 – 0:60] CIERRE Y LLAMADA A LA ACCIÓN

**TEXTO EN PANTALLA:** `¿Lo quieres para tu distrito? 👇`
**VISUAL:** el mapa alejándose, y el enlace en pantalla.
**VOZ:** «Está abierto, cualquiera puede ver el código. Si te sirve para tu distrito, escríbeme.»

---

## Textos para publicar

**Descripción del video:**

> Hice un prototipo para reportar baches, basura y alumbrado en Comas, con el mapa dividido en sus
> 14 zonas reales. No es de la municipalidad y los datos son ficticios: es una demo de lo que se
> podría construir. El código está abierto 👉 github.com/davidgrados/ojo-comas
> ¿Lo quieres para tu distrito? #Comas #Lima #LimaNorte #baches #participacionciudadana #Peru

**Comentario fijado (obligatorio):**

> ⚠️ Para que no haya confusión: esto es un **prototipo de demostración**. **No** representa a la
> Municipalidad Distrital de Comas, **no** es un canal oficial de reclamos y los reportes que se ven
> son **inventados**. Los reclamos reales van a la mesa de partes o al Libro de Reclamaciones de la
> municipalidad. Demo: ojo-comas.pages.dev · Código: github.com/davidgrados/ojo-comas

**Hashtags sugeridos:** `#Comas` `#LimaNorte` `#Lima` `#baches` `#basura` `#alumbrado`
`#participacionciudadana` `#tecnologia` `#Peru` `#programacion`

---

## Antes de publicar — lista de comprobación

### Técnico (importante: hazlo ANTES de que el video sea viral)

1. **Pon el widget de Turnstile REAL.** Ahora mismo usa las claves de prueba de Cloudflare, que
   aceptan cualquier token. Con la demo sin difundir da igual; **con un video viral, cualquiera
   puede automatizar reportes** y llenarte el mapa de basura. Los pasos están en el README,
   sección «Endurecer Turnstile». Son 5 minutos.
2. Comprueba que el sitio responde: https://ojo-comas.pages.dev

### Legal (para no tener problemas con una autoridad)

3. **Di siempre «prototipo» y «datos ficticios»** en el video y en el comentario fijado. Nunca
   sugieras que es de la municipalidad ni que sirve para poner un reclamo oficial.
4. **No uses el escudo, logos ni el nombre oficial** de la Municipalidad de Comas. Tampoco música
   o imágenes que sugieran respaldo institucional.
5. **No muestres rostros, placas ni documentos** de terceros en las tomas de calle. Fíjate en el
   bache, no en la gente.
6. **Habla del problema, no de culpables.** «El bache lleva años ahí» sí; «el alcalde no hace nada»
   te expone a una acusación por difamación.
7. Si alguien comenta «¿dónde reclamo de verdad?», **responde con los canales oficiales**. Eso te
   protege y además te da credibilidad.

### De rendimiento

8. **Responde todos los comentarios de la primera hora.** Es lo que decide si el video despega.
9. Fija el comentario con la advertencia **en cuanto publiques**, no después.
10. Si el video crece mucho, revisa `docs/SEGURIDAD.md`: hay un límite de 8 reportes por hora por
    origen que, en una red móvil compartida, podría dejar fuera a vecinos legítimos.

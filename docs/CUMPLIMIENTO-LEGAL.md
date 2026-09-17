# Cumplimiento legal de Ojo Comas

> **Aviso:** este documento es un análisis técnico de riesgos preparado por quien construyó el
> prototipo. **No es asesoría legal.** Antes de usar la aplicación con reportes reales o de
> difundirla masivamente conviene una revisión por un abogado en Perú. Lo que sí contiene son
> hechos verificables, normas citadas con su fuente y las medidas concretas ya aplicadas.

Fecha del análisis: **17 de setiembre de 2026** · Norma vigente verificada: reglamento de la Ley
N.° 29733 aprobado por **D.S. N.° 016-2024-JUS**, en vigor desde el 30 de marzo de 2025.

---

## 1. Resumen para decidir rápido

| Riesgo | Ante quién | Gravedad | Estado |
|---|---|---|---|
| Confusión con la Municipalidad de Comas / datos falsos difundidos como reales | Municipalidad, cualquier vecino, INDECOPI | **Alta** en difusión | **Mitigado**: marca de agua en el mapa, etiqueta «ficticio» en cada reporte, aviso legal y banner reforzado |
| Usurpación de funciones públicas (Código Penal, art. 362) | Ministerio Público | **Baja**, pero se elimina por completo | **Mitigado**: cláusula explícita de que no ejerce función pública y de que los reportes no tienen efectos legales ni administrativos |
| Banco de datos personales sin inscribir ante la ANPD | ANPD (Minjusdh) | **Alta**, pero solo aplica con datos reales | **Pendiente y bloqueante**: hoy usa datos ficticios, así que no procede inscripción. Documentado abajo qué hacer antes |
| Flujo transfronterizo de datos sin salvaguardas | ANPD | **Media** | **Mitigado**: declarado en la política de privacidad. Con datos reales habría que documentar salvaguardas |
| Derechos ARCO sin canal real | ANPD | **Media** | **Mitigado**: canal habilitado y plazo advertido |
| Incumplir la ODbL de OpenStreetMap | OSM Foundation / autores | **Baja** | **Corregido**: datos derivados licenciados como ODbL en `LICENCIAS.md` |
| Derecho de autor sobre textos municipales | Municipalidad | **Muy baja** | **Corregido**: solo se conserva el dato factual, se retiró la copia de la página web |
| **Suplantación de identidad** (no es el caso) | — | **Ninguna** | No se usa escudo, logotipo, nombre oficial ni marca municipal. Verificado |

**Conclusión:** tal como está —prototipo con datos 100 % ficticios, sin escudo municipal, con aviso
legal y marca de agua— **no veo un riesgo que pueda generar un problema serio con una autoridad**.
El punto que exige acción **antes** de usarlo con datos reales es la inscripción del banco de datos
ante la ANPD (sección 4).

---

## 2. Riesgo principal: confusión con la Municipalidad y datos falsos difundidos

### Por qué es el riesgo más alto

El mapa sitúa **28 reportes sobre calles reales del distrito de Comas**. Aunque el banner advierta
que son ficticios, la unidad que se comparte y se viraliza es la **captura de pantalla del mapa**,
que no incluye el banner. Una imagen así puede leerse como «prueba» de que el distrito está
abandonado y atribuirse a la gestión municipal.

Eso conecta con dos tipos penales y una norma administrativa peruanas:

- **Difamación (Código Penal, art. 132):** imputar a una persona —o a una institución identificable—
  un hecho que lesione su honor, sabiendo que es falso.
- **Usurpación de funciones públicas (Código Penal, art. 362):** según la
  [Casación 226-2021, Áncash](https://lpderecho.pe/usurpacion-funciones-configuracion-no-importa-acto-funcional-corresponde-afacultades-funcionario-publico-asume-basta-carencia-titulo-nombramiento-funcion-realizo-sujeto-asumio-agente-municipal-ex/),
  no importa si el acto corresponde o no a las facultades reales del funcionario: basta con
  **carecer de título o nombramiento** ejerciendo la función. Por eso es importante que la
  aplicación no dé a entender que tramita nada.
- **Publicidad engañosa (D.L. 1044, competencia de INDECOPI):** si se presentara como servicio con
  respaldo municipal.

### Qué se cambió

| Medida | Dónde |
|---|---|
| **Marca de agua permanente sobre el mapa**: «DATOS FICTICIOS · PROTOTIPO NO OFICIAL» | `frontend/index.html` + `styles.css` (`.mapa-marca-ficticio`) |
| **Etiqueta «Ficticio» en cada reporte**, tanto en el globo del mapa como en las tarjetas del listado | `frontend/app.js` (`.etiqueta-ficticio`) |
| **Marca de agua «FOTO SIMULADA»** ya presente en las imágenes generadas | `tools/build_seed.py` |
| **Banner superior reforzado** con la cláusula de efectos | `frontend/index.html` |
| **Aviso legal y normas de uso** (modal nuevo) | `frontend/index.html` (`#modalAvisoLegal`) |

La marca de agua es deliberadamente **semitransparente y rotada**, pero está **dentro del
contenedor del mapa**: cualquier captura de pantalla la incluye. No se puede separar la imagen del
aviso de que es ficticia.

Estas medidas están cubiertas por pruebas automáticas (sección 7).

---

## 3. Carácter no oficial y ausencia de efectos legales

### El riesgo

Bajo la **Ley N.° 27444** (TUO de la Ley del Procedimiento Administrativo General), presentar una
solicitud o un reclamo ante la administración **inicia un procedimiento**, genera un expediente y
produce plazos —incluido el silencio administrativo— a favor del administrado. Si un vecino cree
que al usar Ojo Comas ha presentado una denuncia formal, podría **dejar de acudir al canal oficial
y perder derechos** por confiar en un procedimiento que nunca existió. Eso es el daño real, más
allá del riesgo penal.

### Qué se cambió

Se añadió el modal **«Aviso legal y normas de uso»** con una sección explícita que enumera lo que
el reporte **no** hace:

- No inicia un procedimiento administrativo ni genera expediente.
- No produce efectos ante el silencio administrativo ni plazos de respuesta.
- No obliga a ninguna entidad a actuar ni a responder.
- No es un canal oficial de reclamos ni sustituye al Libro de Reclamaciones ni a la mesa de partes.

Y remite expresamente a los canales oficiales. Además se declara que **no ejerce función pública
alguna** y que no cuenta con autorización ni respaldo municipal.

---

## 4. Protección de datos personales — Ley N.° 29733 y D.S. N.° 016-2024-JUS

### Norma vigente (dato verificado, no de memoria)

El reglamento aplicable es el **D.S. N.° 016-2024-JUS**, publicado el 30 de noviembre de 2024 y en
vigor desde el **30 de marzo de 2025**, que **derogó el D.S. N.° 003-2013-JUS**
([CMS](https://cms.law/es/per/publication/nuevo-reglamento-de-proteccion-de-datos-personales),
[Garrigues](https://www.garrigues.com/es_ES/noticia/peru-publica-nuevo-reglamento-ley-proteccion-datos-personales)).

**La política de privacidad del prototipo citaba el reglamento derogado.** Ese error factual ya
está corregido.

### Obligación bloqueante: inscribir el banco de datos ante la ANPD

Según la [Autoridad Nacional de Protección de Datos Personales](https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales),
con el reglamento vigente **sigue siendo obligatorio** inscribir el banco de datos:

> «Toda persona natural, entidad privada o entidad pública que sea titular de un banco de datos
> personales, tiene la obligación de inscribir dicho banco de datos ante el Registro Nacional de
> Protección de Datos Personales.»

El trámite es **gratuito**, de **aprobación automática** y se hace en línea por el SIPDP.

**Qué implica aquí:** la aplicación almacena coordenadas, fotografías, un contacto opcional y un
hash de IP. Eso es un banco de datos personales. **Hoy no procede inscribirlo porque los reportes
son ficticios y no hay datos de vecinos**; pero en el momento en que se use con reportes reales,
la inscripción debe hacerse **antes de recoger el primer dato**. La ley alcanza también a personas
naturales, no solo a empresas.

### Flujo transfronterizo

La verificación real del despliegue mostró que la base D1 se creó en la región **ENAM (este de
Norteamérica, Estados Unidos)**, y las fotos van a **R2**. Los datos, por tanto, **salen del
territorio peruano**.

El reglamento vigente exige criterios mínimos para considerar que un país ofrece un nivel adecuado
de protección: marco legal de protección de datos, principios de tratamiento, derechos
reconocidos y autoridad de control. **Estados Unidos no cuenta con una ley federal integral ni con
una autoridad única de protección de datos**, así que no supera ese test de forma evidente. Con
datos reales habría que **aplicar y documentar salvaguardas adicionales**.

Ya está **declarado en la política de privacidad** (sección 5) para que el titular lo sepa.

### Otras obligaciones del reglamento vigente que hay que tener presentes

- **Notificación de incidentes de seguridad a la ANPD dentro de las 48 horas** siguientes a su
  detección, incluso si ya está controlado; y a la autoridad de ciberseguridad si es digital.
  No existe procedimiento documentado: **pendiente** si se usara con datos reales.
- **Derecho de oposición resuelto en máximo 10 días.**
- **Datos de fuentes públicas:** solo se permite un primer contacto.
- **Representante en Perú** para responsables extranjeros (no aplica: el responsable es peruano).

### Qué se cambió

| Medida | Dónde |
|---|---|
| Cita del reglamento vigente (y retirada del derogado) | Política de privacidad, sección 4 |
| Identificación del **responsable del banco de datos** (antes no aparecía) | Sección 4 |
| Advertencia de que con datos reales hay que **inscribir el banco de datos ante la ANPD** y notificar incidentes en 48 h | Sección 4 |
| **Flujo transfronterizo** declarado, con la mención a Cloudflare y a la posible ubicación fuera del Perú | Sección 5 (nueva) |
| **Plazo de conservación** concreto (antes era «lo necesario») | Sección 7 |
| **Canal ARCO real** (antes remitía a «escribir al repositorio de GitHub», que no es un canal) | Sección 8 |
| Mención a la **geocodificación por Nominatim**, que envía coordenadas a un tercero (antes no se decía) | Sección 6 |

---

## 5. Contenido generado por usuarios

### El riesgo

Los reportes llevan texto libre y fotografía. Dos escenarios problemáticos:

1. **Datos personales de terceros**: una foto con rostros identificables, placas de vehículos o
   documentos convierte al responsable en tratador de datos de personas que **no consintieron
   nada**. Es la vía más habitual de sanción en protección de datos.
2. **Acusaciones**: un texto que señale a un funcionario, un comercio o un vecino como responsable
   puede constituir difamación, y el promotor de la herramienta podría verse arrastrado.

### Qué se cambió

El aviso legal añade **normas de uso** explícitas que prohíben: datos personales de terceros,
rostros identificables, placas, documentos; acusaciones o imputaciones contra personas o
empresas; contenido ofensivo o ilícito; fotografiar interiores de propiedades; y el envío masivo o
automatizado. Se reserva el retiro de contenido y se advierte de que el prototipo no verifica la
veracidad.

En el código ya existían defensas útiles: **no hay cuentas de usuario** ni comentarios entre
vecinos, la descripción está limitada a **140 caracteres** y hay **límite de envíos por hora**.

---

## 6. Propiedad intelectual

- **OpenStreetMap (ODbL).** El límite distrital y los barrios provienen de OSM, y los archivos
  `comas_distrito.geojson` y `comas_zonas.geojson` son **bases de datos derivadas**. La ODbL exige
  licenciar esas bases derivadas bajo ODbL. **Antes el repositorio declaraba MIT para todo**, lo
  que era incorrecto. Corregido en [`LICENCIAS.md`](../LICENCIAS.md).
- **Textos municipales.** Las hectáreas y colindancias de las zonales son documentos
  administrativos oficiales, que **no son objeto de derecho de autor** según el
  **artículo 9 del Decreto Legislativo N.° 822**. Aun así, se retiró del repositorio público la
  copia completa de la página web municipal (45 KB de HTML) y se conserva solo el **extracto de los
  datos factuales**, citando la fuente.
- **Marcas.** Verificado: **no se usa el escudo, logotipo ni nombre oficial** de la Municipalidad
  Distrital de Comas.

---

## 7. Verificación automática de los requisitos legales

Los requisitos visibles no son una promesa: están comprobados por pruebas que fallan si alguien los
elimina. `tools/verificar_frontend.mjs`, sección 9, ejecuta **14 comprobaciones**, entre ellas:

- el mapa lleva la marca de agua y dice «DATOS FICTICIOS»;
- la marca está **dentro** del contenedor del mapa (para que salga en cualquier captura);
- los reportes del listado llevan la etiqueta de ficticio;
- existe el aviso legal, se abre y contiene la cláusula de efectos legales y la prohibición de
  datos de terceros y de acusaciones;
- la política cita el **D.S. N.° 016-2024-JUS** y **no** cita el derogado;
- la política informa del flujo transfronterizo y de la licencia ODbL.

Se ejecuta en cada push a través de GitHub Actions.

---

## 8. Antes de usar esto con reportes reales — lista de comprobación

Ninguna de estas cosas está hecha, y son **condición previa**:

1. **Inscribir el banco de datos personales ante la ANPD** (gratuito, en línea, aprobación
   automática). Antes de recoger el primer dato real.
2. **Aviso de privacidad definitivo** con los datos reales del responsable, no de un prototipo.
3. **Canal formal de atención al titular** con plazo de respuesta de 10 días para la oposición.
4. **Política de conservación efectiva y automatizada**: borrado real de fotografías y reportes
   al vencer el plazo, no una promesa escrita.
5. **Procedimiento de notificación de incidentes en 48 horas**, con responsable identificado.
6. **Salvaguardas documentadas para el flujo transfronterizo**, o migrar el alojamiento a una
   región con nivel de protección adecuado. Conviene revisar si la base D1 puede ubicarse en
   Sudamérica (Brasil tiene la LGPD, con ley integral y autoridad).
7. **Turnstile real** en lugar de las claves de prueba, para que la protección antibot sea efectiva.
8. **Moderación**: aunque la app no tenga comentarios, alguien debe poder retirar un reporte con
   datos de terceros o con acusaciones.
9. **Términos de uso aceptados explícitamente** antes de enviar (hoy se informan, no se aceptan).
10. **Consulta con un abogado** antes de difundirlo masivamente.

---

## 9. Fuentes consultadas

| Tema | Fuente |
|---|---|
| Obligación y trámite de inscripción del banco de datos | [ANPD — Inscribir banco de datos](https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales) |
| Novedades del D.S. N.° 016-2024-JUS | [CMS — Nuevo Reglamento de Protección de Datos Personales](https://cms.law/es/per/publication/nuevo-reglamento-de-proteccion-de-datos-personales) |
| Vigencia, flujo transfronterizo y representante | [Garrigues — Perú publica el nuevo Reglamento](https://www.garrigues.com/es_ES/noticia/peru-publica-nuevo-reglamento-ley-proteccion-datos-personales) |
| Alcance de la usurpación de funciones | [Casación 226-2021, Áncash (LP Derecho)](https://lpderecho.pe/usurpacion-funciones-configuracion-no-importa-acto-funcional-corresponde-afacultades-funcionario-publico-asume-basta-carencia-titulo-nombramiento-funcion-realizo-sujeto-asumio-agente-municipal-ex/) |
| Difamación en entornos digitales | [La República — Cómo denunciar por difamación en redes](https://larepublica.pe/sociedad/2023/07/03/como-hacer-una-denuncia-por-difamacion-en-redes-sociales-en-peru-ante-la-policia-nacional-modelo-de-denuncia-por-facebook-nspe-260526) |
| Metadatos de las 14 zonales | [Municipalidad Distrital de Comas — Geografía](https://www.municomas.gob.pe/distrito/geografia) |
| Licencia de los datos geográficos | [OpenStreetMap — Copyright y licencia](https://www.openstreetmap.org/copyright) |

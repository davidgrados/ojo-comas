/* =============================================================================
 * Ojo Comas · app.js
 * Prototipo ciudadano (demostración, datos ficticios) para el distrito de Comas,
 * Lima, Perú. Script clásico (sin import/export, sin build step, sin frameworks).
 *
 * Contrato de API consumido (Cloudflare Worker en el mismo dominio):
 *   GET  /api/reports            -> GeoJSON FeatureCollection
 *   POST /api/report             -> {ok:true,id,zona,estado,foto_url,mensaje}
 *   GET  /api/reports/:id        -> {ok:true,reporte,historial}
 *   POST /api/reports/:id/confirm-> {ok:true,confirmaciones} | 409
 *   GET  /api/stats              -> {ok:true,total,por_estado,por_categoria,por_zona,ranking}
 *   GET  /api/health             -> {ok:true,servicio,version,hora}
 *
 * Modo degradado: si la API no responde se usan ./data/reportes_demo.geojson y,
 * como última red de seguridad, los arreglos locales de DATOS_RESPALDO.
 * La interfaz NUNCA se queda en blanco.
 * ========================================================================== */
(function () {
  'use strict';

  /* ==========================================================================
   * 1. CONFIGURACIÓN
   * ======================================================================= */
  var CONFIG = {
    apiBase: '',                                  // mismo origen por defecto; se puede sobreescribir
    turnstileSitekey: '1x00000000000000000000AA', // sitekey de PRUEBA de Cloudflare (siempre pasa)
    limiteFeedInicial: 20,                        // paginación: limit 20 al inicio
    pasoPagina: 20,
    limiteApiReportes: 500,                       // limit máximo del contrato
    maxLadoFoto: 1280,                            // redimensión de la fotografía
    calidadJpeg: 0.75,                            // compresión JPEG
    pesoFotoObjetivo: 1400000,                    // ~1.4 MB de cadena base64
    pesoFotoMaximo: 2400000,                      // por encima de esto avisamos y re-comprimimos
    timeoutApiMs: 12000,
    esperaTurnstileMs: 9000,
    debug: false
  };
  if (window.OJO_COMAS_CONFIG && typeof window.OJO_COMAS_CONFIG === 'object') {
    Object.assign(CONFIG, window.OJO_COMAS_CONFIG);
  }

  var RUTAS = {
    zonas: './data/comas_zonas.geojson',
    distrito: './data/comas_distrito.geojson',
    resumen: './data/zonas_resumen.json',
    reportesDemo: './data/reportes_demo.geojson'
  };

  /* ==========================================================================
   * 2. DATOS DE ÚLTIMO RECURSO (embebidos)
   * Si la API no responde Y los archivos locales tampoco se pueden leer
   * (por ejemplo al abrir el HTML con file://), el prototipo sigue siendo
   * usable con esta información mínima.
   * ======================================================================= */
  var PRECISION_RESPALDO = 'aproximada (ilustrativa): no es el limite oficial de la zonal';

  var RESPALDO_ZONAS = [
    ['01', 'Zona 01', '#1D4E89', 200.6, 'margen Sur del distrito', 'Av. Tupac Amaru; comercio zonal, pirotecnias y lubricentros', -11.967548, -77.055068],
    ['02', 'Zona 02', '#2A9D8F', 343.83, 'margen Sur del distrito', 'Zona sur-oeste; limite real con Los Olivos e Independencia', -11.950483, -77.042645],
    ['03', 'Zona 03', '#6A4C93', 320.69, 'parte Central Este del distrito', 'Zona central este, hacia el limite con San Juan de Lurigancho', -11.930308, -77.015165],
    ['04', 'Zona 04', '#E76F51', 303.42, 'parte central del distrito', 'Parque Zonal Sinchi Roca; Av. Tupac Amaru', -11.9334, -77.042155],
    ['05', 'Zona 05', '#457B9D', 203.38, 'parte Norte del distrito', 'Zona norte, entre Carabayllo y San Juan de Lurigancho', -11.916237, -77.021461],
    ['06', 'Zona 06', '#8AB17D', 279.08, 'parte Sur-Oeste del distrito', 'Av. Universitaria y Av. 22 de Agosto; Hospital del Seguro Social, Compania de Bomberos y comisaria', -11.948481, -77.060178],
    ['07', 'Zona 07', '#B08968', 294.71, 'parte Norte-oeste del distrito', 'Av. Universitaria y Av. Retablo; areas verdes y restos arqueologicos', -11.93222, -77.062072],
    ['08', 'Zona 08', '#5E60CE', 242.91, 'extremo Norte del distrito', 'Av. Universitaria, Av. San Carlos, Av. San Felipe; afloramiento de aguas subterraneas', -11.900547, -77.043533],
    ['09', 'Zona 09', '#0096C7', 203.6, 'parte Norte-oeste del distrito', 'Av. Universitaria; plantas recicladoras y puntos criticos de residuos solidos', -11.917605, -77.038675],
    ['10', 'Zona 10', '#9D4DDA', 125.3, 'parte central del distrito', 'Av. Universitaria y Av. Micaela Bastidas; areas verdes y comercio ambulatorio', -11.935746, -77.032366],
    ['11', 'Zona 11', '#F4A261', 134.56, 'parte Central Sur del distrito', 'Av. Universitaria, Av. Carabayllo, Av. Honduras, Av. Mexico', -11.951725, -77.026267],
    ['12', 'Zona 12', '#3A86FF', 320.35, 'parte Nor-este del distrito', 'Av. Revolucion; Collique (sectores VII y VIII); cementerio municipal; laderas de 30-40 grados', -11.906179, -77.000779],
    ['13', 'Zona 13', '#2D6A4F', 140.7, 'parte central-sur del distrito', 'Av. Tupac Amaru, Av. Micaela Bastidas y Belaunde; densidad mas alta del distrito (294.7 hab/ha)', -11.937384, -77.024469],
    ['14', 'Zona 14', '#7F5539', 553.29, 'parte Nor-Oeste del distrito', 'Zona agricola y ganadera junto al rio Chillon; suelo aluvial casi plano', -11.908918, -77.056776]
  ];

  /* [id, categoria, zona, estado, días atrás, confirmaciones, descripción, dirección, lat, lng] */
  var RESPALDO_REPORTES = [
    [1, 'bache', '01', 'pendiente', 2, 7, 'Hueco profundo frente al mercado, los mototaxis tienen que esquivarlo y ya causo una caida.', 'Av. Tupac Amaru cdra. 12, San Eulogio', -11.967548, -77.055068],
    [2, 'alumbrado', '01', 'en_proceso', 8, 4, 'Tres postes apagados en el pasaje; desde las 7 pm la cuadra queda a oscuras.', 'Pasaje Los Algarrobos, Villa Hiper', -11.967548, -77.055068],
    [3, 'basura', '02', 'pendiente', 1, 11, 'Acumulacion de basura y escombros en la esquina, ya hay moscas y olor fuerte.', 'Calle Los Angeles con Av. El Parral', -11.950484, -77.042645],
    [4, 'bache', '02', 'resuelto', 26, 15, 'Pista hundida por filtracion de agua, reportada hace semanas y ya fue parchada.', 'Av. San Martin de Porres, Inca Huasi', -11.950484, -77.042645],
    [5, 'otro', '03', 'pendiente', 4, 3, 'Vereda levantada por las raices de un arbol; los adultos mayores tropiezan.', 'Jr. Nueva Generacion, 12 de Agosto', -11.930307, -77.015166],
    [6, 'bache', '04', 'en_proceso', 6, 9, 'Cruce con harto trafico y la pista esta partida en dos, los carros bajan al carril contrario.', 'Av. Tupac Amaru con Av. Año Nuevo, La Pascana', -11.9334, -77.042155],
    [7, 'alumbrado', '05', 'pendiente', 2, 6, 'Luminaria intermitente en la escalera publica; casi todos los vecinos suben con celular.', 'Escalinata Las Rocas de Jesus, Comite 6', -11.916237, -77.021461],
    [8, 'basura', '06', 'en_proceso', 5, 8, 'Contenedor desbordado desde el fin de semana, la recoleccion no paso por la cuadra.', 'Av. Universitaria cdra. 62, Santa Luzmila', -11.94848, -77.060178],
    [9, 'bache', '07', 'pendiente', 8, 5, 'Bache grande en la subida, cuando llueve se llena de agua y no se ve el fondo.', 'Av. El Retablo, El Retablo 2', -11.93222, -77.062072],
    [10, 'otro', '08', 'pendiente', 2, 12, 'Fuga de agua en la pista desde hace dos dias, el chorro corre por toda la vereda.', 'Av. San Felipe, San Felipe 2', -11.900548, -77.043533],
    [11, 'basura', '09', 'resuelto', 21, 14, 'Punto critico de residuos junto al paradero; tras el reporte limpiaron el area.', 'Av. Universitaria con Av. Collique, Collique Zona 1', -11.917605, -77.038675],
    [12, 'alumbrado', '10', 'en_proceso', 6, 10, 'Poste inclinado con cables expuestos despues del temblor; peligroso para los chicos.', 'Av. Micaela Bastidas, Proyecto Integral 200', -11.935746, -77.032366],
    [13, 'bache', '11', 'pendiente', 3, 4, 'Calle sin asfaltar con huecos y piedras sueltas, los autos levantan polvo todo el dia.', 'Calle La Juventud, La Juventud', -11.951725, -77.026267],
    [14, 'otro', '12', 'pendiente', 1, 18, 'Muro de contencion agrietado en la ladera; con las lluvias el riesgo de derrumbe es alto.', 'Calle Los Claveles, Lomas de Collique', -11.906179, -77.000779],
    [15, 'alumbrado', '12', 'en_proceso', 11, 6, 'Sector sin alumbrado publico hace un mes, la zona se usa como botadero de noche.', 'Asentamiento Humano 28 de Julio, Collique Zona 5', -11.906179, -77.000779],
    [16, 'basura', '13', 'pendiente', 2, 9, 'Bolsones de basura acumulados al costado del paradero, ya hay roedores.', 'Av. Belaunde con Av. Micaela Bastidas, El Misti', -11.937383, -77.024469],
    [17, 'otro', '14', 'pendiente', 5, 2, 'Camino rural deteriorado junto a la zona agricola del rio Chillon, dificil paso para motos.', 'Condominio Sol del Retablo, zona agricola Chillon', -11.908917, -77.056776],
    [18, 'alumbrado', '02', 'resuelto', 17, 13, 'Alumbrado restablecido en la cancha del barrio, los vecinos volvieron a usar el espacio.', 'Calle Virgen del Carmen, Virgen del Carmen', -11.950484, -77.042645],
    [19, 'bache', '05', 'pendiente', 10, 7, 'Pista agrietada junto al colegio, el desague se tapa y el agua entra a las casas.', 'Av. Húsares de Junín, Húsares de Junín', -11.916237, -77.021461],
    [20, 'otro', '07', 'resuelto', 30, 16, 'Arbol caido bloqueaba media pista; fue retirado por la cuadrilla municipal.', 'Av. Los Girasoles, Los Girasoles', -11.93222, -77.062072]
  ];

  /* ==========================================================================
   * 3. CATÁLOGOS
   * ======================================================================= */
  var CATEGORIAS = {
    bache: { emoji: '🕳️', nombre: 'Bache' },
    basura: { emoji: '🗑️', nombre: 'Basura' },
    alumbrado: { emoji: '💡', nombre: 'Alumbrado' },
    otro: { emoji: '📌', nombre: 'Otro' }
  };

  var ESTADOS = {
    pendiente: { nombre: 'Pendiente', color: '#C8102E' },
    en_proceso: { nombre: 'En proceso', color: '#E8A33D' },
    resuelto: { nombre: 'Resuelto', color: '#1F9D55' }
  };

  var ETIQUETA_DEMO = 'Mostrando datos de demostración locales (la API no responde)';

  /* ==========================================================================
   * 4. ESTADO GLOBAL
   * ======================================================================= */
  var ESTADO = {
    zonas: null,            // FeatureCollection de las 14 zonas (con polígonos) o null
    distrito: null,         // FeatureCollection del límite distrital o null
    resumen: null,          // zonas_resumen.json o null
    propsZona: {},          // { '01': {..propiedades..} }
    centroZona: {},         // { '01': [lat,lng] }
    reportes: [],
    indiceReportes: {},
    stats: null,
    modoDemo: false,
    fuenteReportes: 'api',
    filtroZona: '',
    visiblesEstado: { pendiente: true, en_proceso: true, resuelto: true },
    limiteFeed: CONFIG.limiteFeedInicial,
    apoyados: {},
    mapa: null,
    capaZonas: null,
    capaDistrito: null,
    capaReportes: null,
    capaUsuario: null,
    marcadores: {},
    pendienteUbicacion: null,
    modalActivo: null,
    origenFoco: null,
    paso: 1,
    turnstileWidgetReporte: null,
    turnstileWidgetApoyo: null,
    turnstileListo: false,
    foto: { dataUrl: null, bytes: 0, originalBytes: 0, ancho: 0, alto: 0 },
    grafico: null,
    reporteApoyo: null,
    temporizadorExito: null,
    clickEnZona: 0,
    iniciado: false
  };

  var N = {}; // caché de nodos del DOM

  /* ==========================================================================
   * 5. UTILIDADES
   * ======================================================================= */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function log() {
    if (CONFIG.debug && window.console) { console.log.apply(console, ['[Ojo Comas]'].concat(Array.prototype.slice.call(arguments))); }
  }
  function aviso() {
    if (window.console) { console.warn.apply(console, ['[Ojo Comas]'].concat(Array.prototype.slice.call(arguments))); }
  }

  function esc(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function texto(valor, alternativa) {
    var v = (valor === null || valor === undefined) ? '' : String(valor).trim();
    return v || (alternativa || '');
  }

  function normalizarZona(zona) {
    var v = String(zona === null || zona === undefined ? '' : zona).trim();
    if (!v) { return ''; }
    v = v.replace(/[^0-9]/g, '');
    if (!v) { return ''; }
    if (v.length === 1) { v = '0' + v; }
    return v.slice(0, 2);
  }

  function urlAbsoluta(u) {
    if (!u) { return ''; }
    if (/^(https?:|data:|blob:)/i.test(u)) { return u; }
    var base = String(CONFIG.apiBase || '').replace(/\/+$/, '');
    return base + (u.charAt(0) === '/' ? u : '/' + u);
  }

  function apiUrl(ruta) {
    var base = String(CONFIG.apiBase || '').replace(/\/+$/, '');
    return base + ruta;
  }

  function bytesDeDataUrl(dataUrl) {
    if (!dataUrl || dataUrl.indexOf('base64,') === -1) { return 0; }
    var b64 = dataUrl.split('base64,')[1] || '';
    var relleno = (b64.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.round((b64.length * 3) / 4) - relleno);
  }

  function formatoPeso(bytes) {
    if (!bytes) { return '0 KB'; }
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return Math.round(bytes / 1024) + ' KB'; }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function colorTextoPara(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    if (h.length !== 6) { return '#FFFFFF'; }
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return l > 0.55 ? '#111827' : '#FFFFFF';
  }

  function fechaValida(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function fechaRelativa(iso) {
    var d = fechaValida(iso);
    if (!d) { return 'fecha no disponible'; }
    var segundos = Math.floor((Date.now() - d.getTime()) / 1000);
    if (segundos < 0) { segundos = 0; }
    if (segundos < 60) { return 'hace instantes'; }
    var minutos = Math.floor(segundos / 60);
    if (minutos < 60) { return 'hace ' + minutos + (minutos === 1 ? ' minuto' : ' minutos'); }
    var horas = Math.floor(minutos / 60);
    if (horas < 24) { return 'hace ' + horas + (horas === 1 ? ' hora' : ' horas'); }
    var dias = Math.floor(horas / 24);
    if (dias === 1) { return 'hace 1 día'; }
    if (dias < 30) { return 'hace ' + dias + ' días'; }
    var semanas = Math.floor(dias / 7);
    if (semanas < 5) { return 'hace ' + semanas + ' semanas'; }
    var meses = Math.floor(dias / 30);
    if (meses < 12) { return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses'); }
    return fechaCorta(iso);
  }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  function fechaCorta(iso) {
    var d = fechaValida(iso);
    if (!d) { return 'fecha no disponible'; }
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fechaHora(iso) {
    var d = fechaValida(iso);
    if (!d) { return 'fecha no disponible'; }
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return fechaCorta(iso) + ' · ' + hh + ':' + mm;
  }

  function normalizarEstado(v) {
    var s = String(v || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (s === 'en-proceso' || s === 'enproceso' || s === 'proceso') { s = 'en_proceso'; }
    return ESTADOS[s] ? s : 'pendiente';
  }

  function normalizarCategoria(v) {
    var c = String(v || '').trim().toLowerCase();
    return CATEGORIAS[c] ? c : 'otro';
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* ---- Toasts / mensajes accesibles (aria-live="polite") ----------------- */
  function toast(mensaje, tipo, duracion) {
    if (!N.toasts) { return; }
    var el = document.createElement('div');
    el.className = 'toast toast--' + (tipo || 'info');
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.textContent = mensaje;
    N.toasts.appendChild(el);
    while (N.toasts.children.length > 3) { N.toasts.removeChild(N.toasts.firstChild); }
    setTimeout(function () {
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }, duracion || (tipo === 'error' ? 8000 : 5000));
  }

  /* ---- HTTP con temporizador -------------------------------------------- */
  function httpJSON(url, opciones) {
    var opts = opciones || {};
    var controlador = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var temporizador = null;
    var cfg = { method: opts.method || 'GET', headers: {} };

    if (controlador) {
      cfg.signal = controlador.signal;
      temporizador = setTimeout(function () { controlador.abort(); }, opts.timeout || CONFIG.timeoutApiMs);
    }
    if (opts.body !== undefined && opts.body !== null) {
      cfg.headers['Content-Type'] = 'application/json';
      cfg.body = JSON.stringify(opts.body);
    }

    return fetch(url, cfg)
      .then(function (resp) {
        return resp.text().then(function (t) {
          var datos = null;
          if (t) { try { datos = JSON.parse(t); } catch (e) { datos = null; } }
          return { ok: resp.ok, status: resp.status, datos: datos, crudo: t };
        });
      })
      .then(function (res) {
        if (temporizador) { clearTimeout(temporizador); }
        return res;
      }, function (err) {
        if (temporizador) { clearTimeout(temporizador); }
        var e = new Error(err && err.name === 'AbortError' ? 'La solicitud tardó demasiado.' : 'No se pudo conectar con el servidor.');
        e.causa = err;
        throw e;
      });
  }

  function cargarJSONLocal(ruta) {
    return fetch(ruta, { cache: 'no-store' }).then(function (resp) {
      if (!resp.ok) { throw new Error('HTTP ' + resp.status + ' al leer ' + ruta); }
      return resp.json();
    });
  }

  function mensajeErrorDe(respuesta, alternativa) {
    if (respuesta && respuesta.datos && typeof respuesta.datos.error === 'string' && respuesta.datos.error.trim()) {
      return respuesta.datos.error.trim();
    }
    if (respuesta && respuesta.status === 413) { return 'La foto es demasiado grande. Prueba con una imagen más ligera.'; }
    if (respuesta && respuesta.status === 429) { return 'Demasiados envíos desde tu conexión. Espera unos minutos e inténtalo otra vez.'; }
    if (respuesta && respuesta.status === 403) { return 'No se pudo verificar que seas una persona. Recarga la página e inténtalo de nuevo.'; }
    if (respuesta && respuesta.status === 400) { return 'Revisa los datos del reporte: el servidor los rechazó.'; }
    if (respuesta && respuesta.status >= 500) { return 'El servidor tuvo un problema. Inténtalo más tarde.'; }
    return alternativa || 'No se pudo completar la operación.';
  }

  /* ==========================================================================
   * 6. CARGA DE DATOS (con modo degradado en cascada)
   * ======================================================================= */
  /* Acepta marcas de tiempo ISO 8601 (contrato de la API), epoch en segundos o
     milisegundos y descripciones relativas del estilo "hace-27-dias" que pueden
     aparecer en generadores de datos de demostración. */
  function normalizarFechaTexto(valor) {
    var d = fechaValida(valor);
    if (d) { return d.toISOString(); }
    var s = String(valor === null || valor === undefined ? '' : valor).trim().toLowerCase();
    var m = s.match(/^hace[-_ ]?(\d+)[-_ ]?(minuto|min|hora|horas|h|dia|dias|d|semana|semanas|mes|meses|ano|anos|a)/);
    if (m) {
      var n = Number(m[1]);
      var unidad = m[2];
      var ms = 86400000; // días por defecto
      if (unidad.indexOf('min') === 0) { ms = 60000; }
      else if (unidad === 'h' || unidad.indexOf('hora') === 0) { ms = 3600000; }
      else if (unidad.indexOf('semana') === 0) { ms = 604800000; }
      else if (unidad.indexOf('mes') === 0) { ms = 2592000000; }
      else if (unidad === 'a' || unidad.indexOf('ano') === 0) { ms = 31536000000; }
      return new Date(Date.now() - n * ms).toISOString();
    }
    var num = Number(valor);
    if (isFinite(num) && num > 0) {
      return new Date(num < 1e12 ? num * 1000 : num).toISOString();
    }
    return new Date().toISOString();
  }

  function normalizarFeatureReporte(f) {
    var p = (f && f.properties) || {};
    var coords = (f && f.geometry && f.geometry.coordinates) || [];
    var lng = Number(coords[0]);
    var lat = Number(coords[1]);
    if (!isFinite(lat) || !isFinite(lng)) { return null; }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: p.id !== undefined && p.id !== null ? p.id : null,
        categoria: normalizarCategoria(p.categoria),
        descripcion: texto(p.descripcion, ''),
        zona: normalizarZona(p.zona),
        estado: normalizarEstado(p.estado),
        foto_url: p.foto_url || null,
        direccion: p.direccion || null,
        creado_en: normalizarFechaTexto(p.creado_en),
        actualizado_en: normalizarFechaTexto(p.actualizado_en || p.creado_en),
        confirmaciones: isFinite(Number(p.confirmaciones)) ? Number(p.confirmaciones) : 0
      },
      _lat: lat,
      _lng: lng
    };
  }

  /* Reancla las fechas de los datos de demostración al momento actual para que
     las fechas relativas del feed sigan siendo creíbles en cualquier fecha. */
  function reanclarFechasDemo(features) {
    if (!features.length) { return features; }
    var maximo = 0;
    features.forEach(function (f) {
      var d = fechaValida(f.properties.creado_en);
      if (d && d.getTime() > maximo) { maximo = d.getTime(); }
    });
    if (!maximo) { return features; }
    var desplazamiento = Date.now() - 120000 - maximo; // el más reciente queda "hace 2 minutos"
    features.forEach(function (f) {
      var d = fechaValida(f.properties.creado_en);
      var a = fechaValida(f.properties.actualizado_en);
      if (d) { f.properties.creado_en = new Date(d.getTime() + desplazamiento).toISOString(); }
      if (a) { f.properties.actualizado_en = new Date(a.getTime() + desplazamiento).toISOString(); }
    });
    return features;
  }

  function reportesDesdeRespaldo() {
    var ahora = Date.now();
    return RESPALDO_REPORTES.map(function (r) {
      var creado = new Date(ahora - r[4] * 86400000 - 3600000).toISOString();
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r[9], r[8]] },
        properties: {
          id: r[0],
          categoria: r[1],
          descripcion: r[6],
          zona: r[2],
          estado: r[3],
          foto_url: null,
          direccion: r[7],
          creado_en: creado,
          actualizado_en: creado,
          confirmaciones: r[5]
        },
        _lat: r[8],
        _lng: r[9]
      };
    });
  }

  function propsZonaDesdeRespaldo() {
    var mapa = {};
    RESPALDO_ZONAS.forEach(function (z) {
      mapa[z[0]] = {
        zona: z[0], nombre: z[1], color: z[2], area_ha_oficial: z[3],
        ubicacion_oficial: z[4], referencia: z[5], colinda: null,
        barrios_reales: [], hitos_reales: [], centro: [z[6], z[7]],
        semilla: [z[6], z[7]], ancla: '', precision: PRECISION_RESPALDO
      };
      ESTADO.centroZona[z[0]] = [z[6], z[7]];
    });
    return mapa;
  }

  function registrarPropsZona(fc) {
    if (!fc || !fc.features) { return; }
    fc.features.forEach(function (f) {
      var p = f.properties || {};
      var z = normalizarZona(p.zona);
      if (!z) { return; }
      ESTADO.propsZona[z] = p;
      var centro = p.centro || p.semilla;
      if (centro && centro.length === 2) { ESTADO.centroZona[z] = [Number(centro[0]), Number(centro[1])]; }
    });
  }

  function cargarDatosBase() {
    var tareas = [];

    tareas.push(cargarJSONLocal(RUTAS.zonas).then(function (fc) {
      ESTADO.zonas = fc;
      registrarPropsZona(fc);
      log('zonas cargadas:', fc.features ? fc.features.length : 0);
    }).catch(function (err) {
      aviso('No se pudo leer el GeoJSON de zonas:', err.message);
      ESTADO.zonas = null;
    }));

    tareas.push(cargarJSONLocal(RUTAS.resumen).then(function (json) {
      ESTADO.resumen = json;
      if (json && json.centro_mapa) { ESTADO.centroMapa = json.centro_mapa; }
    }).catch(function (err) {
      aviso('No se pudo leer zonas_resumen.json:', err.message);
    }));

    tareas.push(cargarJSONLocal(RUTAS.distrito).then(function (fc) {
      ESTADO.distrito = fc;
    }).catch(function (err) {
      aviso('No se pudo leer el límite distrital:', err.message);
      ESTADO.distrito = null;
    }));

    return Promise.all(tareas).then(function () {
      if (!Object.keys(ESTADO.propsZona).length) {
        ESTADO.propsZona = propsZonaDesdeRespaldo();
        mostrarAvisoEntorno('No se pudieron leer los archivos locales de <code>./data</code>. ' +
          'Para ver las 14 zonas con sus polígonos abre la carpeta con un servidor local ' +
          '(por ejemplo: <code>python -m http.server 8080</code>). Se muestran datos mínimos de respaldo.');
      }
      if (location.protocol === 'file:') {
        mostrarAvisoEntorno('Estás abriendo el archivo directamente (<code>file://</code>). ' +
          'Para cargar el GeoJSON de zonas y los reportes locales, sirve la carpeta con un servidor local: ' +
          '<code>python -m http.server 8080</code>. Mientras tanto se usan datos de respaldo.');
      }
      if (ESTADO.resumen && ESTADO.resumen.zonas) {
        ESTADO.resumen.zonas.forEach(function (z) {
          var zz = normalizarZona(z.zona);
          if (zz && !ESTADO.propsZona[zz]) {
            ESTADO.propsZona[zz] = {
              zona: zz, nombre: z.nombre, color: z.color, area_ha_oficial: z.area_ha_oficial,
              ubicacion_oficial: z.ubicacion_oficial, referencia: z.referencia, colinda: null,
              barrios_reales: [], hitos_reales: [], centro: z.centro, precision: PRECISION_RESPALDO
            };
            if (z.centro) { ESTADO.centroZona[zz] = z.centro; }
          }
        });
      }
    });
  }

  function mostrarAvisoEntorno(html) {
    if (!N.avisoEntorno) { return; }
    N.avisoEntorno.innerHTML = html;
    N.avisoEntorno.classList.remove('oculto');
  }

  function mostrarAvisoDemo(mostrar) {
    if (!N.avisoDemo) { return; }
    if (mostrar) {
      N.avisoDemo.textContent = ETIQUETA_DEMO;
      N.avisoDemo.classList.remove('oculto');
    } else {
      N.avisoDemo.classList.add('oculto');
    }
  }

  function cargarReportes() {
    var url = apiUrl('/api/reports') + '?limit=' + CONFIG.limiteApiReportes;
    return httpJSON(url).then(function (resp) {
      if (!resp.ok || !resp.datos || resp.datos.type !== 'FeatureCollection' || !Array.isArray(resp.datos.features)) {
        throw new Error('Respuesta inesperada de /api/reports (HTTP ' + resp.status + ')');
      }
      aplicarReportes(resp.datos.features, 'api');
      return { fuente: 'api', total: resp.datos.features.length };
    }).catch(function (err) {
      aviso('La API /api/reports no respondió (' + err.message + '). Se intenta el respaldo local.');
      return cargarJSONLocal(RUTAS.reportesDemo).then(function (fc) {
        if (!fc || !Array.isArray(fc.features)) { throw new Error('respaldo inválido'); }
        aplicarReportes(reanclarFechasDemo(fc.features.map(normalizarFeatureReporte).filter(Boolean)), 'demo-local');
        return { fuente: 'demo-local', total: fc.features.length };
      }).catch(function (err2) {
        aviso('Tampoco se pudo leer reportes_demo.geojson (' + err2.message + '). Se usan los datos embebidos.');
        aplicarReportes(reportesDesdeRespaldo(), 'demo-embebido');
        return { fuente: 'demo-embebido', total: ESTADO.reportes.length };
      });
    });
  }

  function aplicarReportes(features, fuente) {
    var lista = [];
    features.forEach(function (f) {
      var n = (f && f._lat !== undefined) ? f : normalizarFeatureReporte(f);
      if (n) { lista.push(n); }
    });
    lista.sort(function (a, b) {
      var da = fechaValida(a.properties.creado_en);
      var db = fechaValida(b.properties.creado_en);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    ESTADO.reportes = lista;
    ESTADO.indiceReportes = {};
    lista.forEach(function (f) { ESTADO.indiceReportes[String(f.properties.id)] = f; });
    ESTADO.fuenteReportes = fuente;
    ESTADO.modoDemo = fuente !== 'api';
    mostrarAvisoDemo(ESTADO.modoDemo);
  }

  /* ---- Estadísticas ------------------------------------------------------ */
  function calcularStatsLocal() {
    var porEstado = { pendiente: 0, en_proceso: 0, resuelto: 0 };
    var porCategoria = { bache: 0, basura: 0, alumbrado: 0, otro: 0 };
    var porZonaMapa = {};
    Object.keys(ESTADO.propsZona).forEach(function (z) {
      porZonaMapa[z] = { zona: z, total: 0, pendiente: 0, en_proceso: 0, resuelto: 0 };
    });
    ESTADO.reportes.forEach(function (f) {
      var p = f.properties;
      porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
      porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
      var z = p.zona || '00';
      if (!porZonaMapa[z]) { porZonaMapa[z] = { zona: z, total: 0, pendiente: 0, en_proceso: 0, resuelto: 0 }; }
      porZonaMapa[z].total += 1;
      porZonaMapa[z][p.estado] += 1;
    });
    var porZona = Object.keys(porZonaMapa).map(function (k) { return porZonaMapa[k]; })
      .sort(function (a, b) { return a.zona.localeCompare(b.zona); });
    var ranking = porZona.slice().sort(function (a, b) { return b.total - a.total; })
      .map(function (z) { return { zona: z.zona, total: z.total }; });
    return {
      ok: true,
      total: ESTADO.reportes.length,
      por_estado: porEstado,
      por_categoria: porCategoria,
      por_zona: porZona,
      ranking: ranking,
      actualizado_en: new Date().toISOString(),
      _calculado_local: true
    };
  }

  function cargarStats() {
    return httpJSON(apiUrl('/api/stats')).then(function (resp) {
      if (!resp.ok || !resp.datos || resp.datos.ok !== true) {
        throw new Error('Respuesta inesperada de /api/stats (HTTP ' + resp.status + ')');
      }
      ESTADO.stats = resp.datos;
      ESTADO.stats._calculado_local = false;
      pintarTransparencia();
      return ESTADO.stats;
    }).catch(function (err) {
      aviso('La API /api/stats no respondió (' + err.message + '). Se calcula en el cliente.');
      ESTADO.stats = calcularStatsLocal();
      pintarTransparencia();
      return ESTADO.stats;
    });
  }

  /* ==========================================================================
   * 7. CHIPS DE ZONA Y PANEL DE DETALLE
   * ======================================================================= */
  function zonasOrdenadas() {
    return Object.keys(ESTADO.propsZona).sort(function (a, b) { return a.localeCompare(b); });
  }

  function construirChips() {
    if (!N.chipsZonas) { return; }
    var html = '<button type="button" class="chip chip--todas' + (ESTADO.filtroZona ? '' : ' es-activo') +
      '" data-zona="" aria-pressed="' + (ESTADO.filtroZona ? 'false' : 'true') + '">Todas</button>';
    zonasOrdenadas().forEach(function (z) {
      var p = ESTADO.propsZona[z];
      var color = p.color || '#4B5563';
      html += '<button type="button" class="chip" data-zona="' + esc(z) + '"' +
        ' style="--zona-color:' + esc(color) + ';--zona-texto:' + colorTextoPara(color) + '"' +
        ' aria-pressed="' + (ESTADO.filtroZona === z ? 'true' : 'false') + '"' +
        ' aria-label="Filtrar reportes de la ' + esc(p.nombre || ('Zona ' + z)) + '">' +
        '<span class="chip__punto" aria-hidden="true"></span>' + esc(p.nombre || ('Zona ' + z)) +
        '</button>';
    });
    N.chipsZonas.innerHTML = html;
    marcarChipActivo();
  }

  function marcarChipActivo() {
    if (!N.chipsZonas) { return; }
    $$('.chip', N.chipsZonas).forEach(function (chip) {
      var z = chip.getAttribute('data-zona') || '';
      var activo = (z === ESTADO.filtroZona);
      chip.classList.toggle('es-activo', activo);
      chip.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
  }

  function construirSelectZonas() {
    if (!N.selectZona) { return; }
    var actual = N.selectZona.value;
    var html = '<option value="">Selecciona tu zona</option>';
    zonasOrdenadas().forEach(function (z) {
      var p = ESTADO.propsZona[z];
      html += '<option value="' + esc(z) + '">' + esc(p.nombre || ('Zona ' + z)) +
        ' · ' + esc(texto(p.ubicacion_oficial, 'Comas')) + '</option>';
    });
    N.selectZona.innerHTML = html;
    if (actual) { N.selectZona.value = actual; }
  }

  function pintarDetalleZona() {
    if (!N.detalleZona) { return; }
    var z = ESTADO.filtroZona;
    if (!z) {
      var total = ESTADO.reportes.length;
      N.detalleZona.innerHTML =
        '<p class="detalle-zona__vacio">Aún no elegiste una zona. Selecciona <strong>Todas</strong> para ver el distrito completo ' +
        'o toca una zona del listado para conocer su área oficial, sus barrios reales y sus hitos.' +
        (total ? ' Hay <strong>' + total + '</strong> reportes en el distrito.' : '') + '</p>';
      return;
    }
    var p = ESTADO.propsZona[z] || { zona: z, nombre: 'Zona ' + z, color: '#C8102E' };
    var color = p.color || '#C8102E';
    var barrios = Array.isArray(p.barrios_reales) ? p.barrios_reales : [];
    var hitos = Array.isArray(p.hitos_reales) ? p.hitos_reales : [];
    var colinda = p.colinda || {};
    var reportesZona = ESTADO.reportes.filter(function (f) { return f.properties.zona === z; });

    function listaColinda(clave) {
      var v = colinda[clave];
      if (!v) { return '—'; }
      if (Array.isArray(v)) {
        return v.map(function (x) {
          var zz = normalizarZona(x);
          if (zz && ESTADO.propsZona[zz]) { return 'Zona ' + zz; }
          return texto(x, '—');
        }).join(', ');
      }
      return texto(v, '—');
    }

    var html = '';
    html += '<div class="detalle-zona__cinta" style="--zona-color:' + esc(color) + '"></div>';
    html += '<h3 class="detalle-zona__titulo" style="color:' + esc(color) + '">' + esc(p.nombre || ('Zona ' + z)) + '</h3>';
    html += '<p class="seccion__ayuda">' + esc(texto(p.ubicacion_oficial, 'Ubicación oficial no disponible')) + ' · ' +
      reportesZona.length + (reportesZona.length === 1 ? ' reporte registrado' : ' reportes registrados') + '</p>';

    html += '<dl class="detalle-zona__grid">';
    html += '<div class="detalle-zona__item"><dt>Área oficial</dt><dd>' +
      (p.area_ha_oficial !== undefined && p.area_ha_oficial !== null ? esc(p.area_ha_oficial) + ' ha' : 'No disponible') + '</dd></div>';
    html += '<div class="detalle-zona__item"><dt>Referencia</dt><dd>' + esc(texto(p.referencia, 'No disponible')) + '</dd></div>';
    html += '<div class="detalle-zona__item"><dt>Colinda al norte</dt><dd>' + esc(listaColinda('norte')) + '</dd></div>';
    html += '<div class="detalle-zona__item"><dt>Colinda al sur</dt><dd>' + esc(listaColinda('sur')) + '</dd></div>';
    html += '<div class="detalle-zona__item"><dt>Colinda al este</dt><dd>' + esc(listaColinda('este')) + '</dd></div>';
    html += '<div class="detalle-zona__item"><dt>Colinda al oeste</dt><dd>' + esc(listaColinda('oeste')) + '</dd></div>';
    html += '</dl>';

    if (barrios.length) {
      html += '<p class="detalle-zona__subtitulo">Barrios reales (' + barrios.length + ')</p>';
      html += '<div class="chips-barrios">' + barrios.map(function (b) {
        return '<span class="chip-barrio">' + esc(b) + '</span>';
      }).join('') + '</div>';
    } else {
      html += '<p class="detalle-zona__subtitulo">Barrios reales</p>';
      html += '<p class="campo__ayuda">No se pudo leer el listado de barrios reales (falta el GeoJSON de zonas).</p>';
    }

    if (hitos.length) {
      html += '<p class="detalle-zona__subtitulo">Hitos reales (' + hitos.length + ')</p>';
      html += '<ul class="hitos" style="--zona-color:' + esc(color) + '">' + hitos.map(function (h) {
        return '<li class="hito"><span class="hito__tipo">' + esc(texto(h.tipo, 'Hito')) + '</span><span>' + esc(texto(h.nombre, 'Sin nombre')) + '</span></li>';
      }).join('') + '</ul>';
    }

    html += '<p class="detalle-zona__precision"><strong>Precisión:</strong> ' +
      esc(texto(p.precision, PRECISION_RESPALDO)) + '. Los límites mostrados son aproximados e ilustrativos.</p>';
    html += '<div class="detalle-zona__acciones">' +
      '<button type="button" class="btn btn--suave btn--chico" data-zona="">Ver todo el distrito</button>' +
      '<button type="button" class="btn btn--suave btn--chico" id="btnVerZonaMapa">🔎 Ver en el mapa</button>' +
      '<button type="button" class="btn btn--primario btn--chico" id="btnReportarEnZona">➕ Reportar en esta zona</button>' +
      '</div>';

    N.detalleZona.innerHTML = html;
    var btn = $('#btnReportarEnZona', N.detalleZona);
    if (btn) {
      btn.addEventListener('click', function () {
        var centro = ESTADO.centroZona[z];
        abrirFormulario(centro ? { lat: centro[0], lng: centro[1] } : null);
      });
    }
    var btnMapa = $('#btnVerZonaMapa', N.detalleZona);
    if (btnMapa) {
      btnMapa.addEventListener('click', function () {
        if (!ESTADO.mapa) { toast('El mapa no está disponible en este momento.', 'error'); return; }
        if (N.seccionMapa) { N.seccionMapa.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        abrirPopupZona(z, false);
      });
    }
  }

  /* ==========================================================================
   * 8. MAPA
   * ======================================================================= */
  function iniciarMapa() {
    if (typeof L === 'undefined') {
      aviso('Leaflet no está disponible: el mapa se desactiva.');
      if (N.mapaSinLeaflet) { N.mapaSinLeaflet.classList.remove('oculto'); }
      return;
    }
    var centro = (ESTADO.resumen && ESTADO.resumen.centro_mapa) || [-11.92912, -77.03883];
    var zoom = (ESTADO.resumen && ESTADO.resumen.zoom_inicial) || 13;

    ESTADO.mapa = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: false,
      /* preferCanvas queda DESACTIVADO a proposito.
       *
       * Con `preferCanvas: true` Leaflet pinta los poligonos y los marcadores dentro de un
       * <canvas> en lugar de crear elementos del DOM. Eso deja a los marcadores de los reportes
       * sin foco de teclado, sin nombre accesible y sin posibilidad de ser leidos por un lector
       * de pantalla, lo que incumple el requisito de accesibilidad del D.S. N° 029-2021-PCM
       * (Gobierno Digital) y de la Ley N° 27972 en lo que respecta a participacion vecinal.
       *
       * El renderizado SVG solo se vuelve lento con cientos o miles de capas; aqui hay 14 zonas,
       * 1 limite distrital y unas decenas de reportes, muy por debajo de ese umbral. Si en el
       * futuro el volumen creciera, hay que resolverlo con agrupacion de marcadores
       * (L.markerClusterGroup) en vez de desactivar la accesibilidad. */
      preferCanvas: false,
      attributionControl: true
    }).setView(centro, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL)'
    }).addTo(ESTADO.mapa);

    ESTADO.capaDistrito = L.layerGroup().addTo(ESTADO.mapa);
    ESTADO.capaZonas = L.layerGroup().addTo(ESTADO.mapa);
    ESTADO.capaReportes = L.layerGroup().addTo(ESTADO.mapa);
    ESTADO.capaUsuario = L.layerGroup().addTo(ESTADO.mapa);

    agregarLeyenda();
    agregarControlUbicacion();

    ESTADO.mapa.on('click', function (ev) {
      if (Date.now() - ESTADO.clickEnZona < 350) { return; }
      if (N.modalReporte && !N.modalReporte.hidden) { return; }
      marcarPuntoPendiente(ev.latlng.lat, ev.latlng.lng, true);
    });

    log('mapa iniciado');
  }

  function agregarLeyenda() {
    var Leyenda = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'leyenda-mapa');
        div.innerHTML =
          '<span class="leyenda-mapa__titulo">Estado del reporte</span>' +
          '<span class="leyenda-mapa__fila"><span class="leyenda-mapa__punto" style="background:' + ESTADOS.pendiente.color + '"></span>Pendiente</span>' +
          '<span class="leyenda-mapa__fila"><span class="leyenda-mapa__punto" style="background:' + ESTADOS.en_proceso.color + '"></span>En proceso</span>' +
          '<span class="leyenda-mapa__fila"><span class="leyenda-mapa__punto" style="background:' + ESTADOS.resuelto.color + '"></span>Resuelto</span>';
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
      }
    });
    ESTADO.mapa.addControl(new Leyenda());
  }

  function agregarControlUbicacion() {
    var Boton = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var cont = L.DomUtil.create('div', 'leaflet-bar');
        var a = L.DomUtil.create('a', '', cont);
        a.href = '#';
        a.title = 'Ver mi ubicación';
        a.setAttribute('role', 'button');
        a.setAttribute('aria-label', 'Ver mi ubicación en el mapa');
        a.innerHTML = '📍';
        a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;font-size:20px;text-decoration:none;';
        L.DomEvent.on(a, 'click', function (e) {
          L.DomEvent.stop(e);
          pedirUbicacion();
        });
        L.DomEvent.disableClickPropagation(cont);
        return cont;
      }
    });
    ESTADO.mapa.addControl(new Boton());
  }

  function dibujarZonas() {
    if (!ESTADO.mapa || !ESTADO.capaZonas) { return; }
    ESTADO.capaZonas.clearLayers();
    if (!ESTADO.zonas || !ESTADO.zonas.features) {
      zonasOrdenadas().forEach(function (z) {
        var centro = ESTADO.centroZona[z];
        if (!centro) { return; }
        var p = ESTADO.propsZona[z];
        var m = L.circleMarker(centro, {
          radius: 10,
          color: p.color || '#C8102E',
          weight: 3,
          fillColor: '#FFFFFF',
          fillOpacity: 0.9
        }).addTo(ESTADO.capaZonas);
        m.bindTooltip('Z' + z, { permanent: true, direction: 'center', className: 'etiqueta-zona' });
        m.bindPopup(htmlPopupZona(z));
        m.on('click', function () {
          ESTADO.clickEnZona = Date.now();
          seleccionarZona(z, { zoom: false, silencioso: true });
        });
      });
      return;
    }

    ESTADO.zonas.features.forEach(function (feature) {
      var p = feature.properties || {};
      var z = normalizarZona(p.zona);
      if (!z) { return; }
      var color = p.color || '#C8102E';
      var capa = L.geoJSON(feature, {
        style: {
          color: color,
          weight: 1.5,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.13
        }
      }).addTo(ESTADO.capaZonas);

      // Los polígonos cubren TODO el distrito: si el clic sobre la zona no marcara
      // el punto, sería imposible reportar tocando el mapa. Por eso el clic sobre
      // una zonal marca el punto del reporte (acción primaria) y el detalle de la
      // zona se consulta desde la etiqueta «Z0N», el popup o el panel inferior.
      capa.bindTooltip('Z' + z, {
        permanent: true,
        direction: 'center',
        className: 'etiqueta-zona',
        interactive: true
      });
      capa.bindPopup(htmlPopupZona(z), { maxWidth: 300 });
      capa.on('click', function (ev) {
        ESTADO.clickEnZona = Date.now();
        if (!(N.modalReporte && N.modalReporte.hidden === false)) {
          marcarPuntoPendiente(ev.latlng.lat, ev.latlng.lng, true);
        }
      });
      var etiqueta = capa.getTooltip && capa.getTooltip();
      if (etiqueta && etiqueta.on) {
        etiqueta.on('click', function (ev) {
          if (ev && ev.originalEvent) { L.DomEvent.stopPropagation(ev.originalEvent); }
          ESTADO.clickEnZona = Date.now();
          abrirPopupZona(z);
        });
      }
      capa._zona = z;
    });
    resaltarZonaEnMapa();
  }

  function buscarCapaZona(z) {
    var encontrada = null;
    if (!ESTADO.capaZonas) { return null; }
    ESTADO.capaZonas.eachLayer(function (capa) {
      if (capa._zona === z) { encontrada = capa; }
    });
    return encontrada;
  }

  /* Abre el popup de detalle de una zona (nombre, ha, ubicación, colindancias,
     barrios reales e hitos) sin forzar el zoom sobre el distrito. */
  function abrirPopupZona(z, conZoom) {
    z = normalizarZona(z);
    seleccionarZona(z, { zoom: conZoom === true, silencioso: true });
    var capa = buscarCapaZona(z);
    if (capa && capa.openPopup) { capa.openPopup(); }
  }

  function htmlPopupZona(z) {
    var p = ESTADO.propsZona[z] || {};
    var barrios = Array.isArray(p.barrios_reales) ? p.barrios_reales : [];
    var hitos = Array.isArray(p.hitos_reales) ? p.hitos_reales : [];
    var reportesZona = ESTADO.reportes.filter(function (f) { return f.properties.zona === z; }).length;
    var html = '<div style="min-width:200px">';
    html += '<strong style="font-size:15px;color:' + esc(p.color || '#C8102E') + '">' + esc(p.nombre || ('Zona ' + z)) + '</strong>';
    html += '<div style="font-size:13px;color:#4B5563;margin-top:4px">';
    if (p.area_ha_oficial !== undefined) { html += 'Área oficial: <strong>' + esc(p.area_ha_oficial) + ' ha</strong><br>'; }
    if (p.ubicacion_oficial) { html += esc(p.ubicacion_oficial) + '<br>'; }
    if (p.referencia) { html += esc(p.referencia) + '<br>'; }
    html += 'Reportes registrados: <strong>' + reportesZona + '</strong>';
    html += '</div>';
    if (barrios.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin-top:6px"><strong>Barrios reales:</strong> ' +
        esc(barrios.slice(0, 6).join(', ')) + (barrios.length > 6 ? '…' : '') + '</div>';
    }
    if (hitos.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin-top:6px"><strong>Hitos:</strong> ' +
        esc(hitos.slice(0, 4).map(function (h) { return h.nombre; }).join(', ')) + (hitos.length > 4 ? '…' : '') + '</div>';
    }
    html += '<div style="font-size:11px;color:#6B7280;margin-top:6px">' + esc(texto(p.precision, PRECISION_RESPALDO)) + '</div>';
    html += '<div style="margin-top:8px"><button type="button" class="btn btn--suave btn--chico" data-zona="' + esc(z) + '">Ver reportes de esta zona</button></div>';
    html += '</div>';
    return html;
  }

  function dibujarDistrito() {
    if (!ESTADO.mapa || !ESTADO.capaDistrito) { return; }
    ESTADO.capaDistrito.clearLayers();
    if (!ESTADO.distrito || !ESTADO.distrito.features) { return; }
    L.geoJSON(ESTADO.distrito, {
      interactive: false,
      style: {
        color: '#111827',
        weight: 2.5,
        opacity: 0.85,
        fill: false
      }
    }).addTo(ESTADO.capaDistrito);
  }

  function resaltarZonaEnMapa() {
    if (!ESTADO.capaZonas) { return; }
    ESTADO.capaZonas.eachLayer(function (capa) {
      if (!capa.setStyle) { return; }
      var z = capa._zona;
      var p = ESTADO.propsZona[z] || {};
      var color = p.color || '#C8102E';
      var activa = ESTADO.filtroZona === z;
      var hayFiltro = !!ESTADO.filtroZona;
      capa.setStyle({
        color: color,
        weight: activa ? 3.5 : 1.5,
        opacity: hayFiltro && !activa ? 0.35 : 0.9,
        fillColor: color,
        fillOpacity: activa ? 0.3 : (hayFiltro ? 0.05 : 0.13)
      });
      if (activa && capa.bringToFront) { capa.bringToFront(); }
    });
  }

  function dibujarReportes() {
    if (!ESTADO.mapa || !ESTADO.capaReportes) { return; }
    ESTADO.capaReportes.clearLayers();
    ESTADO.marcadores = {};
    ESTADO.reportes.forEach(function (f) {
      var p = f.properties;
      var color = (ESTADOS[p.estado] || ESTADOS.pendiente).color;
      var marcador = L.circleMarker([f._lat, f._lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: 1
      });
      marcador.bindPopup(htmlPopupReporte(f), { maxWidth: 300, minWidth: 220 });
      marcador.bindTooltip((CATEGORIAS[p.categoria] || CATEGORIAS.otro).emoji + ' ' + (CATEGORIAS[p.categoria] || CATEGORIAS.otro).nombre, { direction: 'top', offset: [0, -6] });
      var id = String(p.id);
      ESTADO.marcadores[id] = marcador;
      if (visibleEnMapa(f)) { ESTADO.capaReportes.addLayer(marcador); }
    });
  }

  function htmlPopupReporte(f) {
    var p = f.properties;
    var cat = CATEGORIAS[p.categoria] || CATEGORIAS.otro;
    var est = ESTADOS[p.estado] || ESTADOS.pendiente;
    var html = '<div class="popup-reporte" style="min-width:200px">';
    if (p.foto_url) {
      html += '<img src="' + esc(urlAbsoluta(p.foto_url)) + '" alt="Foto del reporte: ' + esc(cat.nombre) +
        '" style="width:100%;border-radius:12px;margin-bottom:8px" onerror="this.style.display=\'none\'">';
    }
    html += '<div style="font-weight:700;font-size:15px">' + cat.emoji + ' ' + esc(cat.nombre) + '</div>';
    html += '<p style="font-size:14px;margin:4px 0 6px">' + esc(texto(p.descripcion, 'Sin descripción')) + '</p>';
    html += '<div style="font-size:12px;color:#4B5563">';
    html += 'Zona: <strong>' + esc(p.zona || '—') + '</strong><br>';
    html += 'Estado: <strong style="color:' + est.color + '">' + esc(est.nombre) + '</strong><br>';
    html += 'Reportado: ' + esc(fechaRelativa(p.creado_en)) + '<br>';
    if (p.direccion) { html += 'Lugar: ' + esc(p.direccion) + '<br>'; }
    html += 'Apoyos: <strong>' + esc(p.confirmaciones) + '</strong>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">';
    html += '<button type="button" class="btn btn--apoyo btn--chico" data-apoyar="' + esc(p.id) + '">👍 Apoyar este reporte <span class="apoyo__conteo">' + esc(p.confirmaciones) + '</span></button>';
    html += '<button type="button" class="btn btn--fantasma btn--chico" data-detalle="' + esc(p.id) + '">ℹ️ Detalle</button>';
    html += '</div></div>';
    return html;
  }

  function marcarPuntoPendiente(lat, lng, mostrarBoton) {
    ESTADO.pendienteUbicacion = { lat: lat, lng: lng };
    if (ESTADO.capaUsuario && typeof L !== 'undefined') {
      ESTADO.capaUsuario.clearLayers();
      L.circleMarker([lat, lng], {
        radius: 9, color: '#C8102E', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1
      }).addTo(ESTADO.capaUsuario);
      L.circleMarker([lat, lng], {
        radius: 22, color: '#C8102E', weight: 1, opacity: 0.5, fillColor: '#C8102E', fillOpacity: 0.12
      }).addTo(ESTADO.capaUsuario);
    }
    if (N.btnReportarAqui && mostrarBoton) {
      N.btnReportarAqui.classList.remove('oculto');
      N.btnReportarAqui.hidden = false;
      if (N.coordsFlotante) {
        N.coordsFlotante.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
      }
    }
    if (N.btnQuitarPunto && mostrarBoton) {
      N.btnQuitarPunto.classList.remove('oculto');
      N.btnQuitarPunto.hidden = false;
    }
    actualizarCoordsFormulario();
  }

  function limpiarPuntoPendiente() {
    ESTADO.pendienteUbicacion = null;
    if (ESTADO.capaUsuario) { ESTADO.capaUsuario.clearLayers(); }
    if (N.btnReportarAqui) {
      N.btnReportarAqui.classList.add('oculto');
      N.btnReportarAqui.hidden = true;
    }
    if (N.btnQuitarPunto) {
      N.btnQuitarPunto.classList.add('oculto');
      N.btnQuitarPunto.hidden = true;
    }
    actualizarCoordsFormulario();
  }

  function actualizarCoordsFormulario() {
    if (!N.coordsSeleccion) { return; }
    var u = ESTADO.pendienteUbicacion;
    if (!u) {
      N.coordsSeleccion.textContent = 'Toca el mapa para marcar el punto exacto.';
      return;
    }
    var zona = detectarZona(u.lat, u.lng);
    N.coordsSeleccion.innerHTML = 'Lat ' + u.lat.toFixed(6) + ' · Lng ' + u.lng.toFixed(6) +
      (zona ? ' · <strong>Zona ' + esc(zona) + '</strong>' : ' · zona no detectada');
  }

  /* ---- Detección de zona con Turf.js ------------------------------------ */
  function detectarZona(lat, lng) {
    if (ESTADO.zonas && ESTADO.zonas.features && window.turf && typeof window.turf.booleanPointInPolygon === 'function') {
      try {
        var punto = window.turf.point([lng, lat]);
        for (var i = 0; i < ESTADO.zonas.features.length; i++) {
          var feature = ESTADO.zonas.features[i];
          if (!feature || !feature.geometry) { continue; }
          if (window.turf.booleanPointInPolygon(punto, feature)) {
            return normalizarZona(feature.properties && feature.properties.zona);
          }
        }
      } catch (e) {
        aviso('Turf.js falló al detectar la zona:', e.message);
      }
    }
    // Alternativa: zona cuyo centro esté más cerca (máximo 2.5 km)
    var mejor = null;
    var mejorDist = Infinity;
    zonasOrdenadas().forEach(function (z) {
      var c = ESTADO.centroZona[z];
      if (!c) { return; }
      var d = distanciaMetros(lat, lng, c[0], c[1]);
      if (d < mejorDist) { mejorDist = d; mejor = z; }
    });
    if (mejor && mejorDist <= 2500) { return mejor; }
    return null;
  }

  /* ---- Ubicación del usuario -------------------------------------------- */
  function pedirUbicacion(alFinalizar) {
    if (!navigator.geolocation) {
      toast('Tu navegador no permite obtener la ubicación.', 'error');
      if (alFinalizar) { alFinalizar(false); }
      return;
    }
    toast('Buscando tu ubicación…', 'info', 3000);
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      var precision = pos.coords.accuracy || 60;
      if (ESTADO.capaUsuario && typeof L !== 'undefined' && ESTADO.mapa) {
        ESTADO.capaUsuario.clearLayers();
        L.circle([lat, lng], {
          radius: precision,
          color: '#1D4E89',
          weight: 1.5,
          fillColor: '#1D4E89',
          fillOpacity: 0.12
        }).addTo(ESTADO.capaUsuario);
        L.circleMarker([lat, lng], {
          radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#1D4E89', fillOpacity: 1
        }).addTo(ESTADO.capaUsuario);
        ESTADO.mapa.flyTo([lat, lng], 16);
      }
      marcarPuntoPendiente(lat, lng, true);
      var zona = detectarZona(lat, lng);
      if (zona && N.selectZona) {
        N.selectZona.value = zona;
        actualizarDeteccionZona(zona, true);
      }
      toast('Ubicación encontrada (±' + Math.round(precision) + ' m).', 'ok');
      if (alFinalizar) { alFinalizar(true, { lat: lat, lng: lng }); }
    }, function (err) {
      var mensajes = {
        1: 'Diste permiso denegado a la ubicación. Puedes marcar el punto tocando el mapa.',
        2: 'No se pudo obtener tu ubicación en este momento.',
        3: 'La búsqueda de tu ubicación tardó demasiado.'
      };
      toast(mensajes[err.code] || 'No se pudo obtener tu ubicación.', 'error');
      if (alFinalizar) { alFinalizar(false); }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  /* ==========================================================================
   * 9. FILTROS
   * ======================================================================= */
  function visibleEnMapa(f) {
    var p = f.properties;
    if (ESTADO.filtroZona && p.zona !== ESTADO.filtroZona) { return false; }
    return ESTADO.visiblesEstado[p.estado] !== false;
  }

  function reportesFiltrados() {
    return ESTADO.reportes.filter(function (f) {
      if (ESTADO.filtroZona && f.properties.zona !== ESTADO.filtroZona) { return false; }
      return true;
    });
  }

  function aplicarFiltros() {
    if (ESTADO.capaReportes && ESTADO.mapa) {
      Object.keys(ESTADO.marcadores).forEach(function (id) {
        var marcador = ESTADO.marcadores[id];
        var f = ESTADO.indiceReportes[id];
        if (!f) { return; }
        if (visibleEnMapa(f)) {
          if (!ESTADO.capaReportes.hasLayer(marcador)) { ESTADO.capaReportes.addLayer(marcador); }
        } else if (ESTADO.capaReportes.hasLayer(marcador)) {
          ESTADO.capaReportes.removeLayer(marcador);
        }
      });
    }
    resaltarZonaEnMapa();
    marcarChipActivo();
    pintarDetalleZona();
    renderFeed();
    if (N.map) { N.map.setAttribute('aria-label', 'Mapa interactivo de reportes del distrito de Comas' + (ESTADO.filtroZona ? ', filtrando Zona ' + ESTADO.filtroZona : '')); }
  }

  /* Selecciona una zona del distrito.
     opciones.zoom=false  -> no mueve la cámara (útil al tocar el mapa).
     opciones.silencioso  -> no muestra el aviso flotante. */
  function seleccionarZona(z, opciones) {
    var opts = opciones || {};
    var conZoom = opts.zoom !== false;
    z = normalizarZona(z);
    ESTADO.filtroZona = z;
    ESTADO.limiteFeed = CONFIG.limiteFeedInicial;
    if (ESTADO.mapa && conZoom) {
      if (z) {
        var capaZona = buscarCapaZona(z);
        if (capaZona && capaZona.getBounds) {
          ESTADO.mapa.fitBounds(capaZona.getBounds(), { padding: [24, 24], maxZoom: 16 });
        } else if (ESTADO.centroZona[z]) {
          ESTADO.mapa.flyTo(ESTADO.centroZona[z], 15);
        }
      } else {
        var centro = (ESTADO.resumen && ESTADO.resumen.centro_mapa) || [-11.92912, -77.03883];
        var zoom = (ESTADO.resumen && ESTADO.resumen.zoom_inicial) || 13;
        ESTADO.mapa.flyTo(centro, zoom);
      }
    }
    aplicarFiltros();
    if (opts.silencioso !== true) {
      var nombre = z ? (ESTADO.propsZona[z] ? ESTADO.propsZona[z].nombre : 'Zona ' + z) : 'todas las zonas';
      toast('Mostrando ' + nombre + '.', 'ok', 3000);
    }
  }

  function alternarEstado(estado) {
    if (estado === 'todos') {
      var algunoOculto = Object.keys(ESTADO.visiblesEstado).some(function (k) { return !ESTADO.visiblesEstado[k]; });
      var valor = !!algunoOculto;
      Object.keys(ESTADO.visiblesEstado).forEach(function (k) { ESTADO.visiblesEstado[k] = valor; });
    } else if (ESTADO.visiblesEstado[estado] !== undefined) {
      ESTADO.visiblesEstado[estado] = !ESTADO.visiblesEstado[estado];
    }
    sincronizarPills();
    aplicarFiltros();
  }

  function sincronizarPills() {
    if (!N.filtrosEstado) { return; }
    $$('.pill-estado', N.filtrosEstado).forEach(function (pill) {
      var estado = pill.getAttribute('data-estado');
      if (estado === 'todos') {
        var todosVisibles = Object.keys(ESTADO.visiblesEstado).every(function (k) { return ESTADO.visiblesEstado[k]; });
        pill.setAttribute('aria-pressed', todosVisibles ? 'true' : 'false');
        pill.classList.toggle('es-activo', todosVisibles);
      } else {
        var visible = ESTADO.visiblesEstado[estado] !== false;
        pill.setAttribute('aria-pressed', visible ? 'true' : 'false');
        pill.classList.toggle('es-activo', visible);
      }
    });
  }

  /* ==========================================================================
   * 10. FEED DE REPORTES
   * ======================================================================= */
  function renderFeed() {
    if (!N.feed) { return; }
    var lista = reportesFiltrados();
    var visibles = lista.slice(0, ESTADO.limiteFeed);

    if (N.feedResumen) {
      var txt = lista.length === 0
        ? 'Sin reportes para mostrar'
        : 'Mostrando ' + visibles.length + ' de ' + lista.length + ' reportes' +
          (ESTADO.filtroZona ? ' en la Zona ' + ESTADO.filtroZona : ' en el distrito') +
          (ESTADO.modoDemo ? ' · datos de demostración' : '');
      N.feedResumen.textContent = txt;
    }

    if (!visibles.length) {
      var mensajeVacio = ESTADO.reportes.length
        ? '<strong>No hay reportes en esta zona todavía.</strong> Sé el primero en reportar un problema en tu calle.'
        : '<strong>Aún no hay reportes disponibles.</strong> La API no responde y no se encontraron datos de respaldo. Puedes enviar el primer reporte.';
      N.feed.innerHTML = '<div class="feed__vacio">' + mensajeVacio +
        '<div style="margin-top:12px"><button type="button" class="btn btn--primario" id="btnVacioReportar">➕ Reportar un problema</button></div></div>';
      N.feed.setAttribute('aria-busy', 'false');
      var btnVacio = $('#btnVacioReportar', N.feed);
      if (btnVacio) {
        btnVacio.addEventListener('click', function () {
          var centro = ESTADO.filtroZona ? ESTADO.centroZona[ESTADO.filtroZona] : null;
          abrirFormulario(centro ? { lat: centro[0], lng: centro[1] } : null);
        });
      }
      actualizarBotonCargarMas(lista, visibles);
      return;
    }

    var html = visibles.map(function (f) { return htmlTarjetaReporte(f); }).join('');
    N.feed.innerHTML = html;

    $$('img', N.feed).forEach(function (img) {
      img.addEventListener('error', function () {
        var media = img.parentNode;
        if (media) {
          var id = media.getAttribute('data-emoji') || '📌';
          media.innerHTML = '<div class="tarjeta-reporte__sinfoto" aria-hidden="true">' + id + '</div>';
        }
      });
    });

    N.feed.setAttribute('aria-busy', 'false');
    actualizarBotonCargarMas(lista, visibles);
  }

  function htmlTarjetaReporte(f) {
    var p = f.properties;
    var cat = CATEGORIAS[p.categoria] || CATEGORIAS.otro;
    var est = ESTADOS[p.estado] || ESTADOS.pendiente;
    var zonaNombre = ESTADO.propsZona[p.zona] ? ESTADO.propsZona[p.zona].nombre : ('Zona ' + (p.zona || '—'));
    var colorZona = ESTADO.propsZona[p.zona] ? (ESTADO.propsZona[p.zona].color || '#4B5563') : '#4B5563';
    var html = '<article class="tarjeta-reporte" data-reporte="' + esc(p.id) + '">';

    if (p.foto_url) {
      html += '<div class="tarjeta-reporte__media" data-emoji="' + cat.emoji + '">' +
        '<img src="' + esc(urlAbsoluta(p.foto_url)) + '" alt="Foto del reporte: ' + esc(cat.nombre) + ' en ' + esc(zonaNombre) + '" loading="lazy">' +
        '</div>';
    } else {
      html += '<div class="tarjeta-reporte__media" data-emoji="' + cat.emoji + '">' +
        '<div class="tarjeta-reporte__sinfoto" style="background:linear-gradient(135deg,' + esc(colorZona) + '22,' + esc(colorZona) + '0A)" aria-hidden="true">' + cat.emoji + '</div>' +
        '</div>';
    }

    html += '<div class="tarjeta-reporte__cuerpo">';
    html += '<div class="tarjeta-reporte__cabecera">';
    html += '<span class="etiqueta-categoria">' + cat.emoji + ' ' + esc(cat.nombre) + '</span>';
    html += '<span class="badge badge--' + esc(p.estado) + '">' + esc(est.nombre) + '</span>';
    html += '</div>';
    html += '<p class="tarjeta-reporte__desc">' + esc(texto(p.descripcion, 'Sin descripción')) + '</p>';
    html += '<p class="tarjeta-reporte__meta">' +
      '<span style="color:' + esc(colorZona) + ';font-weight:700">' + esc(zonaNombre) + '</span> · ' +
      esc(fechaRelativa(p.creado_en)) + ' · <span title="' + esc(fechaHora(p.creado_en)) + '">' + esc(fechaCorta(p.creado_en)) + '</span></p>';
    if (p.direccion) { html += '<p class="tarjeta-reporte__direccion">📍 ' + esc(p.direccion) + '</p>'; }
    html += '<div class="tarjeta-reporte__acciones">';
    html += '<button type="button" class="btn btn--suave btn--chico" data-ver-mapa="' + esc(p.id) + '">🗺️ Ver en el mapa</button>';
    html += '<button type="button" class="btn btn--apoyo btn--chico" data-apoyar="' + esc(p.id) + '">👍 Apoyar <span class="apoyo__conteo">' + esc(p.confirmaciones) + '</span></button>';
    html += '<button type="button" class="btn btn--fantasma btn--chico" data-detalle="' + esc(p.id) + '">ℹ️ Detalle</button>';
    html += '</div></div></article>';
    return html;
  }

  function actualizarBotonCargarMas(lista, visibles) {
    if (!N.btnCargarMas) { return; }
    var restantes = lista.length - visibles.length;
    if (restantes > 0) {
      N.btnCargarMas.classList.remove('oculto');
      N.btnCargarMas.hidden = false;
      N.btnCargarMas.textContent = 'Cargar más reportes (' + restantes + ' restantes)';
    } else {
      N.btnCargarMas.classList.add('oculto');
      N.btnCargarMas.hidden = true;
    }
  }

  function verEnMapa(id) {
    var f = ESTADO.indiceReportes[String(id)];
    if (!f) { toast('No se encontró el reporte en el mapa.', 'error'); return; }
    if (ESTADO.visiblesEstado[f.properties.estado] === false) {
      ESTADO.visiblesEstado[f.properties.estado] = true;
      sincronizarPills();
    }
    if (ESTADO.filtroZona && f.properties.zona !== ESTADO.filtroZona) {
      ESTADO.filtroZona = '';
      marcarChipActivo();
      pintarDetalleZona();
    }
    if (!ESTADO.mapa || typeof L === 'undefined') {
      toast('El mapa no está disponible en este momento.', 'error');
      return;
    }
    var marcador = ESTADO.marcadores[String(id)];
    if (marcador && !ESTADO.capaReportes.hasLayer(marcador)) { ESTADO.capaReportes.addLayer(marcador); }

    if (N.seccionMapa) { N.seccionMapa.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    var ir = function () {
      ESTADO.mapa.flyTo([f._lat, f._lng], 17, { duration: 0.8 });
      if (marcador) {
        setTimeout(function () {
          try { marcador.openPopup(); } catch (e) { aviso(e); }
        }, 900);
      }
    };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ESTADO.mapa.setView([f._lat, f._lng], 17);
      if (marcador) { marcador.openPopup(); }
    } else {
      ir();
    }
  }

  /* ==========================================================================
   * 11. PANEL DE TRANSPARENCIA
   * ======================================================================= */
  function pintarTransparencia() {
    var s = ESTADO.stats || calcularStatsLocal();
    if (N.contTotal) { N.contTotal.textContent = s.total !== undefined ? s.total : 0; }
    var pe = s.por_estado || {};
    if (N.contPendiente) { N.contPendiente.textContent = pe.pendiente || 0; }
    if (N.contProceso) { N.contProceso.textContent = pe.en_proceso || 0; }
    if (N.contResuelto) { N.contResuelto.textContent = pe.resuelto || 0; }
    pintarGrafico(s);
    pintarRanking(s);
    if (N.statsActualizado) {
      N.statsActualizado.textContent = s._calculado_local
        ? 'Calculado en tu dispositivo (' + fechaHora(s.actualizado_en) + ') porque la API no responde.'
        : 'Actualizado por el servidor: ' + fechaHora(s.actualizado_en) + '.';
    }
  }

  function pintarGrafico(s) {
    var zonas = zonasOrdenadas();
    var mapaZonas = {};
    (s.por_zona || []).forEach(function (z) { mapaZonas[normalizarZona(z.zona)] = z; });
    var etiquetas = zonas.map(function (z) { return 'Z' + z; });
    var datos = zonas.map(function (z) { return mapaZonas[z] ? (mapaZonas[z].total || 0) : 0; });
    var colores = zonas.map(function (z) { return (ESTADO.propsZona[z] && ESTADO.propsZona[z].color) || '#C8102E'; });

    var maximo = Math.max.apply(null, datos.concat([1]));
    if (N.graficoAlternativa) {
      N.graficoAlternativa.textContent = 'Resumen accesible: ' + zonas.map(function (z, i) {
        return 'Zona ' + z + ': ' + datos[i];
      }).join(' · ');
    }

    if (typeof Chart === 'undefined') {
      aviso('Chart.js no está disponible: se muestra solo el resumen accesible.');
      if (N.graficoZonas) { N.graficoZonas.classList.add('oculto'); }
      return;
    }
    if (N.graficoZonas) { N.graficoZonas.classList.remove('oculto'); }

    var datosGrafico = {
      labels: etiquetas,
      datasets: [{
        label: 'Reportes',
        data: datos,
        backgroundColor: colores,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 46
      }]
    };

    if (ESTADO.grafico) {
      ESTADO.grafico.data = datosGrafico;
      ESTADO.grafico.update();
      return;
    }

    var ctx = N.graficoZonas.getContext('2d');
    ESTADO.grafico = new Chart(ctx, {
      type: 'bar',
      data: datosGrafico,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return 'Zona ' + String(items[0].label).replace('Z', ''); },
              label: function (item) {
                var z = zonas[item.dataIndex];
                var info = mapaZonas[z] || {};
                return [
                  'Total: ' + item.parsed.y,
                  'Pendientes: ' + (info.pendiente || 0),
                  'En proceso: ' + (info.en_proceso || 0),
                  'Resueltos: ' + (info.resuelto || 0)
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#4B5563', font: { family: 'Inter', size: 11, weight: '600' } }
          },
          y: {
            beginAtZero: true,
            suggestedMax: maximo + 1,
            ticks: { precision: 0, color: '#6B7280', font: { family: 'Inter', size: 11 } },
            grid: { color: '#E5E7EB' }
          }
        }
      }
    });
  }

  function pintarRanking(s) {
    if (!N.rankingZonas) { return; }
    var ranking = (s.ranking || []).slice();
    if (!ranking.length) {
      N.rankingZonas.innerHTML = '<li class="ranking__vacio">Todavía no hay reportes para rankear.</li>';
      return;
    }
    ranking.sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    var top = ranking.slice(0, 10);
    var maximo = Math.max.apply(null, top.map(function (r) { return r.total || 0; }).concat([1]));
    N.rankingZonas.innerHTML = top.map(function (r, i) {
      var z = normalizarZona(r.zona);
      var p = ESTADO.propsZona[z] || {};
      var color = p.color || '#C8102E';
      var pct = Math.round(((r.total || 0) / maximo) * 100);
      return '<li class="ranking__item">' +
        '<div class="ranking__fila">' +
        '<span class="ranking__nombre"><span class="ranking__punto" style="background:' + esc(color) + '"></span>' +
        '<span>' + (i + 1) + '. ' + esc(p.nombre || ('Zona ' + z)) + '</span></span>' +
        '<span class="ranking__valor">' + (r.total || 0) + (r.total === 1 ? ' reporte' : ' reportes') + '</span>' +
        '</div>' +
        '<div class="ranking__barra" role="img" aria-label="' + (r.total || 0) + ' reportes en la zona ' + esc(z) + '">' +
        '<span style="width:' + pct + '%;background:' + esc(color) + '"></span>' +
        '</div></li>';
    }).join('');
  }

  /* ==========================================================================
   * 12. MODALES (accesibles: Escape, foco atrapado, aria-modal)
   * ======================================================================= */
  function focusables(contenedor) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return $$(sel, contenedor).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function abrirModal(el) {
    if (!el) { return; }
    ESTADO.origenFoco = document.activeElement;
    el.hidden = false;
    el.classList.remove('oculto');
    document.body.classList.add('modal-abierto');
    ESTADO.modalActivo = el;
    setTimeout(function () {
      var f = focusables(el);
      if (f.length) { f[0].focus(); }
    }, 60);
  }

  function cerrarModal(el) {
    var objetivo = el || ESTADO.modalActivo;
    if (!objetivo) { return; }
    objetivo.hidden = true;
    objetivo.classList.add('oculto');
    if (!$$('.modal-fondo:not(.oculto)').length) {
      document.body.classList.remove('modal-abierto');
    }
    ESTADO.modalActivo = null;
    var volver = ESTADO.origenFoco;
    ESTADO.origenFoco = null;
    if (volver && typeof volver.focus === 'function') {
      try { volver.focus(); } catch (e) { /* nodo eliminado */ }
    }
  }

  function manejarTecladoModal(ev) {
    if (!ESTADO.modalActivo) { return; }
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      if (ESTADO.modalActivo === N.modalReporte) { cerrarFormulario(); }
      else { cerrarModal(); }
      return;
    }
    if (ev.key === 'Tab') {
      var f = focusables(ESTADO.modalActivo);
      if (!f.length) { return; }
      var primero = f[0];
      var ultimo = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === primero) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault();
        primero.focus();
      }
    }
  }

  /* ---- Detalle de reporte ----------------------------------------------- */
  function abrirDetalle(id) {
    if (!N.modalDetalle || !N.detalleCuerpo) { return; }
    var local = ESTADO.indiceReportes[String(id)];
    N.detalleCuerpo.innerHTML = '<p>Cargando el detalle del reporte…</p>';
    abrirModal(N.modalDetalle);

    httpJSON(apiUrl('/api/reports/' + encodeURIComponent(id))).then(function (resp) {
      if (!resp.ok || !resp.datos || resp.datos.ok !== true || !resp.datos.reporte) {
        throw new Error(mensajeErrorDe(resp, 'No se pudo obtener el detalle del reporte.'));
      }
      var rep = normalizarFeatureReporte(resp.datos.reporte) || local;
      N.detalleCuerpo.innerHTML = htmlDetalleReporte(rep, resp.datos.historial, false);
    }).catch(function (err) {
      aviso('Detalle desde la API no disponible:', err.message);
      if (!local) {
        N.detalleCuerpo.innerHTML = '<p class="error-paso">' + esc(err.message) + '</p>';
        return;
      }
      N.detalleCuerpo.innerHTML = htmlDetalleReporte(local, null, true) +
        '<p class="campo__ayuda">No se pudo consultar el historial en el servidor (' + esc(err.message) + '). Se muestran los datos locales.</p>';
    });
  }

  function htmlDetalleReporte(f, historial, sinHistorial) {
    var p = f.properties;
    var cat = CATEGORIAS[p.categoria] || CATEGORIAS.otro;
    var est = ESTADOS[p.estado] || ESTADOS.pendiente;
    var zonaNombre = ESTADO.propsZona[p.zona] ? ESTADO.propsZona[p.zona].nombre : ('Zona ' + (p.zona || '—'));
    var html = '<div class="detalle-reporte">';
    if (p.foto_url) {
      html += '<img class="detalle-reporte__foto" src="' + esc(urlAbsoluta(p.foto_url)) + '" alt="Foto del reporte: ' + esc(cat.nombre) + '">';
    }
    html += '<div class="tarjeta-reporte__cabecera">' +
      '<span class="etiqueta-categoria">' + cat.emoji + ' ' + esc(cat.nombre) + '</span>' +
      '<span class="badge badge--' + esc(p.estado) + '">' + esc(est.nombre) + '</span></div>';
    html += '<p>' + esc(texto(p.descripcion, 'Sin descripción')) + '</p>';
    html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">N.º de reporte</span><span>#' + esc(p.id) + '</span></div>';
    html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">Zona</span><span>' + esc(zonaNombre) + '</span></div>';
    html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">Reportado</span><span>' + esc(fechaHora(p.creado_en)) + ' (' + esc(fechaRelativa(p.creado_en)) + ')</span></div>';
    html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">Última actualización</span><span>' + esc(fechaHora(p.actualizado_en)) + '</span></div>';
    if (p.direccion) { html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">Lugar</span><span>' + esc(p.direccion) + '</span></div>'; }
    html += '<div class="detalle-reporte__fila"><span class="detalle-reporte__clave">Apoyos vecinales</span><span>' + esc(p.confirmaciones) + '</span></div>';

    html += '<h3 class="detalle-zona__subtitulo">Historial de estados</h3>';
    if (sinHistorial) {
      html += '<p class="campo__ayuda">Historial no disponible sin conexión con la API.</p>';
    } else if (Array.isArray(historial) && historial.length) {
      html += '<ol class="historial">' + historial.map(function (h) {
        return '<li class="historial__item">' +
          '<span class="historial__estado">' + esc(texto(h.estado, '—')) + '</span>' +
          '<span class="historial__fecha">' + esc(fechaHora(h.changed_at)) + '</span>' +
          (h.nota ? '<p class="historial__nota">' + esc(h.nota) + '</p>' : '') +
          '</li>';
      }).join('') + '</ol>';
    } else {
      html += '<p class="campo__ayuda">Este reporte todavía no tiene cambios de estado registrados.</p>';
    }

    html += '<div class="tarjeta-reporte__acciones" style="margin-top:12px">' +
      '<button type="button" class="btn btn--suave btn--chico" data-ver-mapa="' + esc(p.id) + '">🗺️ Ver en el mapa</button>' +
      '<button type="button" class="btn btn--apoyo btn--chico" data-apoyar="' + esc(p.id) + '">👍 Apoyar <span class="apoyo__conteo">' + esc(p.confirmaciones) + '</span></button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  /* ---- Apoyo vecinal (POST /api/reports/:id/confirm) -------------------- */
  function apoyarReporte(id, boton) {
    var f = ESTADO.indiceReportes[String(id)];
    if (!f) { toast('No se encontró el reporte.', 'error'); return; }
    if (ESTADO.apoyados[String(id)]) {
      toast('Ya apoyaste este reporte. ¡Gracias!', 'info');
      return;
    }
    ESTADO.reporteApoyo = f;
    if (N.apoyoTexto) {
      N.apoyoTexto.innerHTML = 'Vas a apoyar el reporte <strong>#' + esc(f.properties.id) + '</strong> (' +
        esc((CATEGORIAS[f.properties.categoria] || CATEGORIAS.otro).nombre) + ' en la Zona ' + esc(f.properties.zona) +
        '). Actualmente tiene <strong>' + esc(f.properties.confirmaciones) + '</strong> apoyos.';
    }
    if (N.errorApoyo) { N.errorApoyo.classList.add('oculto'); N.errorApoyo.hidden = true; }
    abrirModal(N.modalApoyo);
    prepararTurnstileApoyo();
    if (boton) { boton.setAttribute('data-origen', '1'); }
  }

  function confirmarApoyo() {
    var f = ESTADO.reporteApoyo;
    if (!f) { return; }
    var id = String(f.properties.id);
    var token = obtenerTokenTurnstile(ESTADO.turnstileWidgetApoyo);

    /* Misma guarda que el formulario de reporte: si Turnstile esta cargado y el widget existe
     * pero todavia no ha entregado token (o ha caducado), se reinicia y se pide un segundo
     * intento en vez de enviar sin verificacion. Sin esto el envio salia con token vacio y el
     * servidor respondia 403, que el vecino veia como un error incomprensible.
     * Si Turnstile no esta cargado en absoluto (CDN bloqueada) se deja pasar y decide el
     * servidor: es la degradacion acordada, no un descuido. */
    if (ESTADO.turnstileListo && ESTADO.turnstileWidgetApoyo !== null && !token) {
      reiniciarTurnstile(ESTADO.turnstileWidgetApoyo);
      mostrarErrorApoyo('La verificación anti-bots aún no está lista. Espera un momento y vuelve a pulsar «Confirmar apoyo».');
      return;
    }

    var btn = N.btnConfirmarApoyo;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    if (N.errorApoyo) { N.errorApoyo.classList.add('oculto'); N.errorApoyo.hidden = true; }

    httpJSON(apiUrl('/api/reports/' + encodeURIComponent(id) + '/confirm'), {
      method: 'POST',
      body: { turnstileToken: token }
    }).then(function (resp) {
      if (resp.status === 409) {
        marcarApoyado(id, f.properties.confirmaciones);
        toast('Ya habías confirmado este reporte.', 'info');
        cerrarModal(N.modalApoyo);
        return;
      }
      if (!resp.ok || !resp.datos || resp.datos.ok !== true) {
        mostrarErrorApoyo(mensajeErrorDe(resp, 'No se pudo registrar tu apoyo.'));
        return;
      }
      var total = Number(resp.datos.confirmaciones);
      if (!isFinite(total)) { total = f.properties.confirmaciones + 1; }
      marcarApoyado(id, total);
      toast('¡Gracias! Tu apoyo quedó registrado (' + total + ' apoyos).', 'ok');
      cerrarModal(N.modalApoyo);
    }).catch(function (err) {
      if (ESTADO.modoDemo) {
        marcarApoyado(id, f.properties.confirmaciones + 1);
        toast('Apoyo registrado solo en tu dispositivo: la API no responde (datos de demostración).', 'info', 7000);
        cerrarModal(N.modalApoyo);
      } else {
        mostrarErrorApoyo(err.message);
      }
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar apoyo'; }
      reiniciarTurnstile(ESTADO.turnstileWidgetApoyo);
    });
  }

  function mostrarErrorApoyo(mensaje) {
    if (N.errorApoyo) {
      N.errorApoyo.textContent = mensaje;
      N.errorApoyo.classList.remove('oculto');
      N.errorApoyo.hidden = false;
    }
    toast(mensaje, 'error');
  }

  function marcarApoyado(id, total) {
    ESTADO.apoyados[String(id)] = true;
    var f = ESTADO.indiceReportes[String(id)];
    if (f) {
      f.properties.confirmaciones = total;
      if (ESTADO.marcadores[String(id)]) {
        ESTADO.marcadores[String(id)].setPopupContent(htmlPopupReporte(f));
      }
    }
    $$('[data-apoyar="' + id + '"] .apoyo__conteo').forEach(function (span) { span.textContent = total; });
    guardarApoyados();
  }

  function guardarApoyados() {
    try { localStorage.setItem('ojo-comas-apoyados', JSON.stringify(ESTADO.apoyados)); } catch (e) { /* modo privado */ }
  }
  function leerApoyados() {
    try {
      var crudo = localStorage.getItem('ojo-comas-apoyados');
      if (crudo) { ESTADO.apoyados = JSON.parse(crudo) || {}; }
    } catch (e) { ESTADO.apoyados = {}; }
  }

  /* ---- Turnstile --------------------------------------------------------- */
  function esperarTurnstile() {
    return new Promise(function (resolve) {
      if (window.turnstile && typeof window.turnstile.render === 'function') { return resolve(true); }
      var transcurrido = 0;
      var intervalo = setInterval(function () {
        transcurrido += 250;
        if (window.turnstile && typeof window.turnstile.render === 'function') {
          clearInterval(intervalo);
          resolve(true);
        } else if (transcurrido >= CONFIG.esperaTurnstileMs) {
          clearInterval(intervalo);
          resolve(false);
        }
      }, 250);
    });
  }

  function prepararTurnstile() {
    return esperarTurnstile().then(function (listo) {
      ESTADO.turnstileListo = listo;
      if (!listo) {
        aviso('Cloudflare Turnstile no está disponible (CDN bloqueado). Se enviará turnstileToken: "" y el backend decidirá.');
        if (N.turnstileNota) {
          N.turnstileNota.textContent = 'Verificación no disponible (no se pudo cargar el CDN de Cloudflare). El servidor decidirá si acepta el reporte.';
        }
        if (N.turnstileCaja) { N.turnstileCaja.classList.add('es-fallo'); }
        if (N.turnstileApoyoNota) {
          N.turnstileApoyoNota.textContent = 'Verificación no disponible (CDN bloqueado). Se enviará un token vacío.';
        }
      }
      return listo;
    });
  }

  function renderTurnstileReporte() {
    if (!ESTADO.turnstileListo || !window.turnstile || ESTADO.turnstileWidgetReporte !== null) { return; }
    try {
      ESTADO.turnstileWidgetReporte = window.turnstile.render('#turnstileWidget', {
        sitekey: CONFIG.turnstileSitekey,
        theme: 'light',
        language: 'es',
        callback: function () {
          if (N.turnstileNota) { N.turnstileNota.textContent = 'Verificación completada. Ya puedes enviar tu reporte.'; }
          if (N.turnstileCaja) { N.turnstileCaja.classList.add('es-listo'); }
        },
        'expired-callback': function () {
          if (N.turnstileNota) { N.turnstileNota.textContent = 'La verificación expiró. Vuelve a completarla para enviar.'; }
        },
        'error-callback': function () {
          if (N.turnstileNota) { N.turnstileNota.textContent = 'No se pudo completar la verificación anti-bots. Inténtalo otra vez.'; }
        }
      });
      if (N.turnstileNota) { N.turnstileNota.textContent = 'Completa la verificación anti-bots para poder enviar.'; }
      log('Turnstile renderizado (reporte), widgetId =', ESTADO.turnstileWidgetReporte);
    } catch (e) {
      aviso('No se pudo renderizar Turnstile:', e.message);
      ESTADO.turnstileWidgetReporte = null;
    }
  }

  function prepararTurnstileApoyo() {
    if (!ESTADO.turnstileListo || !window.turnstile || ESTADO.turnstileWidgetApoyo !== null) { return; }
    try {
      ESTADO.turnstileWidgetApoyo = window.turnstile.render('#turnstileApoyoWidget', {
        sitekey: CONFIG.turnstileSitekey,
        theme: 'light',
        language: 'es',
        callback: function () {
          if (N.turnstileApoyoNota) { N.turnstileApoyoNota.textContent = 'Verificación completada. Ya puedes confirmar tu apoyo.'; }
        },
        'expired-callback': function () {
          if (N.turnstileApoyoNota) { N.turnstileApoyoNota.textContent = 'La verificación expiró. Vuelve a completarla.'; }
        }
      });
      if (N.turnstileApoyoNota) { N.turnstileApoyoNota.textContent = 'Completa la verificación anti-bots para confirmar tu apoyo.'; }
    } catch (e) {
      aviso('No se pudo renderizar Turnstile (apoyo):', e.message);
      ESTADO.turnstileWidgetApoyo = null;
    }
  }

  function obtenerTokenTurnstile(widgetId) {
    if (!window.turnstile || widgetId === null || widgetId === undefined) { return ''; }
    try {
      var token = window.turnstile.getResponse(widgetId);
      return token || '';
    } catch (e) {
      aviso('No se pudo leer el token de Turnstile:', e.message);
      return '';
    }
  }

  /* Los tokens de Turnstile son de UN SOLO USO: hay que reiniciar el widget
     después de cada intento de envío. */
  function reiniciarTurnstile(widgetId) {
    if (!window.turnstile || widgetId === null || widgetId === undefined) { return; }
    try {
      window.turnstile.reset(widgetId);
      log('Turnstile reiniciado (widgetId =', widgetId + ')');
    } catch (e) {
      aviso('No se pudo reiniciar Turnstile:', e.message);
    }
  }

  /* ==========================================================================
   * 13. FORMULARIO DE REPORTE (3 pasos)
   * ======================================================================= */
  function abrirFormulario(coords) {
    if (!N.modalReporte) { return; }
    if (coords && isFinite(coords.lat) && isFinite(coords.lng)) {
      marcarPuntoPendiente(coords.lat, coords.lng, true);
    }
    irAPaso(1, true);
    if (N.exitoReporte) { N.exitoReporte.classList.add('oculto'); N.exitoReporte.hidden = true; }
    if (N.formReporte) { N.formReporte.classList.remove('oculto'); N.formReporte.hidden = false; }
    if (N.progresoReporte) { N.progresoReporte.classList.remove('oculto'); }
    if (N.btnEnviar) { N.btnEnviar.disabled = false; N.btnEnviar.textContent = 'Enviar Reporte'; }
    limpiarErrores();
    actualizarCoordsFormulario();
    actualizarDeteccionZonaPorPunto();
    actualizarContadorDescripcion();
    abrirModal(N.modalReporte);
    if (!ESTADO.pendienteUbicacion) {
      toast('Marca el punto en el mapa (o pulsa "Usar mi ubicación actual") para poder continuar.', 'info', 6000);
    }
  }

  function cerrarFormulario() {
    if (ESTADO.temporizadorExito) { clearTimeout(ESTADO.temporizadorExito); ESTADO.temporizadorExito = null; }
    cerrarModal(N.modalReporte);
  }

  function limpiarErrores() {
    [N.errorPaso1, N.errorPaso2, N.errorEnvio].forEach(function (el) {
      if (el) { el.textContent = ''; el.classList.add('oculto'); el.hidden = true; }
    });
  }

  function mostrarErrorPaso(el, mensaje) {
    if (!el) { toast(mensaje, 'error'); return; }
    el.textContent = mensaje;
    el.classList.remove('oculto');
    el.hidden = false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* opcional */ }
  }

  function irAPaso(paso, silencioso) {
    paso = Math.max(1, Math.min(3, Number(paso) || 1));
    if (!silencioso) {
      if (paso > ESTADO.paso && !validarPaso(ESTADO.paso)) { return; }
      if (paso === 3) { renderResumen(); }
    }
    ESTADO.paso = paso;
    $$('.paso', N.formReporte).forEach(function (seccion) {
      var esActual = Number(seccion.getAttribute('data-paso')) === paso;
      seccion.classList.toggle('oculto', !esActual);
      seccion.hidden = !esActual;
    });
    if (N.pasoActual) { N.pasoActual.textContent = String(paso); }
    $$('.progreso__item', N.progresoReporte).forEach(function (item) {
      var n = Number(item.getAttribute('data-indicador'));
      item.classList.toggle('es-activo', n === paso);
      item.classList.toggle('es-hecho', n < paso);
    });
    if (paso === 3) { renderTurnstileReporte(); }
    limpiarErrores();
    var contenedor = $('.modal__cuerpo', N.modalReporte);
    if (contenedor) { contenedor.scrollTop = 0; }
    var foco = $('.paso[data-paso="' + paso + '"] .paso__titulo', N.formReporte);
    if (foco) { foco.setAttribute('tabindex', '-1'); try { foco.focus(); } catch (e) { /* opcional */ } }
  }

  function validarPaso(paso) {
    if (paso === 1) {
      var cat = $('input[name="categoria"]:checked', N.formReporte);
      if (!cat) {
        mostrarErrorPaso(N.errorPaso1, 'Elige una categoría para continuar.');
        return false;
      }
      if (!ESTADO.pendienteUbicacion) {
        mostrarErrorPaso(N.errorPaso1, 'Marca el punto en el mapa (o usa "Usar mi ubicación actual") antes de continuar.');
        return false;
      }
      return true;
    }
    if (paso === 2) {
      var zona = N.selectZona ? N.selectZona.value : '';
      if (!zona) {
        mostrarErrorPaso(N.errorPaso2, 'Selecciona la zona del distrito donde ocurre el problema.');
        return false;
      }
      var desc = N.descripcion ? N.descripcion.value.trim() : '';
      if (desc.length < 5) {
        mostrarErrorPaso(N.errorPaso2, 'Escribe una descripción breve (mínimo 5 caracteres) para que los vecinos entiendan el problema.');
        return false;
      }
      if (desc.length > 140) {
        mostrarErrorPaso(N.errorPaso2, 'La descripción no puede superar los 140 caracteres.');
        return false;
      }
      return true;
    }
    return true;
  }

  function actualizarContadorDescripcion() {
    if (!N.descripcion || !N.contadorNumero) { return; }
    var largo = N.descripcion.value.length;
    N.contadorNumero.textContent = String(largo);
    if (N.contadorDescripcion) {
      N.contadorDescripcion.classList.toggle('es-limite', largo >= 130);
    }
  }

  function actualizarDeteccionZonaPorPunto() {
    if (!N.deteccionZona) { return; }
    var u = ESTADO.pendienteUbicacion;
    if (!u) {
      N.deteccionZona.className = 'deteccion';
      N.deteccionZona.textContent = 'Marca el punto en el mapa para detectar tu zona automáticamente.';
      return;
    }
    var zona = detectarZona(u.lat, u.lng);
    if (zona) {
      if (N.selectZona) { N.selectZona.value = zona; }
      actualizarDeteccionZona(zona, true);
    } else {
      N.deteccionZona.className = 'deteccion es-aviso';
      N.deteccionZona.textContent = 'No se pudo detectar la zona automáticamente. Elígela a mano en la lista.';
    }
  }

  function actualizarDeteccionZona(zona, automatica) {
    if (!N.deteccionZona) { return; }
    var p = ESTADO.propsZona[zona];
    var nombre = p ? p.nombre : 'Zona ' + zona;
    N.deteccionZona.className = 'deteccion es-ok';
    N.deteccionZona.textContent = automatica
      ? 'Zona detectada automáticamente: ' + nombre + '. Puedes corregirla a mano si no es exacta.'
      : 'Zona seleccionada: ' + nombre + '.';
  }

  function renderResumen() {
    if (!N.resumenReporte) { return; }
    var cat = $('input[name="categoria"]:checked', N.formReporte);
    var categoria = cat ? cat.value : '';
    var catInfo = CATEGORIAS[categoria] || CATEGORIAS.otro;
    var zona = N.selectZona ? N.selectZona.value : '';
    var zonaInfo = ESTADO.propsZona[zona];
    var u = ESTADO.pendienteUbicacion || {};
    var desc = N.descripcion ? N.descripcion.value.trim() : '';
    var ref = N.referencia ? N.referencia.value.trim() : '';

    var html = '';
    html += '<div class="resumen__fila"><span class="resumen__clave">Categoría</span><span class="resumen__valor">' + catInfo.emoji + ' ' + esc(catInfo.nombre) + '</span></div>';
    html += '<div class="resumen__fila"><span class="resumen__clave">Zona</span><span class="resumen__valor">' + esc(zonaInfo ? zonaInfo.nombre : ('Zona ' + (zona || '—'))) + '</span></div>';
    html += '<div class="resumen__fila"><span class="resumen__clave">Coordenadas</span><span class="resumen__valor">' +
      (u.lat !== undefined ? esc(u.lat.toFixed(6)) + ', ' + esc(u.lng.toFixed(6)) : 'Sin marcar') + '</span></div>';
    html += '<div class="resumen__fila"><span class="resumen__clave">Descripción</span><span class="resumen__valor">' + esc(texto(desc, 'Sin descripción')) + '</span></div>';
    if (ref) {
      html += '<div class="resumen__fila"><span class="resumen__clave">Referencia</span><span class="resumen__valor">' + esc(ref) + '</span></div>';
    }
    html += '<div class="resumen__fila"><span class="resumen__clave">Foto</span><span class="resumen__valor">' +
      (ESTADO.foto.dataUrl ? 'Sí · ' + esc(formatoPeso(ESTADO.foto.bytes)) : 'Sin foto') + '</span></div>';
    if (ESTADO.foto.dataUrl) {
      html += '<img class="resumen__foto" src="' + esc(ESTADO.foto.dataUrl) + '" alt="Vista previa de la foto que se enviará">';
    }
    html += '<p class="campo__ayuda" style="margin-top:8px">Se enviará de forma anónima. ' +
      (ESTADO.modoDemo ? 'Modo demostración: la API no responde, el envío podría fallar.' : '') + '</p>';
    N.resumenReporte.innerHTML = html;
  }

  /* ---- Foto: cámara / galería + redimensión y compresión ---------------- */
  function manejarArchivoFoto(archivo) {
    if (!archivo) { return; }
    if (!/^image\//i.test(archivo.type || '')) {
      if (N.fotoEstado) { N.fotoEstado.textContent = 'El archivo debe ser una imagen (JPG, PNG, WEBP…).'; }
      toast('Solo se aceptan imágenes.', 'error');
      return;
    }
    if (N.fotoEstado) { N.fotoEstado.textContent = 'Procesando la imagen en tu dispositivo…'; }
    var lector = new FileReader();
    lector.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var resultado = comprimirImagen(img, CONFIG.maxLadoFoto, CONFIG.calidadJpeg);
          var bytes = bytesDeDataUrl(resultado.dataUrl);
          if (bytes > CONFIG.pesoFotoMaximo) {
            var segundo = comprimirImagen(img, 1024, 0.6);
            if (bytesDeDataUrl(segundo.dataUrl) < bytes) { resultado = segundo; bytes = bytesDeDataUrl(resultado.dataUrl); }
          }
          ESTADO.foto = {
            dataUrl: resultado.dataUrl,
            bytes: bytes,
            originalBytes: archivo.size || 0,
            ancho: resultado.ancho,
            alto: resultado.alto
          };
          mostrarPreviewFoto();
        } catch (e) {
          aviso('No se pudo procesar la imagen:', e.message);
          toast('No se pudo procesar la imagen. Prueba con otra foto.', 'error');
          if (N.fotoEstado) { N.fotoEstado.textContent = ''; }
        }
      };
      img.onerror = function () {
        toast('No se pudo leer la imagen seleccionada.', 'error');
        if (N.fotoEstado) { N.fotoEstado.textContent = ''; }
      };
      img.src = lector.result;
    };
    lector.onerror = function () {
      toast('No se pudo leer el archivo seleccionado.', 'error');
      if (N.fotoEstado) { N.fotoEstado.textContent = ''; }
    };
    lector.readAsDataURL(archivo);
  }

  function comprimirImagen(img, maxLado, calidad) {
    var ancho = img.naturalWidth || img.width;
    var alto = img.naturalHeight || img.height;
    var escala = Math.min(1, maxLado / Math.max(ancho, alto));
    var nuevoAncho = Math.max(1, Math.round(ancho * escala));
    var nuevoAlto = Math.max(1, Math.round(alto * escala));
    var lienzo = document.createElement('canvas');
    lienzo.width = nuevoAncho;
    lienzo.height = nuevoAlto;
    var ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, nuevoAncho, nuevoAlto);
    ctx.drawImage(img, 0, 0, nuevoAncho, nuevoAlto);
    return {
      dataUrl: lienzo.toDataURL('image/jpeg', calidad),
      ancho: nuevoAncho,
      alto: nuevoAlto
    };
  }

  function mostrarPreviewFoto() {
    if (!N.fotoPreview || !N.fotoPreviewImg) { return; }
    N.fotoPreviewImg.src = ESTADO.foto.dataUrl;
    N.fotoPreview.classList.remove('oculto');
    N.fotoPreview.hidden = false;
    if (N.fotoPeso) {
      N.fotoPeso.innerHTML = 'Peso final: <strong>' + esc(formatoPeso(ESTADO.foto.bytes)) + '</strong>' +
        ' · ' + ESTADO.foto.ancho + '×' + ESTADO.foto.alto + ' px' +
        (ESTADO.foto.originalBytes ? ' · original: ' + esc(formatoPeso(ESTADO.foto.originalBytes)) : '');
    }
    if (N.fotoEstado) {
      N.fotoEstado.textContent = ESTADO.foto.bytes > CONFIG.pesoFotoObjetivo
        ? 'La imagen sigue siendo pesada; considera tomar una foto con menos detalle.'
        : 'Imagen lista para enviar (comprimida en tu dispositivo).';
    }
    var pesoAprox = 'aprox. ' + Math.ceil((ESTADO.foto.dataUrl.length * 4) / 3 / 1024) + ' KB en el envío';
    log('Foto lista:', pesoAprox);
  }

  function quitarFoto() {
    ESTADO.foto = { dataUrl: null, bytes: 0, originalBytes: 0, ancho: 0, alto: 0 };
    if (N.fotoPreview) { N.fotoPreview.classList.add('oculto'); N.fotoPreview.hidden = true; }
    if (N.fotoPreviewImg) { N.fotoPreviewImg.removeAttribute('src'); }
    if (N.inputFotoCamara) { N.inputFotoCamara.value = ''; }
    if (N.inputFotoGaleria) { N.inputFotoGaleria.value = ''; }
    if (N.fotoEstado) { N.fotoEstado.textContent = ''; }
    toast('Foto quitada del reporte.', 'info', 3000);
  }

  /* ---- Envío ------------------------------------------------------------- */
  function enviarReporte(ev) {
    if (ev && ev.preventDefault) { ev.preventDefault(); }
    if (!validarPaso(1) || !validarPaso(2)) {
      irAPaso(1);
      return;
    }
    var cat = $('input[name="categoria"]:checked', N.formReporte);
    var categoria = cat ? cat.value : '';
    var u = ESTADO.pendienteUbicacion || {};
    var zona = N.selectZona ? N.selectZona.value : '';
    var descripcion = N.descripcion ? N.descripcion.value.trim() : '';
    var referencia = N.referencia ? N.referencia.value.trim() : '';
    var consentimiento = !!(N.checkConsentimiento && N.checkConsentimiento.checked);
    var contacto = consentimiento && N.contacto ? N.contacto.value.trim() : '';

    var token = obtenerTokenTurnstile(ESTADO.turnstileWidgetReporte);
    if (ESTADO.turnstileListo && ESTADO.turnstileWidgetReporte !== null && !token) {
      // El widget existe pero todavía no entregó token (o expiró): se reinicia y se
      // pide un segundo intento en lugar de enviar sin verificación.
      reiniciarTurnstile(ESTADO.turnstileWidgetReporte);
      mostrarErrorPaso(N.errorEnvio, 'La verificación anti-bots aún no está lista. Espera un momento y vuelve a pulsar «Enviar Reporte».');
      return;
    }

    var payload = {
      categoria: categoria,
      descripcion: descripcion,
      lat: Number(u.lat.toFixed(6)),
      lng: Number(u.lng.toFixed(6)),
      zona: zona,
      direccion: referencia || null,
      fotoBase64: ESTADO.foto.dataUrl || null,
      turnstileToken: token,
      contacto: consentimiento ? (contacto || null) : null,
      consentimiento: !!consentimiento
    };

    if (N.btnEnviar) { N.btnEnviar.disabled = true; N.btnEnviar.textContent = 'Enviando reporte…'; }
    limpiarErrores();

    httpJSON(apiUrl('/api/report'), { method: 'POST', body: payload, timeout: 25000 }).then(function (resp) {
      if (!resp.ok || !resp.datos || resp.datos.ok !== true) {
        var mensaje = mensajeErrorDe(resp, 'No se pudo registrar el reporte.');
        mostrarErrorPaso(N.errorEnvio, mensaje);
        toast(mensaje, 'error');
        return;
      }
      var datos = resp.datos;
      var mensaje = texto(datos.mensaje, 'Tu reporte quedó registrado.');
      mostrarExitoReporte(datos.id, datos.zona || zona, datos.estado || 'pendiente', mensaje);
      if (N.btnEnviar) { N.btnEnviar.textContent = 'Enviar Reporte'; }
      ESTADO.limiteFeed = CONFIG.limiteFeedInicial;
      return refrescar().then(function () {
        if (datos.id !== undefined && datos.id !== null) {
          ESTADO.ultimoReporteId = datos.id;
          var f = ESTADO.indiceReportes[String(datos.id)];
          if (f) { ESTADO.pendienteUbicacion = { lat: f._lat, lng: f._lng }; }
        }
      });
    }).catch(function (err) {
      var mensaje = err && err.message ? err.message : 'No se pudo enviar el reporte.';
      if (ESTADO.modoDemo) {
        mensaje += ' (Estás en modo demostración: la API no responde.)';
      }
      mostrarErrorPaso(N.errorEnvio, mensaje);
      toast(mensaje, 'error');
      if (N.btnEnviar) { N.btnEnviar.textContent = 'Enviar Reporte'; }
    }).then(function () {
      if (N.btnEnviar && N.exitoReporte && N.exitoReporte.classList.contains('oculto')) {
        N.btnEnviar.disabled = false;
        N.btnEnviar.textContent = 'Enviar Reporte';
      }
      reiniciarTurnstile(ESTADO.turnstileWidgetReporte);
      if (!ESTADO.turnstileListo && typeof window.turnstile === 'undefined') {
        aviso('Turnstile no disponible: se envió turnstileToken vacío y el backend decidirá.');
      }
    });
  }

  function mostrarExitoReporte(id, zona, estado, mensaje) {
    if (!N.exitoReporte) { return; }
    if (N.formReporte) { N.formReporte.classList.add('oculto'); N.formReporte.hidden = true; }
    if (N.progresoReporte) { N.progresoReporte.classList.add('oculto'); }
    N.exitoReporte.classList.remove('oculto');
    N.exitoReporte.hidden = false;
    if (N.exitoTexto) {
      N.exitoTexto.innerHTML = esc(mensaje) + '<br><strong>N.º de reporte: #' + esc(id !== undefined && id !== null ? id : '—') +
        '</strong> · Zona ' + esc(zona || '—') + ' · ' + esc(texto((ESTADOS[normalizarEstado(estado)] || {}).nombre, 'Pendiente')) +
        '<br><span class="campo__ayuda">Se actualizó el mapa y el feed con tu reporte.</span>';
    }
    lanzarConfeti();
    if (ESTADO.temporizadorExito) { clearTimeout(ESTADO.temporizadorExito); }
    ESTADO.temporizadorExito = setTimeout(function () {
      cerrarFormulario();
      limpiarPuntoPendiente();
      limpiarFormularioCompleto();
    }, 4000);
  }

  function limpiarFormularioCompleto() {
    if (N.formReporte) { N.formReporte.reset(); }
    $$('input[name="categoria"]', N.formReporte).forEach(function (r) { r.checked = false; });
    if (N.selectZona) { N.selectZona.value = ''; }
    if (N.contacto) { N.contacto.value = ''; N.contacto.disabled = true; }
    if (N.checkConsentimiento) { N.checkConsentimiento.checked = false; }
    if (N.referencia) { N.referencia.value = ''; }
    quitarFotoSilencioso();
    irAPaso(1, true);
    if (N.deteccionZona) {
      N.deteccionZona.className = 'deteccion';
      N.deteccionZona.textContent = 'Marca el punto en el mapa para detectar tu zona automáticamente.';
    }
    actualizarCoordsFormulario();
  }

  function quitarFotoSilencioso() {
    ESTADO.foto = { dataUrl: null, bytes: 0, originalBytes: 0, ancho: 0, alto: 0 };
    if (N.fotoPreview) { N.fotoPreview.classList.add('oculto'); N.fotoPreview.hidden = true; }
    if (N.fotoPreviewImg) { N.fotoPreviewImg.removeAttribute('src'); }
    if (N.inputFotoCamara) { N.inputFotoCamara.value = ''; }
    if (N.inputFotoGaleria) { N.inputFotoGaleria.value = ''; }
    if (N.fotoEstado) { N.fotoEstado.textContent = ''; }
  }

  function lanzarConfeti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    if (typeof confetti !== 'function') {
      aviso('canvas-confetti no está disponible; se omite la animación.');
      return;
    }
    try {
      confetti({
        particleCount: 120,
        spread: 78,
        startVelocity: 45,
        origin: { y: 0.62 },
        colors: ['#C8102E', '#1F9D55', '#E8A33D', '#1D4E89', '#FFFFFF']
      });
      setTimeout(function () {
        confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
        confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
      }, 280);
    } catch (e) {
      aviso('No se pudo lanzar el confeti:', e.message);
    }
  }

  /* ==========================================================================
   * 14. REFRESCO GENERAL
   * ======================================================================= */
  function refrescar() {
    return cargarReportes()
      .then(function () {
        dibujarZonas();
        dibujarReportes();
        aplicarFiltros();
        return cargarStats();
      })
      .then(function () {
        if (ESTADO.mapa && N.mapa) { ESTADO.mapa.invalidateSize(); }
      })
      .catch(function (err) {
        aviso('Error al refrescar:', err.message);
        toast('No se pudo refrescar la información. Se mantienen los datos actuales.', 'error');
      });
  }

  /* ==========================================================================
   * 15. EVENTOS
   * ======================================================================= */
  function manejarClicDelegado(ev) {
    var objetivo = ev.target;
    if (!objetivo || !objetivo.closest) { return; }

    var btnModal = objetivo.closest('[data-abrir-modal]');
    if (btnModal) {
      var idModal = btnModal.getAttribute('data-abrir-modal');
      var modal = document.getElementById(idModal);
      if (modal) { abrirModal(modal); }
      return;
    }

    var btnCerrar = objetivo.closest('[data-cerrar-modal]');
    if (btnCerrar) {
      if (btnCerrar.closest('#modalReporte')) { cerrarFormulario(); } else { cerrarModal(btnCerrar.closest('.modal-fondo')); }
      return;
    }

    var fondo = objetivo.classList && objetivo.classList.contains('modal-fondo') ? objetivo : null;
    if (fondo) { cerrarModal(fondo); return; }

    var chip = objetivo.closest('.chip[data-zona]');
    if (chip) {
      seleccionarZona(chip.getAttribute('data-zona'));
      return;
    }

    var btnZonaDetalle = objetivo.closest('.detalle-zona [data-zona]');
    if (btnZonaDetalle) {
      seleccionarZona(btnZonaDetalle.getAttribute('data-zona'));
      return;
    }

    var zonaEnPopup = objetivo.closest('.leaflet-popup [data-zona]');
    if (zonaEnPopup) {
      seleccionarZona(zonaEnPopup.getAttribute('data-zona'));
      if (ESTADO.mapa) { ESTADO.mapa.closePopup(); }
      return;
    }

    var pill = objetivo.closest('.pill-estado[data-estado]');
    if (pill) {
      alternarEstado(pill.getAttribute('data-estado'));
      return;
    }

    var irPaso = objetivo.closest('[data-ir-paso]');
    if (irPaso) {
      irAPaso(Number(irPaso.getAttribute('data-ir-paso')));
      return;
    }

    var verMapa = objetivo.closest('[data-ver-mapa]');
    if (verMapa) {
      cerrarModal(verMapa.closest('.modal-fondo'));
      verEnMapa(verMapa.getAttribute('data-ver-mapa'));
      return;
    }

    var detalle = objetivo.closest('[data-detalle]');
    if (detalle) {
      if (ESTADO.mapa) { ESTADO.mapa.closePopup(); }
      abrirDetalle(detalle.getAttribute('data-detalle'));
      return;
    }

    var apoyar = objetivo.closest('[data-apoyar]');
    if (apoyar) {
      ev.preventDefault();
      apoyarReporte(apoyar.getAttribute('data-apoyar'), apoyar);
      return;
    }
  }

  function enlazarEventos() {
    document.addEventListener('click', manejarClicDelegado);
    document.addEventListener('keydown', manejarTecladoModal);

    if (N.btnReportarAqui) {
      N.btnReportarAqui.addEventListener('click', function () {
        if (ESTADO.pendienteUbicacion) {
          abrirFormulario(ESTADO.pendienteUbicacion);
        } else {
          abrirFormulario(null);
          toast('Toca el mapa para marcar el punto exacto.', 'info');
        }
      });
    }

    if (N.btnHeroReportar) {
      N.btnHeroReportar.addEventListener('click', function () {
        abrirFormulario(ESTADO.pendienteUbicacion);
      });
    }

    /* Boton "Confirmar apoyo" del modal de apoyo vecinal.
     *
     * Esta linea FALTABA: `confirmarApoyo()` estaba definida pero no se llamaba desde ningun
     * sitio, asi que pulsar el boton no hacia absolutamente nada. El modal se abre desde el
     * manejador delegado ([data-apoyar]), pero el clic en el boton de confirmacion no estaba
     * cubierto ni por ese manejador ni por ningun listener.
     * tools/verificar_frontend.mjs comprueba ahora que el clic dispara la peticion. */
    if (N.btnConfirmarApoyo) {
      N.btnConfirmarApoyo.addEventListener('click', confirmarApoyo);
    }

    if (N.btnQuitarPunto) {
      N.btnQuitarPunto.addEventListener('click', function () {
        limpiarPuntoPendiente();
        if (ESTADO.mapa) { ESTADO.mapa.closePopup(); }
        toast('Marcador quitado del mapa.', 'info', 3000);
      });
    }

    if (N.btnRefrescarFeed) {
      N.btnRefrescarFeed.addEventListener('click', function () {
        toast('Actualizando reportes…', 'info', 2500);
        refrescar().then(function () {
          if (!ESTADO.modoDemo) { toast('Reportes actualizados.', 'ok', 3000); }
        });
      });
    }

    if (N.btnCargarMas) {
      N.btnCargarMas.addEventListener('click', function () {
        ESTADO.limiteFeed += CONFIG.pasoPagina;
        renderFeed();
      });
    }

    if (N.descripcion) {
      N.descripcion.addEventListener('input', actualizarContadorDescripcion);
    }

    if (N.selectZona) {
      N.selectZona.addEventListener('change', function () {
        if (N.selectZona.value) { actualizarDeteccionZona(N.selectZona.value, false); }
      });
    }

    if (N.btnTomarFoto) {
      N.btnTomarFoto.addEventListener('click', function () { if (N.inputFotoCamara) { N.inputFotoCamara.click(); } });
    }
    if (N.btnElegirFoto) {
      N.btnElegirFoto.addEventListener('click', function () { if (N.inputFotoGaleria) { N.inputFotoGaleria.click(); } });
    }
    if (N.inputFotoCamara) {
      N.inputFotoCamara.addEventListener('change', function (ev) {
        var archivo = ev.target.files && ev.target.files[0];
        manejarArchivoFoto(archivo);
      });
    }
    if (N.inputFotoGaleria) {
      N.inputFotoGaleria.addEventListener('change', function (ev) {
        var archivo = ev.target.files && ev.target.files[0];
        manejarArchivoFoto(archivo);
      });
    }
    if (N.btnQuitarFoto) {
      N.btnQuitarFoto.addEventListener('click', quitarFoto);
    }

    if (N.btnUsarMiUbicacion) {
      N.btnUsarMiUbicacion.addEventListener('click', function () {
        pedirUbicacion(function (ok, coords) {
          if (ok && coords) {
            actualizarCoordsFormulario();
            actualizarDeteccionZonaPorPunto();
          }
        });
      });
    }

    if (N.btnElegirEnMapa) {
      N.btnElegirEnMapa.addEventListener('click', function () {
        if (!ESTADO.mapa) {
          toast('El mapa no está disponible en este momento.', 'error');
          return;
        }
        cerrarFormulario();
        if (N.seccionMapa) { N.seccionMapa.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        toast('Toca el mapa en el lugar del problema y pulsa “➕ Reportar aquí”.', 'info', 6000);
      });
    }

    if (N.checkConsentimiento) {
      N.checkConsentimiento.addEventListener('change', function () {
        var marcado = N.checkConsentimiento.checked;
        if (N.contacto) {
          N.contacto.disabled = !marcado;
          if (!marcado) { N.contacto.value = ''; }
          if (marcado) { try { N.contacto.focus(); } catch (e) { /* opcional */ } }
        }
      });
    }

    if (N.formReporte) {
      N.formReporte.addEventListener('submit', enviarReporte);
    }

    if (N.btnCerrarExito) {
      N.btnCerrarExito.addEventListener('click', function () {
        var id = ESTADO.ultimoReporteId;
        if (ESTADO.temporizadorExito) { clearTimeout(ESTADO.temporizadorExito); ESTADO.temporizadorExito = null; }
        cerrarFormulario();
        limpiarFormularioCompleto();
        limpiarPuntoPendiente();
        if (id !== undefined && id !== null) { verEnMapa(id); }
      });
    }

    if (N.formReporte) {
      $$('input[name="categoria"]', N.formReporte).forEach(function (radio) {
        radio.addEventListener('change', function () {
          if (N.errorPaso1) { N.errorPaso1.classList.add('oculto'); N.errorPaso1.hidden = true; }
        });
      });
    }

    window.addEventListener('online', function () {
      toast('Conexión restablecida. Actualizando datos…', 'info');
      refrescar();
    });
    window.addEventListener('offline', function () {
      toast('Sin conexión: se muestran los datos disponibles.', 'info');
    });
  }

  function cachearNodos() {
    N.bannerLegal = $('#bannerLegal');
    N.avisoDemo = $('#avisoDemo');
    N.avisoEntorno = $('#avisoEntorno');
    N.chipsZonas = $('#chipsZonas');
    N.detalleZona = $('#detalleZona');
    N.mapa = $('#map');
    N.mapaSinLeaflet = $('#mapaSinLeaflet');
    N.btnReportarAqui = $('#btnReportarAqui');
    N.btnQuitarPunto = $('#btnQuitarPunto');
    N.coordsFlotante = $('#coordsFlotante');
    N.filtrosEstado = $('#filtrosEstado');
    N.seccionMapa = $('#seccionMapa');
    N.notaMapa = $('#ayudaMapa');
    N.feed = $('#feed');
    N.feedResumen = $('#feedResumen');
    N.btnCargarMas = $('#btnCargarMas');
    N.btnRefrescarFeed = $('#btnRefrescarFeed');
    N.contTotal = $('#contTotal');
    N.contPendiente = $('#contPendiente');
    N.contProceso = $('#contProceso');
    N.contResuelto = $('#contResuelto');
    N.graficoZonas = $('#graficoZonas');
    N.graficoAlternativa = $('#graficoAlternativa');
    N.rankingZonas = $('#rankingZonas');
    N.statsActualizado = $('#statsActualizado');
    N.toasts = $('#toasts');
    N.modalReporte = $('#modalReporte');
    N.formReporte = $('#formReporte');
    N.progresoReporte = $('#progresoReporte');
    N.pasoActual = $('#pasoActual');
    N.selectZona = $('#selectZona');
    N.deteccionZona = $('#deteccionZona');
    N.descripcion = $('#descripcion');
    N.contadorDescripcion = $('#contadorDescripcion');
    N.contadorNumero = $('#contadorNumero');
    N.referencia = $('#referencia');
    N.inputFotoCamara = $('#inputFotoCamara');
    N.inputFotoGaleria = $('#inputFotoGaleria');
    N.btnTomarFoto = $('#btnTomarFoto');
    N.btnElegirFoto = $('#btnElegirFoto');
    N.fotoPreview = $('#fotoPreview');
    N.fotoPreviewImg = $('#fotoPreviewImg');
    N.fotoPeso = $('#fotoPeso');
    N.fotoEstado = $('#fotoEstado');
    N.btnQuitarFoto = $('#btnQuitarFoto');
    N.coordsSeleccion = $('#coordsSeleccion');
    N.btnUsarMiUbicacion = $('#btnUsarMiUbicacion');
    N.btnElegirEnMapa = $('#btnElegirEnMapa');
    N.resumenReporte = $('#resumenReporte');
    N.checkConsentimiento = $('#checkConsentimiento');
    N.contacto = $('#contacto');
    N.turnstileCaja = $('#turnstileCaja');
    N.turnstileNota = $('#turnstileNota');
    N.btnEnviar = $('#btnEnviar');
    N.errorPaso1 = $('#errorPaso1');
    N.errorPaso2 = $('#errorPaso2');
    N.errorEnvio = $('#errorEnvio');
    N.exitoReporte = $('#exitoReporte');
    N.exitoTexto = $('#exitoTexto');
    N.btnCerrarExito = $('#btnCerrarExito');
    N.modalDetalle = $('#modalDetalle');
    N.detalleCuerpo = $('#detalleCuerpo');
    N.modalApoyo = $('#modalApoyo');
    N.apoyoTexto = $('#apoyoTexto');
    N.turnstileApoyoNota = $('#turnstileApoyoNota');
    N.errorApoyo = $('#errorApoyo');
    N.btnConfirmarApoyo = $('#btnConfirmarApoyo');
    N.btnHeroReportar = $('#btnHeroReportar');
  }

  /* ==========================================================================
   * 16. ARRANQUE
   * ======================================================================= */
  function iniciar() {
    if (ESTADO.iniciado) { return; }
    ESTADO.iniciado = true;
    cachearNodos();
    enlazarEventos();
    leerApoyados();
    sincronizarPills();

    cargarDatosBase()
      .then(function () {
        construirChips();
        construirSelectZonas();
        pintarDetalleZona();
      })
      .then(function () {
        iniciarMapa();
        dibujarZonas();
        dibujarDistrito();
      })
      .then(function () { return cargarReportes(); })
      .then(function () {
        dibujarReportes();
        aplicarFiltros();
      })
      .then(function () { return cargarStats(); })
      .then(function () { return prepararTurnstile(); })
      .then(function () {
        // Diagnóstico silencioso del Worker (no bloquea la interfaz).
        return httpJSON(apiUrl('/api/health'), { timeout: 5000 }).then(function (resp) {
          if (resp.ok && resp.datos && resp.datos.ok) {
            log('API disponible:', resp.datos.servicio, resp.datos.version);
          }
        }).catch(function () { log('API /api/health no disponible (modo demostración).'); });
      })
      .catch(function (err) {
        aviso('Error durante la inicialización:', err && err.message);
        toast('Ocurrió un problema al iniciar el prototipo. La interfaz sigue disponible.', 'error', 8000);
      })
      .then(function () {
        if (N.feed) { N.feed.setAttribute('aria-busy', 'false'); }
        log('Ojo Comas iniciado. Reportes:', ESTADO.reportes.length, '· fuente:', ESTADO.fuenteReportes);
      });
  }

  // Exposición para depuración manual desde la consola del navegador.
  window.OJO_COMAS = {
    estado: ESTADO,
    config: CONFIG,
    refrescar: refrescar,
    abrirReporte: abrirFormulario,
    seleccionarZona: seleccionarZona,
    detectarZona: detectarZona,
    verEnMapa: verEnMapa,
    apoyarReporte: apoyarReporte,
    abrirDetalle: abrirDetalle
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();

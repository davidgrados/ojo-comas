/**
 * Ojo Comas — API del prototipo de reporte ciudadano (Cloudflare Workers + Hono).
 *
 * ADVERTENCIA: prototipo de demostracion. Los datos son ficticios y no representa oficialmente
 * a la Municipalidad Distrital de Comas.
 *
 * Cumplimiento:
 *   * Ley N° 29733 (Proteccion de Datos Personales): reportes anonimos por defecto; el contacto
 *     es opcional y solo se guarda con consentimiento explicito; la IP nunca se almacena, solo
 *     un hash con sal diaria para limitar abusos; las respuestas publicas nunca incluyen contacto.
 *   * D.S. N° 029-2021-PCM (Gobierno Digital): API REST/GeoJSON interoperable, CORS acotado,
 *     respuestas de error estructuradas.
 *   * Ley N° 27972 (Ley Organica de Municipalidades, Art. 53): endpoint de apoyo vecinal que
 *     fomenta la participacion sin suplantar a la municipalidad.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { listaSeparada, verificarTurnstile } from './turnstile';
import {
  BBOX_DISTRITO,
  COLECCION_ZONAS,
  ZONAS_VALIDAS,
  metadatosZonas,
  zonaDe,
} from './zonas';
import {
  COLUMNAS_PUBLICAS,
  MAX_DESCRIPCION,
  aFeatureGeoJson,
  claveFoto,
  decodificarFoto,
  errorJson,
  esCategoria,
  esEstado,
  hashIp,
  ipCliente,
  normalizarZona,
  numero,
  registrar,
  secretoCoincide,
  texto,
  type FilaReporte,
} from './util';

const VERSION = '1.0.0';

const app = new Hono<{ Bindings: Env }>();

app.use('*', secureHeaders({ xFrameOptions: 'DENY', xContentTypeOptions: 'nosniff' }));

// CORS acotado: solo los origenes declarados en CORS_ORIGINS (o "*" en la demo local).
app.use('/api/*', async (c, next) => {
  const permitidos = listaSeparada(c.env.CORS_ORIGINS);
  return cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (permitidos.includes('*')) return origin;
      return permitidos.includes(origin) ? origin : undefined;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  registrar('error_no_controlado', { ruta: c.req.path, mensaje: err.message });
  return c.json({ ok: false, error: 'Error interno del servidor.' }, 500);
});

app.notFound((c) => errorJson(c, 404, 'Ruta no encontrada.'));

// ---------------------------------------------------------------------------
// Salud
// ---------------------------------------------------------------------------
app.get('/api/health', async (c) => {
  let baseOk = false;
  try {
    await c.env.DB.prepare('SELECT 1 AS uno').first();
    baseOk = true;
  } catch {
    baseOk = false;
  }
  return c.json({
    ok: true,
    servicio: 'ojo-comas-api',
    version: VERSION,
    entorno: c.env.ENTORNO,
    base_de_datos: baseOk ? 'ok' : 'sin respuesta',
    almacenamiento_fotos: typeof c.env.FOTOS?.put === 'function' ? 'ok' : 'no configurado',
    zonas: ZONAS_VALIDAS.length,
    turnstile_sitekey: c.env.TURNSTILE_SITEKEY,
    hora: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Zonas (misma fuente que valida el servidor)
// ---------------------------------------------------------------------------
app.get('/api/zonas', (c) =>
  c.json({
    ok: true,
    distrito: 'Comas',
    provincia: 'Lima',
    departamento: 'Lima',
    pais: 'Peru',
    total_zonas: ZONAS_VALIDAS.length,
    bbox: BBOX_DISTRITO,
    metadata: metadatosZonas(),
    zonas: COLECCION_ZONAS.features.map((f) => ({ ...f.properties, geometry: f.geometry })),
  }),
);

// ---------------------------------------------------------------------------
// Listado de reportes como GeoJSON
// ---------------------------------------------------------------------------
app.get('/api/reports', async (c) => {
  const zona = c.req.query('zona') ? normalizarZona(c.req.query('zona')) : null;
  if (c.req.query('zona') && !zona) {
    return errorJson(c, 400, 'El parametro zona debe estar entre 01 y 14.');
  }
  const estado = c.req.query('estado');
  if (estado && !esEstado(estado)) {
    return errorJson(c, 400, 'El parametro estado debe ser pendiente, en_proceso o resuelto.');
  }
  const categoria = c.req.query('categoria');
  if (categoria && !esCategoria(categoria)) {
    return errorJson(c, 400, 'El parametro categoria debe ser bache, basura, alumbrado u otro.');
  }

  const limiteCrudo = numero(c.req.query('limit'));
  const limite = Math.min(Math.max(limiteCrudo ?? 500, 1), 500);

  const condiciones: string[] = [];
  const argumentos: (string | number)[] = [];
  if (zona) {
    condiciones.push('zona = ?');
    argumentos.push(zona);
  }
  if (estado) {
    condiciones.push('status = ?');
    argumentos.push(estado);
  }
  if (categoria) {
    condiciones.push('category = ?');
    argumentos.push(categoria);
  }

  const bbox = c.req.query('bbox');
  if (bbox) {
    const partes = bbox.split(',').map(Number);
    if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) {
      return errorJson(c, 400, 'El parametro bbox debe ser "oeste,sur,este,norte".');
    }
    const [oeste, sur, este, norte] = partes as [number, number, number, number];
    condiciones.push('longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?');
    argumentos.push(oeste, este, sur, norte);
  }

  const sql =
    `SELECT ${COLUMNAS_PUBLICAS} FROM reports` +
    (condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '') +
    ' ORDER BY created_at DESC, id DESC LIMIT ?';

  const { results } = await c.env.DB.prepare(sql)
    .bind(...argumentos, limite)
    .all<FilaReporte>();

  return c.json(
    {
      type: 'FeatureCollection',
      consulta: { zona, estado, categoria, limite },
      features: (results ?? []).map(aFeatureGeoJson),
    },
    200,
    { 'Cache-Control': 'public, max-age=20' },
  );
});

// ---------------------------------------------------------------------------
// Un reporte concreto + su historial de estados
// ---------------------------------------------------------------------------
app.get('/api/reports/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return errorJson(c, 400, 'Identificador invalido.');

  const fila = await c.env.DB.prepare(`SELECT ${COLUMNAS_PUBLICAS} FROM reports WHERE id = ?`)
    .bind(id)
    .first<FilaReporte>();
  if (!fila) return errorJson(c, 404, 'Reporte no encontrado.');

  const { results: historial } = await c.env.DB.prepare(
    'SELECT status, note, changed_at FROM status_history WHERE report_id = ? ORDER BY changed_at ASC, id ASC',
  )
    .bind(id)
    .all<{ status: string; note: string | null; changed_at: string }>();

  return c.json({
    ok: true,
    reporte: aFeatureGeoJson(fila),
    historial: (historial ?? []).map((h) => ({
      estado: h.status,
      nota: h.note,
      changed_at: h.changed_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// Crear reporte
// ---------------------------------------------------------------------------
app.post('/api/report', async (c) => {
  const ip = ipCliente(c);
  const sal = c.env.IP_SALT || 'ojo-comas-demo-sin-sal';
  const ipHash = await hashIp(ip, sal);

  // Limite de abuso: N reportes por hora y por hash de IP.
  const maxPorHora = Number(c.env.MAX_REPORTES_POR_HORA ?? '8') || 8;
  if (ipHash) {
    const conteo = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM reports WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 hour')",
    )
      .bind(ipHash)
      .first<{ total: number }>();
    if ((conteo?.total ?? 0) >= maxPorHora) {
      registrar('rate_limit_reportes', { ip_hash: ipHash.slice(0, 12), total: conteo?.total });
      return errorJson(
        c,
        429,
        `Demasiados reportes en una hora (maximo ${maxPorHora}). Intenta mas tarde.`,
      );
    }
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorJson(c, 400, 'El cuerpo debe ser JSON valido.');
  }

  // 1) Turnstile (siempre primero: no gastamos recursos en peticiones no verificadas).
  const turnstile = await verificarTurnstile({
    secret: c.env.TURNSTILE_SECRET,
    token: cuerpo['turnstileToken'],
    remoteIp: ip,
    accionesPermitidas: listaSeparada(c.env.TURNSTILE_ACTIONS),
    hostnamesPermitidos: listaSeparada(c.env.TURNSTILE_HOSTNAMES),
  });
  if (!turnstile.ok) {
    registrar('turnstile_rechazo', { motivo: turnstile.motivo, codigos: turnstile.codigos });
    return errorJson(c, 403, turnstile.motivo ?? 'Verificacion antibot fallida.', turnstile.codigos?.join(', '));
  }

  // 2) Validacion de campos.
  if (!esCategoria(cuerpo['categoria'])) {
    return errorJson(c, 400, 'La categoria debe ser bache, basura, alumbrado u otro.');
  }
  const lat = numero(cuerpo['lat']);
  const lng = numero(cuerpo['lng']);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return errorJson(c, 400, 'Coordenadas invalidas.');
  }
  if (lat < BBOX_DISTRITO.minLat || lat > BBOX_DISTRITO.maxLat || lng < BBOX_DISTRITO.minLng || lng > BBOX_DISTRITO.maxLng) {
    return errorJson(c, 400, 'El punto esta fuera del distrito de Comas.');
  }

  // 3) La zona se deduce en el SERVIDOR; no se confia en la que envia el navegador.
  const zonaServidor = zonaDe(lat, lng);
  if (!zonaServidor) {
    return errorJson(c, 400, 'No se pudo determinar la zona para esas coordenadas.');
  }
  const zonaCliente = normalizarZona(cuerpo['zona']);
  const zona = zonaServidor;

  const descripcionCruda = cuerpo['descripcion'];
  if (typeof descripcionCruda === 'string' && descripcionCruda.length > MAX_DESCRIPCION) {
    return errorJson(c, 400, `La descripcion no puede pasar de ${MAX_DESCRIPCION} caracteres.`);
  }
  const descripcion = texto(descripcionCruda, MAX_DESCRIPCION);
  const direccion = texto(cuerpo['direccion'], 200);

  // 4) Contacto SOLO con consentimiento explicito (Ley N° 29733).
  const consentimiento = cuerpo['consentimiento'] === true;
  const contacto = consentimiento ? texto(cuerpo['contacto'], 120) : null;

  // 5) Foto opcional a R2.
  const maxFoto = Number(c.env.MAX_FOTO_BYTES ?? '2097152') || 2097152;
  let photoKey: string | null = null;
  const foto = cuerpo['fotoBase64'];
  if (foto !== null && foto !== undefined && foto !== '') {
    const decodificada = decodificarFoto(foto, maxFoto);
    if (!decodificada.ok) {
      if (decodificada.motivo === 'sin-foto') {
        photoKey = null;
      } else {
        const esTamano = decodificada.motivo.includes('maximo es');
        return errorJson(c, esTamano ? 413 : 400, decodificada.motivo);
      }
    } else {
      const idObjeto = crypto.randomUUID();
      photoKey = claveFoto(decodificada.foto.mime, idObjeto);
      try {
        await c.env.FOTOS.put(photoKey, decodificada.foto.bytes, {
          httpMetadata: { contentType: decodificada.foto.mime, cacheControl: 'public, max-age=31536000, immutable' },
          customMetadata: { zona, categoria: cuerpo['categoria'], prototipo: 'ojo-comas' },
        });
      } catch (error) {
        registrar('error_r2', { mensaje: error instanceof Error ? error.message : 'desconocido' });
        // La foto es opcional: el reporte se guarda igual y se avisa.
        photoKey = null;
      }
    }
  }

  const insercion = await c.env.DB.prepare(
    `INSERT INTO reports (category, description, latitude, longitude, zona, address, photo_key,
                          status, contact, consent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?) RETURNING ${COLUMNAS_PUBLICAS}`,
  )
    .bind(
      cuerpo['categoria'],
      descripcion,
      lat,
      lng,
      zona,
      direccion,
      photoKey,
      contacto,
      consentimiento ? 1 : 0,
      ipHash,
    )
    .first<FilaReporte>();

  if (!insercion) return errorJson(c, 500, 'No se pudo guardar el reporte.');

  await c.env.DB.prepare(
    "INSERT INTO status_history (report_id, status, note) VALUES (?, 'pendiente', ?)",
  )
    .bind(insercion.id, 'Reporte creado por un vecino desde el prototipo Ojo Comas.')
    .run();

  registrar('reporte_creado', {
    id: insercion.id,
    zona,
    categoria: insercion.category,
    con_foto: Boolean(photoKey),
    zona_cliente: zonaCliente,
    zona_coincide: zonaCliente === null || zonaCliente === zona,
  });

  return c.json(
    {
      ok: true,
      id: insercion.id,
      zona,
      estado: 'pendiente',
      foto_url: photoKey ? `/api/photos/${photoKey}` : null,
      mensaje: '¡Gracias! Tu reporte fue registrado.',
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// Apoyo vecinal (Ley N° 27972, Art. 53)
// ---------------------------------------------------------------------------
app.post('/api/reports/:id/confirm', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return errorJson(c, 400, 'Identificador invalido.');

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await c.req.json()) as Record<string, unknown>;
  } catch {
    cuerpo = {};
  }

  const ip = ipCliente(c);
  const sal = c.env.IP_SALT || 'ojo-comas-demo-sin-sal';
  const ipHash = await hashIp(ip, sal);
  if (!ipHash) return errorJson(c, 400, 'No se pudo identificar la peticion.');

  const maxApoyos = Number(c.env.MAX_APOYOS_POR_HORA ?? '30') || 30;
  const apoyosRecientes = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM confirmations WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 hour')",
  )
    .bind(ipHash)
    .first<{ total: number }>();
  if ((apoyosRecientes?.total ?? 0) >= maxApoyos) {
    return errorJson(c, 429, 'Demasiados apoyos en una hora. Intenta mas tarde.');
  }

  const turnstile = await verificarTurnstile({
    secret: c.env.TURNSTILE_SECRET,
    token: cuerpo['turnstileToken'],
    remoteIp: ip,
    accionesPermitidas: listaSeparada(c.env.TURNSTILE_ACTIONS),
    hostnamesPermitidos: listaSeparada(c.env.TURNSTILE_HOSTNAMES),
  });
  if (!turnstile.ok) {
    return errorJson(c, 403, turnstile.motivo ?? 'Verificacion antibot fallida.');
  }

  const existe = await c.env.DB.prepare('SELECT id FROM reports WHERE id = ?').bind(id).first<{ id: number }>();
  if (!existe) return errorJson(c, 404, 'Reporte no encontrado.');

  try {
    await c.env.DB.prepare('INSERT INTO confirmations (report_id, ip_hash) VALUES (?, ?)')
      .bind(id, ipHash)
      .run();
  } catch {
    const actual = await c.env.DB.prepare('SELECT confirmations FROM reports WHERE id = ?')
      .bind(id)
      .first<{ confirmations: number }>();
    return c.json(
      { ok: false, error: 'Ya apoyaste este reporte.', confirmaciones: actual?.confirmations ?? 0 },
      409,
    );
  }

  const actualizado = await c.env.DB.prepare(
    'UPDATE reports SET confirmations = confirmations + 1, updated_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id = ? RETURNING confirmations',
  )
    .bind(id)
    .first<{ confirmations: number }>();

  return c.json({ ok: true, confirmaciones: actualizado?.confirmations ?? 1 });
});

// ---------------------------------------------------------------------------
// Cambio de estado (administrativo simulado, protegido con token)
// ---------------------------------------------------------------------------
app.patch('/api/reports/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return errorJson(c, 400, 'Identificador invalido.');

  const cabecera = c.req.header('Authorization') ?? '';
  const token = cabecera.toLowerCase().startsWith('bearer ') ? cabecera.slice(7).trim() : null;
  if (!(await secretoCoincide(token, c.env.ADMIN_TOKEN))) {
    registrar('admin_no_autorizado', { ruta: c.req.path });
    return errorJson(c, 401, 'No autorizado.');
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorJson(c, 400, 'El cuerpo debe ser JSON valido.');
  }
  if (!esEstado(cuerpo['estado'])) {
    return errorJson(c, 400, 'El estado debe ser pendiente, en_proceso o resuelto.');
  }
  const nota = texto(cuerpo['nota'], 200);

  const actualizado = await c.env.DB.prepare(
    `UPDATE reports SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = ? RETURNING ${COLUMNAS_PUBLICAS}`,
  )
    .bind(cuerpo['estado'], id)
    .first<FilaReporte>();
  if (!actualizado) return errorJson(c, 404, 'Reporte no encontrado.');

  await c.env.DB.prepare('INSERT INTO status_history (report_id, status, note) VALUES (?, ?, ?)')
    .bind(id, cuerpo['estado'], nota ?? 'Cambio de estado desde el panel administrativo del prototipo.')
    .run();

  registrar('estado_actualizado', { id, estado: cuerpo['estado'] });
  return c.json({ ok: true, reporte: aFeatureGeoJson(actualizado) });
});

// ---------------------------------------------------------------------------
// Estadisticas para el panel de transparencia
// ---------------------------------------------------------------------------
app.get('/api/stats', async (c) => {
  const [totales, porEstado, porCategoria, porZona, ranking] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(confirmations),0) AS apoyos FROM reports').first<{
      total: number;
      apoyos: number;
    }>(),
    c.env.DB.prepare('SELECT status, COUNT(*) AS total FROM reports GROUP BY status').all<{
      status: string;
      total: number;
    }>(),
    c.env.DB.prepare('SELECT category, COUNT(*) AS total FROM reports GROUP BY category').all<{
      category: string;
      total: number;
    }>(),
    c.env.DB.prepare(
      'SELECT zona, COUNT(*) AS total, SUM(CASE WHEN status = \'pendiente\' THEN 1 ELSE 0 END) AS pendiente, ' +
        'SUM(CASE WHEN status = \'en_proceso\' THEN 1 ELSE 0 END) AS en_proceso, ' +
        'SUM(CASE WHEN status = \'resuelto\' THEN 1 ELSE 0 END) AS resuelto ' +
        'FROM reports GROUP BY zona ORDER BY zona ASC',
    ).all<{ zona: string; total: number; pendiente: number; en_proceso: number; resuelto: number }>(),
    c.env.DB.prepare(
      'SELECT zona, COUNT(*) AS total FROM reports GROUP BY zona ORDER BY total DESC, zona ASC LIMIT 14',
    ).all<{ zona: string; total: number }>(),
  ]);

  const mapaEstado: Record<string, number> = { pendiente: 0, en_proceso: 0, resuelto: 0 };
  for (const fila of porEstado.results ?? []) mapaEstado[fila.status] = fila.total;

  const mapaCategoria: Record<string, number> = { bache: 0, basura: 0, alumbrado: 0, otro: 0 };
  for (const fila of porCategoria.results ?? []) mapaCategoria[fila.category] = fila.total;

  const conteoPorZona = new Map((porZona.results ?? []).map((f) => [f.zona, f]));

  return c.json({
    ok: true,
    total: totales?.total ?? 0,
    apoyos: totales?.apoyos ?? 0,
    por_estado: mapaEstado,
    por_categoria: mapaCategoria,
    por_zona: ZONAS_VALIDAS.map((zona) => {
      const fila = conteoPorZona.get(zona);
      return {
        zona,
        total: fila?.total ?? 0,
        pendiente: fila?.pendiente ?? 0,
        en_proceso: fila?.en_proceso ?? 0,
        resuelto: fila?.resuelto ?? 0,
      };
    }),
    ranking: (ranking.results ?? []).map((f) => ({ zona: f.zona, total: f.total })),
    actualizado_en: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Fotos servidas desde R2
// ---------------------------------------------------------------------------
app.get('/api/photos/*', async (c) => {
  const clave = c.req.path.replace(/^\/api\/photos\//, '');
  if (!clave || clave.includes('..')) return errorJson(c, 400, 'Clave de foto invalida.');

  const objeto = await c.env.FOTOS.get(clave);
  if (!objeto) return errorJson(c, 404, 'Foto no encontrada.');

  const cabeceras = new Headers();
  objeto.writeHttpMetadata(cabeceras);
  cabeceras.set('etag', objeto.httpEtag);
  cabeceras.set('Cache-Control', 'public, max-age=31536000, immutable');
  cabeceras.set('X-Content-Type-Options', 'nosniff');

  return new Response(objeto.body, { headers: cabeceras });
});

export default app;

/**
 * Utilidades compartidas: validacion, privacidad, imagenes y respuestas.
 */
import type { Context } from 'hono';

export const CATEGORIAS = ['bache', 'basura', 'alumbrado', 'otro'] as const;
export const ESTADOS = ['pendiente', 'en_proceso', 'resuelto'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type Estado = (typeof ESTADOS)[number];

export const MAX_DESCRIPCION = 140;
export const MIMES_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const CABECERAS_FOTO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Codigos de estado que devuelve esta API en sus errores. */
export type CodigoError = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

/** Respuesta JSON de error uniforme. */
export function errorJson(c: Context, status: CodigoError, mensaje: string, detalle?: string) {
  return c.json({ ok: false, error: mensaje, ...(detalle ? { detalle } : {}) }, status);
}

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && (CATEGORIAS as readonly string[]).includes(valor);
}

export function esEstado(valor: unknown): valor is Estado {
  return typeof valor === 'string' && (ESTADOS as readonly string[]).includes(valor);
}

/** Normaliza "1" -> "01" y valida el rango 01..14. */
export function normalizarZona(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const texto = String(valor).trim();
  const soloDigitos = texto.replace(/^zona\s*/i, '');
  if (!/^\d{1,2}$/.test(soloDigitos)) return null;
  const numero = Number(soloDigitos);
  if (numero < 1 || numero > 14) return null;
  return String(numero).padStart(2, '0');
}

export function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio.length === 0) return null;
  return limpio.slice(0, max);
}

export function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const parseado = Number(valor);
    if (Number.isFinite(parseado)) return parseado;
  }
  return null;
}

/**
 * Hash de IP con sal diaria.
 *
 * Ley N° 29733: no guardamos la IP. Guardamos un SHA-256 de (IP + fecha + sal secreta), que
 * cambia cada dia, no es reversible de forma practica y solo sirve para limitar abusos.
 */
export async function hashIp(ip: string | null, sal: string): Promise<string | null> {
  if (!ip) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  const datos = new TextEncoder().encode(`${ip}|${hoy}|${sal}`);
  const digest = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comparacion de secretos en tiempo constante.
 * Se comparan los digests SHA-256 para que la longitud no filtre informacion y para no
 * comparar cadenas directamente (evita filtrado por diferencias de tiempo).
 */
export async function secretoCoincide(recibido: string | null, esperado: string | undefined): Promise<boolean> {
  if (!recibido || !esperado) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recibido)),
    crypto.subtle.digest('SHA-256', enc.encode(esperado)),
  ]);
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let diferencia = 0;
  for (let i = 0; i < ua.length; i += 1) diferencia |= (ua[i] ?? 0) ^ (ub[i] ?? 0);
  return diferencia === 0;
}

export interface FotoDecodificada {
  bytes: Uint8Array;
  mime: string;
  extension: string;
}

/**
 * Decodifica un data URL (`data:image/jpeg;base64,...`) validando mime y tamano.
 * No confia en lo que declara el cliente: comprueba los bytes magicos del archivo.
 */
export function decodificarFoto(
  dataUrl: unknown,
  maxBytes: number,
): { ok: true; foto: FotoDecodificada } | { ok: false; motivo: string } {
  if (dataUrl === null || dataUrl === undefined || dataUrl === '') {
    return { ok: false, motivo: 'sin-foto' };
  }
  if (typeof dataUrl !== 'string') return { ok: false, motivo: 'La foto debe ser un data URL en texto.' };

  const coincidencia = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!coincidencia) {
    return { ok: false, motivo: 'La foto debe venir como data URL base64 (data:image/...;base64,...).' };
  }
  const mimeDeclarado = (coincidencia[1] ?? '').toLowerCase();
  const base64 = (coincidencia[2] ?? '').replace(/\s+/g, '');

  // 4 caracteres base64 -> 3 bytes; se usa para rechazar ANTES de decodificar.
  const estimado = Math.floor((base64.length * 3) / 4);
  if (estimado > maxBytes) {
    return {
      ok: false,
      motivo: `La foto pesa ~${Math.round(estimado / 1024)} KB y el maximo es ${Math.round(maxBytes / 1024)} KB.`,
    };
  }

  let bytes: Uint8Array;
  try {
    const binario = atob(base64);
    bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  } catch {
    return { ok: false, motivo: 'La foto no es base64 valido.' };
  }

  const real = detectarMime(bytes);
  if (!real) {
    return { ok: false, motivo: 'La foto no es un JPEG, PNG ni WebP valido.' };
  }
  if (mimeDeclarado !== real) {
    return { ok: false, motivo: `El tipo declarado (${mimeDeclarado}) no coincide con el contenido (${real}).` };
  }

  return { ok: true, foto: { bytes, mime: real, extension: CABECERAS_FOTO[real] ?? 'bin' } };
}

function detectarMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const b = (i: number) => bytes[i] ?? 0;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  const riff = b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46;
  const webp = b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50;
  if (riff && webp) return 'image/webp';
  return null;
}

export function claveFoto(mime: string, id: string): string {
  const ahora = new Date();
  const anio = ahora.getUTCFullYear();
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  const extension = CABECERAS_FOTO[mime] ?? 'bin';
  return `reportes/${anio}/${mes}/${id}.${extension}`;
}

/** Nunca exponer `contact`, `consent` ni `ip_hash` en respuestas publicas. */
export interface FilaReporte {
  id: number;
  category: string;
  description: string | null;
  latitude: number;
  longitude: number;
  zona: string;
  address: string | null;
  photo_key: string | null;
  status: string;
  confirmations: number;
  created_at: string;
  updated_at: string;
}

export const COLUMNAS_PUBLICAS =
  'id, category, description, latitude, longitude, zona, address, photo_key, status, ' +
  'confirmations, created_at, updated_at';

export function aFeatureGeoJson(fila: FilaReporte) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [fila.longitude, fila.latitude] },
    properties: {
      id: fila.id,
      categoria: fila.category,
      descripcion: fila.description,
      zona: fila.zona,
      estado: fila.status,
      foto_url: fila.photo_key ? `/api/photos/${fila.photo_key}` : null,
      direccion: fila.address,
      confirmaciones: fila.confirmations ?? 0,
      creado_en: fila.created_at,
      actualizado_en: fila.updated_at,
    },
  };
}

export function registrar(evento: string, datos: Record<string, unknown> = {}): void {
  // Log estructurado en JSON: facilita filtrar en Workers Logs.
  console.log(JSON.stringify({ ts: new Date().toISOString(), evento, ...datos }));
}

export function ipCliente(c: Context): string | null {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

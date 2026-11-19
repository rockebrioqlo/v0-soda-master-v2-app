/**
 * Sesión en servidor (sesión 3 del ROADMAP).
 *
 * - El login crea una fila en `soda_master.sesiones` con el hash SHA-256
 *   de un token aleatorio. Al navegador solo va la cookie httpOnly
 *   `sm_sesion` = `<token>.<firma HMAC>`.
 * - La firma (con SESION_SECRETO) permite rechazar cookies falsas sin ir
 *   a la base. La validez real (no revocada, no expirada, usuario activo)
 *   siempre se revisa en la base.
 * - `proxy.ts` valida sesión y rol en cada petición a /api/**; las rutas
 *   que necesitan saber QUIÉN hace la acción llaman `requireSesion()`,
 *   que vuelve a validar por su cuenta y entrega el usuario real.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import type { Usuario } from '@/lib/types'
import { rolesEfectivos, tieneAlgunRol, type RolApi } from '@/lib/permisos-api'

export const COOKIE_SESION = 'sm_sesion'
export const DURACION_SESION_SEG = 12 * 60 * 60 // 12 horas: un turno

export type UsuarioSesion = Usuario & { sesion_id: string; roles: RolApi[] }

function secreto(): Buffer {
  const s = process.env.SESION_SECRETO
  if (!s || s.length < 32) {
    // Fallar cerrado: sin secreto no hay sesiones.
    throw new Error('SESION_SECRETO no está configurado (mínimo 32 caracteres)')
  }
  return Buffer.from(s, 'utf8')
}

/** HMAC con separación de dominio: una firma de un propósito no sirve para otro. */
export function firmar(proposito: string, valor: string): string {
  return createHmac('sha256', secreto()).update(`${proposito}:${valor}`).digest('base64url')
}

export function firmaValida(proposito: string, valor: string, firma: string): boolean {
  const esperada = Buffer.from(firmar(proposito, valor))
  const recibida = Buffer.from(firma)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Lee una cookie desde el header `Cookie` (sirve en proxy y en rutas). */
export function leerCookie(request: Request, nombre: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=')
    if (i === -1) continue
    if (parte.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

/** Devuelve el token si la cookie tiene formato y firma válidos (sin ir a la base). */
export function tokenDeCookie(valor: string | null): string | null {
  if (!valor) return null
  const punto = valor.lastIndexOf('.')
  if (punto <= 0) return null
  const token = valor.slice(0, punto)
  const firma = valor.slice(punto + 1)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  try {
    return firmaValida('sesion', token, firma) ? token : null
  } catch {
    return null
  }
}

function opcionesCookie(maxAge: number) {
  const seguro = process.env.NODE_ENV === 'production'
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`
}

/** Crea la sesión en la base y devuelve el valor del header Set-Cookie. */
export async function crearSesion(usuarioId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expira = new Date(Date.now() + DURACION_SESION_SEG * 1000)
  await db.crearSesion(usuarioId, hashToken(token), expira)
  const valor = `${token}.${firmar('sesion', token)}`
  return `${COOKIE_SESION}=${valor}; ${opcionesCookie(DURACION_SESION_SEG)}`
}

export function cookieBorrada(): string {
  return `${COOKIE_SESION}=; ${opcionesCookie(0)}`
}

/**
 * Sesión vigente de la petición, o null. Consulta la base: sesión no
 * revocada ni expirada y usuario activo (los roles se leen frescos).
 */
export async function obtenerSesion(request: Request): Promise<UsuarioSesion | null> {
  const token = tokenDeCookie(leerCookie(request, COOKIE_SESION))
  if (!token) return null
  return obtenerSesionDeToken(token)
}

/** Igual que obtenerSesion, con un token cuya firma ya se verificó. */
export async function obtenerSesionDeToken(token: string): Promise<UsuarioSesion | null> {
  const fila = await db.getSesionActiva(hashToken(token))
  if (!fila) return null
  return { ...fila, roles: rolesEfectivos(fila.rol, fila.roles_adicionales) }
}

export async function revocarSesionDePeticion(request: Request): Promise<void> {
  const token = tokenDeCookie(leerCookie(request, COOKIE_SESION))
  if (token) await db.revocarSesion(hashToken(token))
}

type ResultadoSesion =
  | { ok: true; usuario: UsuarioSesion }
  | { ok: false; respuesta: Response }

/**
 * Para usar en las rutas: valida la sesión (y opcionalmente el rol) por
 * su cuenta, sin confiar solo en el proxy.
 *
 *   const s = await requireSesion(request, ['admin'])
 *   if (!s.ok) return s.respuesta
 *   const usuario = s.usuario
 */
export async function requireSesion(
  request: Request,
  roles?: readonly RolApi[],
): Promise<ResultadoSesion> {
  let usuario: UsuarioSesion | null
  try {
    usuario = await obtenerSesion(request)
  } catch (error) {
    console.error('[sesion] error validando sesión:', error)
    return { ok: false, respuesta: Response.json({ error: 'Error en servidor' }, { status: 500 }) }
  }
  if (!usuario) {
    return { ok: false, respuesta: Response.json({ error: 'Sesión requerida' }, { status: 401 }) }
  }
  if (roles && !tieneAlgunRol(usuario.roles, roles)) {
    return { ok: false, respuesta: Response.json({ error: 'No tienes permiso para esta acción' }, { status: 403 }) }
  }
  return { ok: true, usuario }
}

export function esAdminSesion(usuario: { roles: RolApi[] }): boolean {
  return usuario.roles.includes('admin')
}

/** IP del cliente (Vercel pone la real primero en x-forwarded-for). */
export function ipDePeticion(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim() || 'desconocida'
  return request.headers.get('x-real-ip')?.trim() || 'desconocida'
}

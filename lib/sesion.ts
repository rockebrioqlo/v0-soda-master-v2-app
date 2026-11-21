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
 * - Cierre por inactividad (sesión 14.5a, F42): la sesión vence X minutos después de la última
 *   acción del usuario (reglas en lib/sesion-reglas.ts). Solo el proxy renueva la actividad, y no
 *   con sondeos; `requireSesion` y `/api/auth/sesion` solo validan.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import type { Usuario } from '@/lib/types'
import { accesoParaRuta, rolesEfectivos, tieneAlgunRol, type RolApi } from '@/lib/permisos-api'
import {
  CODIGO_SESION_INACTIVA,
  CODIGO_SESION_VENCIDA,
  escrituraActividadSeg,
  limiteInactividadSeg,
  topeAbsolutoSeg,
} from '@/lib/sesion-reglas'

export const COOKIE_SESION = 'sm_sesion'

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
  // `expira` es el tope absoluto de seguridad (16 h); la inactividad la decide `resolverSesion`.
  const tope = topeAbsolutoSeg()
  const expira = new Date(Date.now() + tope * 1000)
  await db.crearSesion(usuarioId, hashToken(token), expira)
  const valor = `${token}.${firmar('sesion', token)}`
  return `${COOKIE_SESION}=${valor}; ${opcionesCookie(tope)}`
}

export function cookieBorrada(): string {
  return `${COOKIE_SESION}=; ${opcionesCookie(0)}`
}

export type MotivoSesionInvalida = 'invalida' | 'inactiva' | 'vencida'

export type ResultadoResolverSesion =
  | { ok: true; usuario: UsuarioSesion }
  | { ok: false; motivo: MotivoSesionInvalida }

/**
 * Decide el estado de una sesión por su token (con firma ya verificada): no revocada, usuario activo,
 * dentro del tope absoluto y dentro del tiempo de inactividad configurado. Con `renovar`, una acción
 * real deja registrada su última actividad (como máximo una vez por minuto; el UPDATE trae la
 * condición). Una sesión ya vencida por inactividad no se renueva nunca.
 */
export async function resolverSesion(
  token: string,
  opciones: { renovar?: boolean } = {},
): Promise<ResultadoResolverSesion> {
  const fila = await db.getSesionPorToken(hashToken(token))
  if (!fila) return { ok: false, motivo: 'invalida' }
  if (fila.tope_vencido) return { ok: false, motivo: 'vencida' }
  const usuario: UsuarioSesion = {
    ...fila.usuario,
    roles: rolesEfectivos(fila.usuario.rol, fila.usuario.roles_adicionales),
  }
  const limite = limiteInactividadSeg(usuario.roles, fila.cfg)
  if (limite !== null && fila.inactivo_seg > limite) return { ok: false, motivo: 'inactiva' }
  if (opciones.renovar && fila.inactivo_seg >= escrituraActividadSeg()) {
    try {
      await db.renovarActividadSesion(usuario.sesion_id, escrituraActividadSeg())
    } catch (error) {
      // No renovar no debe tumbar la petición: lo peor es un cierre por inactividad un poco antes.
      console.error('[sesion] error registrando la actividad:', error)
    }
  }
  return { ok: true, usuario }
}

/** 401 con el código que distingue el cierre por inactividad o por tope del resto. */
export function respuestaSesionInvalida(motivo: MotivoSesionInvalida): Response {
  if (motivo === 'inactiva') {
    return Response.json(
      { error: 'Sesión cerrada por inactividad', codigo: CODIGO_SESION_INACTIVA },
      { status: 401 },
    )
  }
  if (motivo === 'vencida') {
    return Response.json(
      { error: 'La sesión venció. Vuelve a ingresar.', codigo: CODIGO_SESION_VENCIDA },
      { status: 401 },
    )
  }
  return Response.json({ error: 'Sesión requerida' }, { status: 401 })
}

/** Resultado de validar la cookie de una petición (sin renovar la actividad). */
export async function resolverSesionDePeticion(request: Request): Promise<ResultadoResolverSesion> {
  const token = tokenDeCookie(leerCookie(request, COOKIE_SESION))
  if (!token) return { ok: false, motivo: 'invalida' }
  return resolverSesion(token)
}

/**
 * Sesión vigente de la petición, o null. Consulta la base: sesión no revocada, dentro del tope y de
 * la inactividad, y usuario activo (los roles se leen frescos). No renueva la actividad.
 */
export async function obtenerSesion(request: Request): Promise<UsuarioSesion | null> {
  const r = await resolverSesionDePeticion(request)
  return r.ok ? r.usuario : null
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
  let resuelta: ResultadoResolverSesion
  try {
    resuelta = await resolverSesionDePeticion(request)
  } catch (error) {
    console.error('[sesion] error validando sesión:', error)
    return { ok: false, respuesta: Response.json({ error: 'Error en servidor' }, { status: 500 }) }
  }
  if (!resuelta.ok) {
    return { ok: false, respuesta: respuestaSesionInvalida(resuelta.motivo) }
  }
  const usuario = resuelta.usuario
  if (roles && !tieneAlgunRol(usuario.roles, roles)) {
    return { ok: false, respuesta: Response.json({ error: 'No tienes permiso para esta acción' }, { status: 403 }) }
  }
  return { ok: true, usuario }
}

/**
 * Defensa en profundidad (F13, sesión 14.5b-1): valida sesión Y rol dentro de la ruta leyendo la
 * MISMA tabla `accesoParaRuta` que usa el proxy (lib/permisos-api.ts), sin repetir listas de roles.
 * Usa la ruta y el método de la propia petición, así que no puede divergir del proxy. Una ruta
 * que la tabla marca como pública no debería llamar a esta función: si lo hace, exige sesión
 * igual (falla cerrado). Solo valida: la actividad de la sesión la renueva únicamente el proxy.
 *
 *   const s = await requireAcceso(request)
 *   if (!s.ok) return s.respuesta
 */
export async function requireAcceso(request: Request): Promise<ResultadoSesion> {
  const { pathname } = new URL(request.url)
  const metodo = request.method === 'HEAD' ? 'GET' : request.method
  const acceso = accesoParaRuta(pathname, metodo)
  return requireSesion(request, typeof acceso === 'string' ? undefined : acceso)
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

/** El usuario de la sesión como actor de la auditoría (sesión 17, K1): id, nombre y rol, nunca del body. */
export function actorDe(usuario: { id: string; nombre: string; rol: string }) {
  return { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }
}

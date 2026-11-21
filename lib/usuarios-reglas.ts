/**
 * Reglas para proteger a los administradores y el borrado de usuarios (sesión 14.5b-3: F49 y F50).
 * Módulo PURO, sin acceso a la base: lo importan `lib/db.ts`, `lib/usuarios-sql.ts` y la prueba
 * (`scripts/pruebas/usuarios.cjs`, con el type stripping de Node).
 *
 * - F49: no se puede desactivar, borrar ni quitar el rol de admin (rol principal `admin` o
 *   `administrador`) al ÚLTIMO admin activo, ni a uno mismo. La regla mira el ESTADO RESULTANTE: mandar
 *   el mismo `rol` o `activo: true` no cuenta como quitar nada.
 * - F50: un usuario con historial no se borra (hay que desactivarlo).
 *
 * `decidirCambioUsuario` es la especificación; el statement SQL de `lib/usuarios-sql.ts` aplica la misma
 * regla de forma atómica y la prueba compara ambas con una matriz de casos.
 */

export type CodigoCambioUsuario =
  | 'AUTO_MODIFICACION'
  | 'ULTIMO_ADMIN'
  | 'USUARIO_CON_HISTORIAL'
  | 'USUARIO_NO_ENCONTRADO'

export interface ErrorCambioUsuario {
  codigo: CodigoCambioUsuario
  status: number
  mensaje: string
}

/** Lo que se quiere hacer con el usuario objetivo. `undefined` o `null` = ese campo no cambia. */
export interface CambioUsuario {
  eliminar?: boolean
  activo?: boolean | null
  /** Rol principal pedido (con o sin normalizar). */
  rol?: string | null
}

export interface EstadoUsuario {
  rol: string | null
  activo: boolean
}

export function esRolAdmin(rol: string | null | undefined): boolean {
  return rol === 'admin' || rol === 'administrador'
}

/** True si el cambio deja al objetivo sin ser admin activo (siendo hoy un admin activo). */
export function quitaAdmin(actual: EstadoUsuario, cambio: CambioUsuario): boolean {
  if (!actual.activo || !esRolAdmin(actual.rol)) return false
  if (cambio.eliminar) return true
  if (cambio.activo === false) return true
  if (cambio.rol != null && !esRolAdmin(cambio.rol)) return true
  return false
}

const MSG_AUTO_ELIMINAR = 'No puedes borrar tu propio usuario. Pídele a otro administrador que lo haga.'
const MSG_AUTO_DESACTIVAR = 'No puedes desactivar tu propio usuario. Pídele a otro administrador que lo haga.'
const MSG_AUTO_ROL = 'No puedes quitarte el rol de administrador a ti mismo. Pídele a otro administrador que lo haga.'

export const MSG_ULTIMO_ADMIN =
  'Es el último administrador activo: no se puede desactivar, borrar ni quitarle el rol. Crea o activa otro administrador antes.'
export const MSG_USUARIO_CON_HISTORIAL = 'Tiene historial; desactívalo en su lugar'
export const MSG_USUARIO_NO_ENCONTRADO = 'Usuario no encontrado'

/**
 * Uno mismo: el que actúa es siempre un admin (la ruta es solo de admin), así que mirar el cambio
 * basta y no hace falta leer nada. Se evalúa ANTES que cualquier otra regla y sin tocar la base.
 */
export function autoModificacion(
  actorId: string,
  objetivoId: string,
  cambio: CambioUsuario,
): ErrorCambioUsuario | null {
  if (actorId !== objetivoId) return null
  const quita = (mensaje: string): ErrorCambioUsuario => ({ codigo: 'AUTO_MODIFICACION', status: 409, mensaje })
  if (cambio.eliminar) return quita(MSG_AUTO_ELIMINAR)
  if (cambio.activo === false) return quita(MSG_AUTO_DESACTIVAR)
  if (cambio.rol != null && !esRolAdmin(cambio.rol)) return quita(MSG_AUTO_ROL)
  return null
}

export interface EntradaDecision {
  actorId: string
  objetivoId: string
  /** Estado actual del objetivo; `null` si no existe. */
  actual: EstadoUsuario | null
  cambio: CambioUsuario
  /** Admins activos distintos del objetivo. */
  otrosAdminsActivos: number
  /** Solo para `eliminar`: el objetivo aparece en alguna tabla de historial. */
  tieneHistorial?: boolean
}

/** Especificación completa. Orden: uno mismo, no existe, último admin, historial. */
export function decidirCambioUsuario(e: EntradaDecision): ErrorCambioUsuario | null {
  const auto = autoModificacion(e.actorId, e.objetivoId, e.cambio)
  if (auto) return auto
  if (!e.actual) return { codigo: 'USUARIO_NO_ENCONTRADO', status: 404, mensaje: MSG_USUARIO_NO_ENCONTRADO }
  if (quitaAdmin(e.actual, e.cambio) && e.otrosAdminsActivos === 0) {
    return { codigo: 'ULTIMO_ADMIN', status: 409, mensaje: MSG_ULTIMO_ADMIN }
  }
  if (e.cambio.eliminar && e.tieneHistorial) {
    return { codigo: 'USUARIO_CON_HISTORIAL', status: 409, mensaje: MSG_USUARIO_CON_HISTORIAL }
  }
  return null
}

/**
 * Cliente: motivo por el que el servidor cerró la sesión (sesión 14.5a, F42).
 *
 * El 401 del servidor trae `codigo` SESION_INACTIVA (sin actividad) o SESION_VENCIDA (tope absoluto).
 * Se deja en `sessionStorage` para que el login lo muestre aunque la pantalla se recargue.
 */
import {
  CLAVE_AVISO_LOGIN,
  CODIGO_SESION_INACTIVA,
  CODIGO_SESION_VENCIDA,
} from '@/lib/sesion-reglas'

export type MotivoCierre = typeof CODIGO_SESION_INACTIVA | typeof CODIGO_SESION_VENCIDA

export const MENSAJES_CIERRE: Record<MotivoCierre, string> = {
  [CODIGO_SESION_INACTIVA]: 'Sesión cerrada por inactividad',
  [CODIGO_SESION_VENCIDA]: 'La sesión venció. Vuelve a ingresar.',
}

/** Lee el `codigo` de un 401 (sin consumir la respuesta) y, si es un cierre por inactividad o tope, lo recuerda. */
export async function registrarMotivoCierre(res: Response): Promise<MotivoCierre | null> {
  let codigo: unknown = null
  try {
    codigo = (await res.clone().json())?.codigo
  } catch {
    codigo = null
  }
  if (codigo !== CODIGO_SESION_INACTIVA && codigo !== CODIGO_SESION_VENCIDA) return null
  try {
    sessionStorage.setItem(CLAVE_AVISO_LOGIN, codigo)
  } catch {
    // sin sessionStorage: el aviso se pierde, el cierre no
  }
  return codigo
}

/** Motivo pendiente de mostrar en el login (se borra al leerlo). */
export function leerAvisoLogin(): MotivoCierre | null {
  try {
    const v = sessionStorage.getItem(CLAVE_AVISO_LOGIN)
    if (v === CODIGO_SESION_INACTIVA || v === CODIGO_SESION_VENCIDA) return v
  } catch {
    // ignorar
  }
  return null
}

export function borrarAvisoLogin(): void {
  try {
    sessionStorage.removeItem(CLAVE_AVISO_LOGIN)
  } catch {
    // ignorar
  }
}

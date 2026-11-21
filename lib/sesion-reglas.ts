/**
 * Reglas del cierre de sesión por inactividad (sesión 14.5a, F42). Funciones puras, sin acceso a la
 * base: las usan `lib/sesion.ts` (servidor) y el cliente (cabecera de sondeo, avisos del login).
 *
 * Modelo:
 *  - La sesión vence X minutos después de la última ACCIÓN del usuario (`sesiones.ultima_actividad`).
 *    Los sondeos y recargas automáticas no cuentan como acción (ver `esPeticionSondeo`).
 *  - X sale de `configuracion`: `sesion_inactividad_min` (POS, Pagos, Caja y admin; por defecto 15,
 *    mínimo 5) y `sesion_inactividad_kds_min` (usuarios que solo son cocina o bar; 0 = sin cierre,
 *    por defecto sin cierre porque el KDS es una pantalla pasiva).
 *  - Tope absoluto de seguridad (`TOPE_ABSOLUTO_SEG`, 16 h, todos los roles, también el KDS sin
 *    cierre): `sesiones.expira`, fijado en el login. Vence de madrugada, no en pleno servicio.
 *  - La última actividad se escribe como máximo una vez por minuto por sesión.
 *
 * Ajuste SOLO de desarrollo para probar sin esperar minutos reales (AGENTS.md, "Política de pruebas"):
 *   SESION_MINUTO_SEG_DEV = segundos que dura "un minuto" (con 2: el mínimo de 5 son 10 s y la
 *                           escritura de actividad es cada 2 s)
 *   SESION_TOPE_SEG_DEV   = tope absoluto en segundos
 * Se IGNORAN cuando existe la variable `VERCEL` (Vercel la define en todos sus servidores, preview y
 * producción), así que no pueden acortar nada en un despliegue.
 */

/** Cabecera con la que el cliente marca sus recargas automáticas (no renuevan la sesión). */
export const CABECERA_SONDEO = 'x-sm-sondeo'

export const CLAVE_INACTIVIDAD_MIN = 'sesion_inactividad_min'
export const CLAVE_INACTIVIDAD_KDS_MIN = 'sesion_inactividad_kds_min'

export const INACTIVIDAD_MIN_MINIMO = 5
export const INACTIVIDAD_MIN_MAXIMO = 960 // 16 h: lo mismo que el tope absoluto
export const INACTIVIDAD_MIN_DEFECTO = 15
/** 0 = sin cierre por inactividad. */
export const INACTIVIDAD_KDS_DEFECTO = 0

export const TOPE_ABSOLUTO_SEG = 16 * 60 * 60

export const CODIGO_SESION_INACTIVA = 'SESION_INACTIVA'
export const CODIGO_SESION_VENCIDA = 'SESION_VENCIDA'

/** Clave de `sessionStorage` donde el cliente deja el motivo del cierre para mostrarlo en el login. */
export const CLAVE_AVISO_LOGIN = 'soda_master_aviso_login'

/** Rutas que son sondeo por sí mismas (aunque el cliente no mande la cabecera). */
const RUTAS_SONDEO = ['/api/sondeo', '/api/auth/sesion']

function ajusteDevPermitido(): boolean {
  return !process.env.VERCEL
}

function numeroDev(nombre: string): number | null {
  if (!ajusteDevPermitido()) return null
  const n = Number(process.env[nombre])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Segundos que dura "un minuto" (60, salvo el ajuste de desarrollo). */
export function segundosPorMinuto(): number {
  return numeroDev('SESION_MINUTO_SEG_DEV') ?? 60
}

/** Tope absoluto de la sesión en segundos (16 h, salvo el ajuste de desarrollo). */
export function topeAbsolutoSeg(): number {
  return numeroDev('SESION_TOPE_SEG_DEV') ?? TOPE_ABSOLUTO_SEG
}

/** Cada cuántos segundos como máximo se escribe la última actividad de una sesión. */
export function escrituraActividadSeg(): number {
  return segundosPorMinuto()
}

/** ¿La petición es un sondeo o una recarga automática (no cuenta como actividad)? */
export function esPeticionSondeo(pathname: string, cabeceras: { get(nombre: string): string | null }): boolean {
  const ruta = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (RUTAS_SONDEO.includes(ruta)) return true
  return cabeceras.get(CABECERA_SONDEO) === '1'
}

export interface ConfigInactividad {
  /** Valor guardado de `sesion_inactividad_min` (null si no existe o no es un número). */
  general: number | null
  /** Valor guardado de `sesion_inactividad_kds_min` (null si no existe o no es un número). */
  kds: number | null
}

/**
 * Segundos de inactividad tras los cuales vence la sesión de estos roles, o `null` si no vence por
 * inactividad. Roles solo cocina/bar → límite del KDS; cualquier otro rol (admin, mesero, cajero o
 * mezclados) → el general, que es el conservador.
 */
export function limiteInactividadSeg(roles: readonly string[], cfg: ConfigInactividad): number | null {
  const soloKds = roles.length > 0 && roles.every((r) => r === 'cocina' || r === 'bar')
  const porMinuto = segundosPorMinuto()
  if (soloKds) {
    const m = cfg.kds === null || !Number.isFinite(cfg.kds) ? INACTIVIDAD_KDS_DEFECTO : cfg.kds
    if (m === 0) return null // sin cierre
    return Math.max(m, INACTIVIDAD_MIN_MINIMO) * porMinuto
  }
  const m = cfg.general !== null && Number.isFinite(cfg.general) && cfg.general >= INACTIVIDAD_MIN_MINIMO ? cfg.general : INACTIVIDAD_MIN_DEFECTO
  return m * porMinuto
}

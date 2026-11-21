/**
 * Carga inicial de la app (sesión 15, #26). Módulo puro: decide qué cuenta como "error de conexión con la BD".
 *
 * Cuenta como fallo: la petición se rechazó (`'red'`: sin conexión, servidor caído, corte) o el servidor respondió 5xx
 * (la base no contestó). NO cuenta un 401 (la sesión ya tiene su propio manejo), ni un 403 o 404 (puede ser legítimo
 * por rol) ni un 429 (el sondeo ya lo maneja): esos nunca muestran la pantalla de reintentar.
 */
export type ResultadoCarga = number | 'red'

export function esFalloDeConexion(resultado: ResultadoCarga): boolean {
  return resultado === 'red' || (typeof resultado === 'number' && resultado >= 500)
}

export function hayFalloDeConexion(resultados: ResultadoCarga[]): boolean {
  return resultados.some(esFalloDeConexion)
}

export const MENSAJE_ERROR_CONEXION = 'No se pudo cargar la información desde la base de datos. Revisa tu conexión e inténtalo de nuevo.'

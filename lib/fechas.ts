// Zona horaria del negocio. Si en algún momento queremos soportar
// otras zonas, este es el único punto a tocar (y/o leerlo desde
// `configuracion`). Hoy lo dejamos fijo para Chile porque toda la
// lógica de filtros en `lib/db.ts` ya usa 'America/Santiago'.
export const ZONA_HORARIA_NEGOCIO = 'America/Santiago'

/**
 * Devuelve la fecha "hoy" en formato `YYYY-MM-DD` interpretada en la
 * zona horaria del negocio. Hace falta porque
 * `new Date().toISOString().slice(0,10)` devuelve la fecha en UTC, y
 * eso introduce un off-by-one cuando el negocio opera de noche en una
 * zona con offset negativo (por ejemplo en Chile, una venta hecha a
 * las 21:30 del lunes en UTC ya es martes). Si filtramos los reportes
 * por la fecha UTC, ese pago no aparece en el reporte del lunes.
 *
 * Implementación: `Intl.DateTimeFormat` con `timeZone` aplica el
 * offset correcto (incluido horario de verano) y con `en-CA` ya
 * formatea como `YYYY-MM-DD`.
 */
export function fechaHoyZonaNegocio(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

/**
 * Normaliza un valor de fecha posiblemente con palabras clave
 * (`'hoy'`) o ISO largo a una fecha `YYYY-MM-DD`. Si no se puede
 * parsear, devuelve el fallback.
 */
export function normalizarFechaZonaNegocio(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback
  if (value === 'hoy') return fechaHoyZonaNegocio()
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : fallback
}

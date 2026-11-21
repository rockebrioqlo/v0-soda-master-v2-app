/**
 * Nombre personalizado de una mesa (sesión 15, #23). Módulo puro: lo usan los esquemas zod, `lib/db.ts` y las
 * pruebas.
 *
 * El nombre por defecto es "Mesa <número>" y NO se guarda (`mesas.nombre` queda en NULL). Un nombre personalizado se
 * guarda tal cual, con los espacios normalizados, y es único sin distinguir mayúsculas (índice único en la base).
 * Para que un nombre personalizado nunca choque con el nombre por defecto de una mesa (la actual, una creada después
 * o el máximo + 1 de `crearMesa`), los nombres con forma "mesa <número>" solo valen si ese número es el de la propia
 * mesa; en ese caso se guardan como NULL.
 */

/** Recorta los bordes y deja un solo espacio entre palabras (también convierte tabulaciones y espacios raros). */
export function normalizarNombreMesa(nombre: string): string {
  return nombre.replace(/\s+/g, ' ').trim()
}

/** Tope del número de mesa (el mismo del esquema zod de mesas). */
export const NUMERO_MESA_MAX = 9999

/**
 * Si el nombre tiene forma "mesa <número>" (sin distinguir mayúsculas, con o sin espacio, con ceros a la izquierda),
 * devuelve ese número; si no, `null`. Un número fuera de rango devuelve 0 (nunca es el de una mesa: rechazo seguro).
 */
export function numeroDeNombreReservado(nombre: string): number | null {
  const m = /^mesa ?(\d+)$/i.exec(normalizarNombreMesa(nombre))
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n >= 1 && n <= NUMERO_MESA_MAX ? n : 0
}

export const MENSAJE_NOMBRE_RESERVADO =
  'Los nombres con forma "Mesa <número>" son solo para la mesa con ese número. Usa otro nombre (por ejemplo "Terraza 1") o deja el nombre por defecto.'
export const MENSAJE_NOMBRE_DUPLICADO = 'Ya existe otra mesa con ese nombre (no se distinguen mayúsculas ni espacios de más).'
export const MENSAJE_NUMERO_DUPLICADO = 'Número de mesa ya existe'

/**
 * RUT chileno con Módulo 11 (sesión 18, K1). Módulo puro, sin acceso a la base, para probarlo solo
 * (`scripts/pruebas/arco.cjs` lo importa con el type stripping de Node).
 *
 * Dónde se aplica: `empleados.documento` y `proveedores.rut` (rutas `POST` y `PATCH`), mediante `resolverDocumento`.
 * Reglas (decididas el 21-11-2026):
 * - Un valor vacío es "vaciar el campo" (derecho de rectificación), no un error.
 * - Un RUT válido se guarda con el formato canónico `12.345.678-5` (dígito verificador `K` en mayúscula).
 * - El cliente puede marcar `documento_otro: true` (pasaporte o cédula extranjera): entonces se acepta cualquier texto,
 *   recortado. La casilla se usa solo al escribir; no se guarda (no hay columna nueva).
 * - Los datos antiguos no se bloquean: en un `PATCH`, si el valor que llega es el mismo que ya estaba guardado (el
 *   formulario reenvía todos los campos), no se valida. Solo se valida lo que cambia.
 */

/** Cuerpo de un RUT: 7 u 8 dígitos (de 1.000.000 a 99.999.999). */
const CUERPO = /^[1-9]\d{6,7}$/

/** Quita puntos, guiones y espacios y pasa a mayúsculas. `null` si no es un texto de la forma cuerpo + dígito. */
export function normalizarRut(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null
  const limpio = texto.replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return null
  return limpio
}

/** Dígito verificador (Módulo 11) del cuerpo: `0`, `1` a `9` o `K`. */
export function calcularDv(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const r = 11 - (suma % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

/** `true` si el texto es un RUT con su dígito verificador correcto. */
export function validarRut(texto: string | null | undefined): boolean {
  const n = normalizarRut(texto)
  if (!n) return false
  const cuerpo = n.slice(0, -1)
  return CUERPO.test(cuerpo) && calcularDv(cuerpo) === n.slice(-1)
}

/** `12345678-5` → `12.345.678-5` (no valida: úsese después de `validarRut`). */
export function formatearRut(texto: string): string {
  const n = normalizarRut(texto)
  if (!n) return texto
  const cuerpo = n.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cuerpo}-${n.slice(-1)}`
}

export type ResultadoDocumento = { ok: true; valor: string | null } | { ok: false; error: string }

/**
 * Qué se guarda en `documento`/`rut`.
 * - `nuevo`: lo que llegó (`''`, `null` o texto). `actual`: lo que hay guardado (para no bloquear datos antiguos).
 * - `otro`: el cliente marcó "otro documento" (pasaporte, extranjero).
 */
export function resolverDocumento(
  nuevo: string | null | undefined,
  actual: string | null | undefined,
  otro: boolean,
): ResultadoDocumento {
  const texto = typeof nuevo === 'string' ? nuevo.trim() : ''
  if (texto === '') return { ok: true, valor: null }
  if (otro) return { ok: true, valor: texto }
  const nNuevo = normalizarRut(texto)
  const nActual = normalizarRut(actual)
  // Sin cambio respecto de lo guardado (aunque sea un RUT antiguo inválido): no se bloquea ni se reescribe.
  if (typeof actual === 'string' && actual.trim() === texto) return { ok: true, valor: actual }
  if (nNuevo && nActual && nNuevo === nActual) return { ok: true, valor: actual ?? texto }
  if (validarRut(texto)) return { ok: true, valor: formatearRut(texto) }
  return { ok: false, error: 'RUT inválido: revisa el dígito verificador (si es pasaporte u otro documento, marca "Otro documento")' }
}

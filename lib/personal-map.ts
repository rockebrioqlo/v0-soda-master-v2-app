/**
 * Lo que la API devuelve de un empleado y de un proveedor (sesión 17, K1). Módulo puro, sin acceso a la
 * base, para poder probarlo solo (`scripts/pruebas/datos-personales.cjs` lo importa con el type stripping
 * de Node), igual que `usuario-map.ts`.
 *
 * LISTA BLANCA: el objeto sale con exactamente estos campos. Una columna nueva en la tabla (o un `SELECT *`)
 * no saca nada hacia afuera por defecto: hay que agregarla aquí a propósito, y en las columnas del SELECT
 * (`COLUMNAS_EMPLEADO` y `COLUMNAS_PROVEEDOR` son la fuente de ambas cosas).
 *
 * Vista básica (`?vista=basica`): solo `id`, `nombre` y `activo`, para las pestañas que únicamente
 * necesitan el nombre (Gastos, Compras, Activos). El detalle (documento, sueldo, teléfono, email, RUT,
 * contacto) solo lo piden Finanzas → Empleados y Proveedores.
 */

/** Campos de un empleado hacia afuera (los usa también la prueba). Orden = columnas del SELECT. */
export const COLUMNAS_EMPLEADO = [
  'id',
  'nombre',
  'cargo',
  'documento',
  'telefono',
  'email',
  'sueldo_base',
  'periodicidad',
  'fecha_ingreso',
  'fecha_egreso',
  'activo',
  'usuario_id',
  'notas',
  'created_at',
  'updated_at',
] as const

/** Campos de un proveedor hacia afuera (los usa también la prueba). Orden = columnas del SELECT. */
export const COLUMNAS_PROVEEDOR = [
  'id',
  'nombre',
  'rut',
  'contacto',
  'telefono',
  'email',
  'direccion',
  'notas',
  'activo',
  'created_at',
  'updated_at',
] as const

/** Campos de la vista básica. */
export const COLUMNAS_BASICAS = ['id', 'nombre', 'activo'] as const

export type VistaPersonal = 'basica' | 'detalle'

function recortar<K extends string>(row: any, campos: readonly K[]): Record<K, any> {
  const out = {} as Record<K, any>
  for (const c of campos) out[c] = row?.[c] ?? null
  return out
}

export function mapEmpleado(row: any) {
  return recortar(row, COLUMNAS_EMPLEADO)
}

export function mapProveedor(row: any) {
  return recortar(row, COLUMNAS_PROVEEDOR)
}

export function mapPersonalBasico(row: any) {
  return recortar(row, COLUMNAS_BASICAS)
}

/** Lista de columnas para un SELECT explícito (sin `SELECT *`). */
export function listaColumnas(campos: readonly string[], alias?: string): string {
  return campos.map((c) => (alias ? `${alias}.${c}` : c)).join(', ')
}

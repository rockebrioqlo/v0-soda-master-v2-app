/**
 * Reglas de `estado_item` por rol (sesión 13, F11) y estado de la orden según sus ítems (B5).
 *
 * Funciones puras. La ruta decide si el rol puede pedir un destino (403) y pasa a `lib/db.ts` los
 * estados de origen válidos; ahí se verifican DENTRO de la transacción, con la orden bloqueada,
 * contra el estado real del ítem (409 `TRANSICION_ITEM_INVALIDA`).
 *
 * Estado de la orden (lo calcula SIEMPRE el servidor, función SQL `soda_master.recalcular_estado_orden`,
 * con prioridad estricta: problema > en preparación > pendiente > listo):
 *   algún ítem en `problema`        → orden `problema`
 *   si no, alguno `en_preparacion`  → `en_preparacion`
 *   si no, alguno `pendiente`       → `en_cocina` (mezclado con listos también)
 *   si no, todos `entregado`        → `entregado`
 *   si no (listo, o listo y entregado) → `listo`
 * Solo se recalcula en órdenes con estado de cocina (`en_cocina`, `en_preparacion`, `listo`,
 * `entregado`, `problema`); una orden `pendiente` (sin enviar) o terminal no cambia, y una sin
 * ítems tampoco. El estado de pago de un ítem no cuenta: un ítem pagado por adelantado igual
 * tiene que prepararse.
 */
import type { RolApi } from './permisos-api'
import type { Estacion } from './estaciones'

export const ESTADOS_ITEM = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'problema'] as const
export type EstadoItem = (typeof ESTADOS_ITEM)[number]

type Matriz = Partial<Record<EstadoItem, readonly EstadoItem[]>>

/** Cocina y bar: preparan; no entregan ni devuelven un ítem a `pendiente`. */
const MATRIZ_COCINA: Matriz = {
  en_preparacion: ['pendiente', 'en_preparacion', 'listo', 'problema'],
  listo: ['pendiente', 'en_preparacion', 'listo', 'problema'],
  problema: ['pendiente', 'en_preparacion', 'problema'],
}

/** Mesero y cajero: solo entregan lo que cocina dejó listo. */
const MATRIZ_SALON: Matriz = {
  entregado: ['listo', 'entregado'],
}

/** Admin: cualquier corrección. */
const MATRIZ_ADMIN: Matriz = Object.fromEntries(
  ESTADOS_ITEM.map((d) => [d, ESTADOS_ITEM]),
) as Matriz

const MATRIZ_POR_ROL: Record<RolApi, Matriz> = {
  admin: MATRIZ_ADMIN,
  mesero: MATRIZ_SALON,
  cajero: MATRIZ_SALON,
  cocina: MATRIZ_COCINA,
  bar: MATRIZ_COCINA,
}

/**
 * Estados desde los que los roles dados pueden pasar un ítem a `destino` (unión si el usuario
 * tiene varios roles). `null` = ningún rol puede pedir ese destino (403).
 */
export function origenesPermitidos(
  roles: readonly RolApi[],
  destino: EstadoItem,
): EstadoItem[] | null {
  const union = new Set<EstadoItem>()
  let alguno = false
  for (const rol of roles) {
    const o = MATRIZ_POR_ROL[rol]?.[destino]
    if (o) {
      alguno = true
      for (const e of o) union.add(e)
    }
  }
  return alguno ? [...union] : null
}

/**
 * Estaciones cuyos ítems pueden mover los roles dados hacia `destino` (sesión 14.5a, F39).
 * admin, mesero y cajero (los que entregan o corrigen) mueven las dos; `cocina` solo la cocina y
 * `bar` solo el bar. Con roles mezclados cuenta solo el rol que concede ese destino: un usuario
 * cocina + mesero pasa a `listo` solo ítems de cocina, pero entrega los de las dos estaciones.
 * `null` = ningún rol concede el destino (el 403 de la matriz ya lo cubre).
 */
export function estacionesPermitidas(
  roles: readonly RolApi[],
  destino: EstadoItem,
): Estacion[] | null {
  const set = new Set<Estacion>()
  let alguno = false
  for (const rol of roles) {
    if (!MATRIZ_POR_ROL[rol]?.[destino]) continue
    alguno = true
    if (rol === 'cocina') set.add('cocina')
    else if (rol === 'bar') set.add('bar')
    else {
      set.add('cocina')
      set.add('bar')
    }
  }
  return alguno ? [...set] : null
}

/** Cantidad, extras, notas y modificadores solo se editan mientras cocina no haya empezado. */
export const ESTADOS_ITEM_EDITABLES: readonly EstadoItem[] = ['pendiente', 'problema']

/** Estados de la orden en los que el servidor recalcula el estado a partir de sus ítems. */
export const ESTADOS_ORDEN_COCINA = [
  'en_cocina',
  'en_preparacion',
  'listo',
  'entregado',
  'problema',
] as const

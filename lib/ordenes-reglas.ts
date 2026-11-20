/**
 * Reglas de órdenes por rol (sesión 6 del ROADMAP: R3, A7).
 *
 * Funciones puras: las usan la ruta `PATCH /api/ordenes` (quién puede pedir
 * qué cambio) y `lib/db.ts` (desde qué estados es válida cada transición,
 * verificado dentro del propio UPDATE para que sea atómico).
 *
 * Estados que NO se fijan desde el navegador:
 *  - `pagado`: lo pone el cobro (`crearPago`) al cerrar la orden.
 *  - `perdida`: la pone `registrarPerdida`.
 *  - `entregado`: lo calcula el servidor al entregar todos los ítems.
 * Las órdenes `pagado`, `cancelado` o `perdida` son registro histórico:
 * ningún rol las reabre ni las modifica.
 */
import type { RolApi } from './permisos-api'

export const ESTADOS_ACTIVOS = [
  'pendiente',
  'en_cocina',
  'en_preparacion',
  'listo',
  'entregado',
  'problema',
] as const

export const ESTADOS_TERMINALES = ['pagado', 'cancelado', 'perdida'] as const

/** Estados a los que se puede pedir pasar por `PATCH /api/ordenes`. */
export const DESTINOS_PATCH = [
  'en_cocina',
  'en_preparacion',
  'listo',
  'problema',
  'cancelado',
] as const

export type DestinoPatch = (typeof DESTINOS_PATCH)[number]

/** Desde qué estados es válida cada transición (incluye el propio destino: idempotente). */
export const ORIGENES_VALIDOS: Record<DestinoPatch, readonly string[]> = {
  // enviar a cocina / reenviar con ítems nuevos (también reabre una orden ya lista o entregada)
  en_cocina: ['pendiente', 'en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema'],
  // KDS
  en_preparacion: ['en_cocina', 'en_preparacion', 'listo', 'problema'],
  listo: ['en_cocina', 'en_preparacion', 'listo', 'problema'],
  problema: ['en_cocina', 'en_preparacion', 'listo', 'problema'],
  // solo admin, y solo sin ítems pagados (se verifica dentro de la transacción)
  cancelado: ['pendiente', 'en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema'],
}

const DESTINOS_POR_ROL: Record<RolApi, readonly DestinoPatch[]> = {
  admin: ['en_cocina', 'en_preparacion', 'listo', 'problema', 'cancelado'],
  mesero: ['en_cocina'],
  cajero: ['en_cocina'],
  cocina: ['en_preparacion', 'listo', 'problema'],
  bar: ['en_preparacion', 'listo', 'problema'],
}

const ROLES_NOTAS: readonly RolApi[] = ['admin', 'mesero', 'cajero']

export function puedeCambiarAEstado(roles: readonly RolApi[], destino: DestinoPatch): boolean {
  return roles.some((r) => DESTINOS_POR_ROL[r]?.includes(destino))
}

export function puedeEditarNotas(roles: readonly RolApi[]): boolean {
  return roles.some((r) => ROLES_NOTAS.includes(r))
}

export function esEstadoTerminal(estado: string): boolean {
  return (ESTADOS_TERMINALES as readonly string[]).includes(estado)
}

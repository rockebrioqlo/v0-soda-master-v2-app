/**
 * Estaciones de preparación (sesión 14.5a, F39). Fuente única de la clasificación cocina / bar:
 * la usan el servidor (validación dentro de `db.cambiarEstadoItems`) y el cliente (KDS, POS,
 * tickets), así no puede haber dos listas distintas. Módulo puro, sin dependencias.
 *
 * Un ítem es de BAR si la categoría de su producto está en `CATEGORIAS_BAR`; todo lo demás (y un
 * ítem cuyo producto ya no existe) es de COCINA.
 */

/** Categorías de producto que se enrutan a la estación BAR (las demás van a cocina). */
export const CATEGORIAS_BAR: readonly string[] = ['bebidas', 'cervezas', 'jugos_bebidas', 'tragos']

export type Estacion = 'cocina' | 'bar'

export const ESTACIONES: readonly Estacion[] = ['cocina', 'bar']

export function estacionDeCategoria(categoria: string | null | undefined): Estacion {
  return CATEGORIAS_BAR.includes(categoria || '') ? 'bar' : 'cocina'
}

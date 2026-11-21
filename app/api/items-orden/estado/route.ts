import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import {
  ItemsEstadoSchema,
  leerBody,
  respuestaDeError,
  respuestaDestinoItemProhibido,
} from '@/lib/ordenes-http'
import { estacionesPermitidas, origenesPermitidos } from '@/lib/items-reglas'

/**
 * POST /api/items-orden/estado   (sesión 13: B5, B6, F11)
 *
 * Cambia el `estado_item` de varios ítems de UNA orden en una sola transacción (todo o nada) y deja
 * el estado de la orden según el peor estado de sus ítems. Es el mismo código de
 * `PATCH /api/items-orden` con un ítem (`db.cambiarEstadoItems`). Una petición por acción del KDS,
 * en vez de una por ítem más una de la orden.
 *
 * - Roles: los de `lib/permisos-api.ts` (salón y cocina); qué destino puede pedir cada uno lo decide
 *   la matriz de `lib/items-reglas.ts` (403 ROL_SIN_PERMISO). Origen inválido → 409
 *   TRANSICION_ITEM_INVALIDA; ítem de otra orden → 400 ITEM_AJENO; orden o ítem inexistente → 404.
 * - Respuesta: `{ items, orden: { id, estado, estado_anterior } }`. `estado_anterior` permite que un
 *   solo cliente (el que produjo la transición a `listo`) avise al mesero.
 */
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ItemsEstadoSchema, 'Datos del cambio de estado')
    if (!parsed.ok) return parsed.respuesta
    const { orden_id, item_ids, estado_item } = parsed.datos
    const origenes = origenesPermitidos(s.usuario.roles, estado_item)
    if (!origenes) return respuestaDestinoItemProhibido(estado_item)
    // F39: la estación de cada ítem se verifica dentro de la transacción (403 ROL_SIN_PERMISO).
    const estaciones = estacionesPermitidas(s.usuario.roles, estado_item) ?? undefined
    const r = await db.cambiarEstadoItems({ orden_id, item_ids, estado_item, origenes, estaciones })
    return Response.json(r)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Cambiar estado de ítems error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

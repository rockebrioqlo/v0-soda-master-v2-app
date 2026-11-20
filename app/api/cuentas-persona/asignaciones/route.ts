import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'
import { AsignacionesSchema } from '@/lib/cuentas-http'

/**
 * Aplica un conjunto de asignaciones (item_orden -> persona, con cantidad)
 * en una sola transacción con la orden bloqueada (sesión 7, A2). El servidor
 * parte las líneas si la cantidad asignada es menor que la actual y verifica
 * que la orden esté activa, que las personas sean de ESA orden y que ningún
 * ítem esté pagado ni haya cambiado desde que se leyó; si algo falla, no
 * toca nada (400 / 404 / 409 con código).
 *
 * Body (`.strict()`):
 *   {
 *     orden_id: uuid,
 *     asignaciones: [
 *       { item_orden_id: uuid, cantidad: int, cuenta_persona_id: uuid | null }
 *     ]
 *   }
 */
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const v = await leerBody(request, AsignacionesSchema, 'Asignaciones')
    if (!v.ok) return v.respuesta
    await db.aplicarAsignacionesCuentas({
      orden_id: v.datos.orden_id,
      asignaciones: v.datos.asignaciones,
    })
    return Response.json({ ok: true })
  } catch (error: any) {
    const r = respuestaDeError(error)
    if (r) return r
    console.error('POST /api/cuentas-persona/asignaciones error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

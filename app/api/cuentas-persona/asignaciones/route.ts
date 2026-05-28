import { db } from '@/lib/db'

/**
 * Aplica un conjunto de asignaciones (item_orden -> persona, con cantidad)
 * en una sola transacción. El servidor splittea items si la cantidad
 * asignada es menor que la cantidad actual.
 *
 * Body:
 *   {
 *     orden_id: string,
 *     asignaciones: [
 *       { item_orden_id, cantidad, cuenta_persona_id | null }
 *     ]
 *   }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ordenId = body?.orden_id || body?.ordenId
    if (!ordenId || typeof ordenId !== 'string') {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const asignacionesRaw = body?.asignaciones
    if (!Array.isArray(asignacionesRaw)) {
      return Response.json({ error: 'asignaciones requerido (arreglo)' }, { status: 400 })
    }
    const asignaciones = asignacionesRaw
      .map((a: any) => ({
        item_orden_id: typeof a?.item_orden_id === 'string' ? a.item_orden_id : '',
        cantidad: Number(a?.cantidad) || 0,
        cuenta_persona_id:
          typeof a?.cuenta_persona_id === 'string' && a.cuenta_persona_id.length > 0
            ? a.cuenta_persona_id
            : null,
      }))
      .filter((a) => a.item_orden_id && a.cantidad > 0)
    await db.aplicarAsignacionesCuentas({
      orden_id: ordenId,
      asignaciones,
    })
    return Response.json({ ok: true })
  } catch (error: any) {
    console.error('POST /api/cuentas-persona/asignaciones error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

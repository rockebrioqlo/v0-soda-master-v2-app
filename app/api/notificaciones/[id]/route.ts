import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * PATCH /api/notificaciones/[id]
 *
 * Body: { vista: true }
 *
 * Marca una notificación como vista para que no se siga reentregando
 * en el polling. Acepta sólo `vista: true` por ahora (no permitimos
 * "des-marcar" desde el cliente).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    if (body?.vista !== true) {
      return Response.json({ error: 'Solo se admite { vista: true }' }, { status: 400 })
    }
    const updated = await db.marcarNotificacionVista(id)
    return Response.json({ id, vista: true, actualizado: updated })
  } catch (error) {
    console.error('[PATCH /api/notificaciones/[id]] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

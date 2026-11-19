import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

const CONSECUENCIAS = new Set<string>(['descuento_liquidacion', 'solo_registro', 'amonestacion'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Solo admin, según la sesión (ya no se acepta `usuario_id` del body).
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta

    const updates: { responsable_id?: string | null; consecuencia?: string | null; monto_descuento?: number } = {}
    if (body.responsable_id !== undefined) {
      updates.responsable_id = body.responsable_id ? String(body.responsable_id) : null
    }
    if (body.consecuencia !== undefined) {
      if (body.consecuencia && !CONSECUENCIAS.has(String(body.consecuencia))) {
        return Response.json({ error: 'Consecuencia inválida' }, { status: 400 })
      }
      updates.consecuencia = body.consecuencia ? String(body.consecuencia) : null
    }
    if (body.monto_descuento !== undefined) {
      const n = Number(body.monto_descuento)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'monto_descuento inválido' }, { status: 400 })
      }
      updates.monto_descuento = n
    }
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Sin campos a actualizar' }, { status: 400 })
    }

    const merma = await db.actualizarMerma(id, updates)
    if (!merma) {
      return Response.json({ error: 'Merma no encontrada' }, { status: 404 })
    }
    return Response.json(merma)
  } catch (error) {
    console.error('Patch merma error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

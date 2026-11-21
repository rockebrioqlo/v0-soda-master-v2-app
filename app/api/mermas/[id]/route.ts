import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'
import { MermaPatchSchema } from '@/lib/mermas-http'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Solo admin, según la sesión (ya no se acepta `usuario_id` del body).
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const id = p.datos.id
    const parsed = await leerBody(request, MermaPatchSchema, 'Datos de la merma')
    if (!parsed.ok) return parsed.respuesta
    const updates: { responsable_id?: string | null; consecuencia?: string | null; monto_descuento?: number } = {}
    if (parsed.datos.responsable_id !== undefined) updates.responsable_id = parsed.datos.responsable_id
    if (parsed.datos.consecuencia !== undefined) updates.consecuencia = parsed.datos.consecuencia
    if (parsed.datos.monto_descuento !== undefined) updates.monto_descuento = parsed.datos.monto_descuento

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

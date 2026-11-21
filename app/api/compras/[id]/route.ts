import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const detalle = await db.getCompraDetalle(p.datos.id)
    if (!detalle) {
      return Response.json({ error: 'Compra no encontrada' }, { status: 404 })
    }
    return Response.json(detalle)
  } catch (error) {
    console.error('GET compra detalle error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

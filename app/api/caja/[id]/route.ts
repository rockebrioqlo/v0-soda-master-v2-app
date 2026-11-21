import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

// GET /api/caja/:id — detalle de UNA caja específica con sus movimientos
// y resumen. Útil para mostrar el detalle de una caja ya cerrada en el
// historial.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(context.params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const detalle = await db.getCajaConResumen(p.datos.id)
    if (!detalle) {
      return Response.json({ error: 'Caja no encontrada' }, { status: 404 })
    }
    return Response.json(detalle)
  } catch (error: any) {
    console.error('GET /api/caja/:id error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

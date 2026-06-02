import { db } from '@/lib/db'

// GET /api/caja/:id — detalle de UNA caja específica con sus movimientos
// y resumen. Útil para mostrar el detalle de una caja ya cerrada en el
// historial.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const detalle = await db.getCajaConResumen(id)
    if (!detalle) {
      return Response.json({ error: 'Caja no encontrada' }, { status: 404 })
    }
    return Response.json(detalle)
  } catch (error: any) {
    console.error('GET /api/caja/:id error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

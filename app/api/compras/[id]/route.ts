import { db } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const detalle = await db.getCompraDetalle(id)
    if (!detalle) {
      return Response.json({ error: 'Compra no encontrada' }, { status: 404 })
    }
    return Response.json(detalle)
  } catch (error) {
    console.error('GET compra detalle error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

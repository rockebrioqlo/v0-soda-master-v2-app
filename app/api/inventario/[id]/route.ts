import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { cantidad, stock_actual, stock_minimo, unidad_medida } = await request.json()
    const unidad = typeof unidad_medida === 'string' ? unidad_medida.trim() : undefined
    if (unidad_medida !== undefined && !unidad) {
      return Response.json({ error: 'unidad_medida requerida' }, { status: 400 })
    }
    const inventario = await db.actualizarInventario(id, {
      stock_actual: stock_actual ?? cantidad,
      stock_minimo,
      unidad_medida: unidad,
    })
    return Response.json(inventario)
  } catch (error) {
    console.error('Update inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

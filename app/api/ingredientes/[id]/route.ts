import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json()
    const updates: Record<string, unknown> = {}
    if (body.nombre !== undefined) updates.nombre = String(body.nombre)
    if (body.categoria !== undefined) updates.categoria = String(body.categoria)
    if (body.unidad_medida !== undefined) updates.unidad_medida = String(body.unidad_medida)
    if (body.stock_actual !== undefined) updates.stock_actual = Number(body.stock_actual)
    if (body.stock_minimo !== undefined) updates.stock_minimo = Number(body.stock_minimo)
    if (body.costo_unitario !== undefined) updates.costo_unitario = Number(body.costo_unitario)
    if (body.tipo !== undefined && ['comida', 'negocio', 'otro'].includes(body.tipo)) {
      updates.tipo = body.tipo
    }
    if (body.activo !== undefined) updates.activo = !!body.activo

    const row = await db.actualizarIngrediente(id, updates as any)
    if (!row) return Response.json({ error: 'Ingrediente no encontrado' }, { status: 404 })
    return Response.json(row)
  } catch (error) {
    console.error('PATCH ingrediente error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

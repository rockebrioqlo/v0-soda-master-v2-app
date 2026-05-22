import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    if (typeof body.nombre === 'string') updates.nombre = body.nombre
    if (typeof body.descripcion === 'string') updates.descripcion = body.descripcion
    if (body.precio !== undefined) {
      const n = Number(body.precio)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'precio inválido' }, { status: 400 })
      }
      updates.precio = n
    }
    if (typeof body.categoria === 'string') updates.categoria = body.categoria
    if (typeof body.activo === 'boolean') updates.activo = body.activo
    if (body.es_ingrediente_especial !== undefined || body.esIngredienteEspecial !== undefined) {
      updates.esIngredienteEspecial = !!(body.es_ingrediente_especial ?? body.esIngredienteEspecial)
    }
    if (body.costo_adicional !== undefined || body.costoAdicional !== undefined) {
      const raw = body.costo_adicional ?? body.costoAdicional
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'costo_adicional inválido' }, { status: 400 })
      }
      updates.costoAdicional = n
    }
    if (typeof body.imagen_url === 'string') updates.imagen_url = body.imagen_url

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Sin campos a actualizar' }, { status: 400 })
    }

    const updated = await db.actualizarProducto(id, updates as any)
    if (!updated) {
      return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('Patch producto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

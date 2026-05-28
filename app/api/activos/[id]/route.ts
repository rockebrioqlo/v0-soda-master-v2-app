import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const updated = await db.actualizarActivo(id, {
      nombre: typeof body.nombre === 'string' ? body.nombre : undefined,
      categoria: typeof body.categoria === 'string' ? body.categoria : undefined,
      descripcion: typeof body.descripcion === 'string' ? body.descripcion : undefined,
      fecha_compra: typeof body.fecha_compra === 'string' ? body.fecha_compra : undefined,
      costo_compra: body.costo_compra !== undefined ? Number(body.costo_compra) : undefined,
      vida_util_meses:
        body.vida_util_meses !== undefined ? Number(body.vida_util_meses) : undefined,
      valor_residual: body.valor_residual !== undefined ? Number(body.valor_residual) : undefined,
      metodo_depreciacion:
        typeof body.metodo_depreciacion === 'string' ? body.metodo_depreciacion : undefined,
      proveedor_id: body.proveedor_id ?? undefined,
      ubicacion: typeof body.ubicacion === 'string' ? body.ubicacion : undefined,
      numero_serie: typeof body.numero_serie === 'string' ? body.numero_serie : undefined,
      estado: typeof body.estado === 'string' ? body.estado : undefined,
      notas: typeof body.notas === 'string' ? body.notas : undefined,
    })
    if (!updated) {
      return Response.json({ error: 'Activo no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH activo error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await db.eliminarActivo(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE activo error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    const mesa = await db.actualizarMesa(id, updates)
    if (!mesa) {
      return Response.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }
    return Response.json(mesa)
  } catch (error) {
    console.error('Update mesa error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ok = await db.eliminarMesa(id)
    if (!ok) {
      return Response.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (error: any) {
    console.error('Delete mesa error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('foreign key')) {
      return Response.json(
        { error: 'No se puede eliminar: la mesa tiene órdenes asociadas' },
        { status: 409 }
      )
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

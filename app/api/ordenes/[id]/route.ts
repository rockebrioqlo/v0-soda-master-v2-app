import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    const orden = await db.actualizarOrden(id, updates)
    return Response.json(orden)
  } catch (error) {
    console.error('Update orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

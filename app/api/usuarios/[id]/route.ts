import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    const usuario = await db.actualizarUsuario(id, updates)
    if (!usuario) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    return Response.json(usuario)
  } catch (error) {
    console.error('Update usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ok = await db.eliminarUsuario(id)
    if (!ok) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

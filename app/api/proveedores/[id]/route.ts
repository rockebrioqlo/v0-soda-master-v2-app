import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const updated = await db.actualizarProveedor(id, {
      nombre: typeof body.nombre === 'string' ? body.nombre : undefined,
      rut: typeof body.rut === 'string' ? body.rut : undefined,
      contacto: typeof body.contacto === 'string' ? body.contacto : undefined,
      telefono: typeof body.telefono === 'string' ? body.telefono : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      direccion: typeof body.direccion === 'string' ? body.direccion : undefined,
      notas: typeof body.notas === 'string' ? body.notas : undefined,
      activo: typeof body.activo === 'boolean' ? body.activo : undefined,
    })
    if (!updated) {
      return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH proveedor error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

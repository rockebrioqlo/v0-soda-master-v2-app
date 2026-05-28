import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const updated = await db.actualizarEmpleado(id, {
      nombre: typeof body.nombre === 'string' ? body.nombre : undefined,
      cargo: typeof body.cargo === 'string' ? body.cargo : undefined,
      documento: typeof body.documento === 'string' ? body.documento : undefined,
      telefono: typeof body.telefono === 'string' ? body.telefono : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      sueldo_base: body.sueldo_base !== undefined ? Number(body.sueldo_base) : undefined,
      periodicidad: typeof body.periodicidad === 'string' ? body.periodicidad : undefined,
      fecha_ingreso: typeof body.fecha_ingreso === 'string' ? body.fecha_ingreso : undefined,
      fecha_egreso: typeof body.fecha_egreso === 'string' ? body.fecha_egreso : undefined,
      activo: typeof body.activo === 'boolean' ? body.activo : undefined,
      usuario_id: body.usuario_id ?? undefined,
      notas: typeof body.notas === 'string' ? body.notas : undefined,
    })
    if (!updated) {
      return Response.json({ error: 'Empleado no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH empleado error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

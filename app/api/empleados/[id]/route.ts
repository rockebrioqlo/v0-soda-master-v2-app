import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { EmpleadoPatchSchema } from '@/lib/finanzas-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, EmpleadoPatchSchema, 'Datos del empleado')
    if (!parsed.ok) return parsed.respuesta
    const body = parsed.datos
    const updated = await db.actualizarEmpleado(p.datos.id, {
      nombre: body.nombre,
      cargo: body.cargo ?? undefined,
      documento: body.documento ?? undefined,
      telefono: body.telefono ?? undefined,
      email: body.email ?? undefined,
      sueldo_base: body.sueldo_base,
      periodicidad: body.periodicidad,
      fecha_ingreso: body.fecha_ingreso ?? undefined,
      fecha_egreso: body.fecha_egreso ?? undefined,
      activo: body.activo,
      notas: body.notas ?? undefined,
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

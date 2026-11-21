import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { EmpleadoSchema } from '@/lib/finanzas-http'
import { booleanoConsulta, leerBody, leerConsulta } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, z.object({ incluir_inactivos: booleanoConsulta.optional() }).strict())
    if (!q.ok) return q.respuesta
    const data = await db.getEmpleados(q.datos.incluir_inactivos !== 'true')
    return Response.json(data)
  } catch (error) {
    console.error('GET empleados error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, EmpleadoSchema, 'Datos del empleado')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const row = await db.crearEmpleado({
      nombre: d.nombre,
      cargo: d.cargo ?? undefined,
      documento: d.documento ?? undefined,
      telefono: d.telefono ?? undefined,
      email: d.email ?? undefined,
      sueldo_base: d.sueldo_base,
      periodicidad: d.periodicidad || 'mensual',
      fecha_ingreso: d.fecha_ingreso ?? undefined,
      usuario_id: null,
      notas: d.notas ?? undefined,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST empleados error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

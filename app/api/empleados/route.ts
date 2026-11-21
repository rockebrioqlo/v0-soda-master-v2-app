import { z } from 'zod'
import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { EmpleadoSchema } from '@/lib/finanzas-http'
import { leerConAuditoria } from '@/lib/auditoria-datos'
import { booleanoConsulta, leerBody, leerConsulta } from '@/lib/validacion-http'

const ConsultaSchema = z
  .object({
    incluir_inactivos: booleanoConsulta.optional(),
    // Sesión 17 (K1): `basica` = id, nombre y activo (Gastos); sin parámetro, el detalle (solo Finanzas → Empleados).
    vista: z.enum(['basica', 'detalle']).optional(),
  })
  .strict()

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, ConsultaSchema)
    if (!q.ok) return q.respuesta
    const soloActivos = q.datos.incluir_inactivos !== 'true'
    if (q.datos.vista === 'basica') {
      return Response.json(await db.getEmpleados(soloActivos, 'basica'))
    }
    // Detalle (documento, sueldo, teléfono, email): una entrada de auditoría por consulta, con la cantidad de
    // filas. Si el registro falla solo se anota en el log y la respuesta sigue.
    const data = await leerConAuditoria(
      () => db.getEmpleados(soloActivos, 'detalle'),
      (filas) => db.registrarAccesoDatosPersonales({ actor: actorDe(s.usuario), entidad: 'empleado', filas: filas.length }),
    )
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
    // El alta y su entrada de auditoría van en un solo statement: si el registro falla, no se crea (500).
    const row = await db.crearEmpleado(
      {
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
      },
      actorDe(s.usuario),
    )
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST empleados error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

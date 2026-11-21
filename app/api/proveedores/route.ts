import { z } from 'zod'
import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { ProveedorSchema } from '@/lib/finanzas-http'
import { leerConAuditoria } from '@/lib/auditoria-datos'
import { booleanoConsulta, leerBody, leerConsulta } from '@/lib/validacion-http'

const ConsultaSchema = z
  .object({
    incluir_inactivos: booleanoConsulta.optional(),
    // Sesión 17 (K1): `basica` = id, nombre y activo (Gastos, Compras, Activos); sin parámetro, el detalle (solo Finanzas → Proveedores).
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
      return Response.json(await db.getProveedores(soloActivos, 'basica'))
    }
    // Detalle (RUT, contacto, teléfono, email): una entrada de auditoría por consulta, con la cantidad de
    // filas. Si el registro falla solo se anota en el log y la respuesta sigue.
    const data = await leerConAuditoria(
      () => db.getProveedores(soloActivos, 'detalle'),
      (filas) => db.registrarAccesoDatosPersonales({ actor: actorDe(s.usuario), entidad: 'proveedor', filas: filas.length }),
    )
    return Response.json(data)
  } catch (error) {
    console.error('GET proveedores error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ProveedorSchema, 'Datos del proveedor')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    // El alta y su entrada de auditoría van en un solo statement: si el registro falla, no se crea (500).
    const row = await db.crearProveedor(
      {
        nombre: d.nombre,
        rut: d.rut || undefined,
        contacto: d.contacto || undefined,
        telefono: d.telefono || undefined,
        email: d.email || undefined,
        direccion: d.direccion || undefined,
        notas: d.notas || undefined,
      },
      actorDe(s.usuario),
    )
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST proveedores error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

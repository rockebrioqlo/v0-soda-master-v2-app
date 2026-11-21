import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ProveedorPatchSchema } from '@/lib/finanzas-http'
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
    const parsed = await leerBody(request, ProveedorPatchSchema, 'Datos del proveedor')
    if (!parsed.ok) return parsed.respuesta
    const body = parsed.datos
    const updated = await db.actualizarProveedor(p.datos.id, {
      nombre: body.nombre,
      rut: body.rut ?? undefined,
      contacto: body.contacto ?? undefined,
      telefono: body.telefono ?? undefined,
      email: body.email ?? undefined,
      direccion: body.direccion ?? undefined,
      notas: body.notas ?? undefined,
      activo: body.activo,
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

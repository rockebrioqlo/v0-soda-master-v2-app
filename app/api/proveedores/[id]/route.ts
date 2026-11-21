import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { ProveedorPatchSchema } from '@/lib/finanzas-http'
import { leerConAuditoria } from '@/lib/auditoria-datos'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

/** Detalle de un proveedor (sesión 17, K1): solo admin; cada apertura deja una entrada `ver_datos_personales`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const proveedor = await leerConAuditoria(
      () => db.getProveedorById(p.datos.id),
      (r) =>
        r
          ? db.registrarAccesoDatosPersonales({ actor: actorDe(s.usuario), entidad: 'proveedor', entidadId: r.id, entidadNombre: r.nombre })
          : Promise.resolve(),
    )
    if (!proveedor) {
      return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }
    return Response.json(proveedor)
  } catch (error) {
    console.error('GET proveedor error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

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
    // El cambio y su entrada de auditoría (modificar y/o desactivar) van en un solo statement: si el registro
    // falla, el cambio se revierte (500).
    const updated = await db.actualizarProveedor(
      p.datos.id,
      {
        nombre: body.nombre,
        rut: body.rut ?? undefined,
        contacto: body.contacto ?? undefined,
        telefono: body.telefono ?? undefined,
        email: body.email ?? undefined,
        direccion: body.direccion ?? undefined,
        notas: body.notas ?? undefined,
        activo: body.activo,
      },
      actorDe(s.usuario),
    )
    if (!updated) {
      return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH proveedor error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

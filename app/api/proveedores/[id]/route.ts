import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { ProveedorPatchSchema, resolverCampoDocumento } from '@/lib/finanzas-http'
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
    const { documento_otro, ...body } = parsed.datos
    // Rectificación (sesión 18): solo las claves que el cliente mandó. Ausente = no se toca; `null` o vacío = se vacía el campo.
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as Parameters<typeof db.actualizarProveedor>[1]
    if (body.rut !== undefined) {
      const actual = await db.getProveedorById(p.datos.id)
      if (!actual) return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
      const doc = resolverCampoDocumento(body.rut, actual.rut, documento_otro)
      if (!doc.ok) return doc.respuesta
      if (doc.incluir) patch.rut = doc.valor
    }
    // El cambio y su entrada de auditoría (modificar y/o desactivar) van en un solo statement: si el registro
    // falla, el cambio se revierte (500).
    const updated = await db.actualizarProveedor(p.datos.id, patch, actorDe(s.usuario))
    if (!updated) {
      return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH proveedor error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ActivoPatchSchema } from '@/lib/finanzas-http'
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
    const parsed = await leerBody(request, ActivoPatchSchema, 'Datos del activo')
    if (!parsed.ok) return parsed.respuesta
    const body = parsed.datos
    const updated = await db.actualizarActivo(p.datos.id, {
      nombre: body.nombre,
      categoria: body.categoria,
      descripcion: body.descripcion ?? undefined,
      fecha_compra: body.fecha_compra,
      costo_compra: body.costo_compra,
      vida_util_meses: body.vida_util_meses,
      valor_residual: body.valor_residual,
      metodo_depreciacion: body.metodo_depreciacion,
      proveedor_id: body.proveedor_id ?? undefined,
      ubicacion: body.ubicacion ?? undefined,
      numero_serie: body.numero_serie ?? undefined,
      estado: body.estado,
      notas: body.notas ?? undefined,
    })
    if (!updated) {
      return Response.json({ error: 'Activo no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('PATCH activo error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    await db.eliminarActivo(p.datos.id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE activo error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

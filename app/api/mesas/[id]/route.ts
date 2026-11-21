import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { MesaPatchPorIdSchema } from '@/lib/catalogo-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

// Esta ruta (por id) queda solo para el admin en la tabla del proxy; salón cambia el estado por PATCH /api/mesas.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, MesaPatchPorIdSchema, 'Datos de la mesa')
    if (!parsed.ok) return parsed.respuesta
    const mesa = await db.actualizarMesa(p.datos.id, { ...parsed.datos, area: parsed.datos.area ?? undefined })
    if (!mesa) {
      return Response.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }
    return Response.json(mesa)
  } catch (error) {
    console.error('Update mesa error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const ok = await db.eliminarMesa(p.datos.id)
    if (!ok) {
      return Response.json({ error: 'Mesa no encontrada' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (error: any) {
    console.error('Delete mesa error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('foreign key')) {
      return Response.json(
        { error: 'No se puede eliminar: la mesa tiene órdenes asociadas' },
        { status: 409 }
      )
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

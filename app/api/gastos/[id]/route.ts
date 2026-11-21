import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    await db.eliminarGasto(p.datos.id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE gasto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { respuestaErrorArco } from '@/lib/arco-http'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

/**
 * Exporta los datos del titular de una solicitud de acceso o de portabilidad (solo admin). La entrada "exportar" de la
 * auditoría se registra ANTES de leer: si falla, responde 500 y no entrega nada. Otro tipo de solicitud: 409.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const datos = await db.exportarSolicitudArco(p.datos.id, actorDe(s.usuario))
    return Response.json(datos, {
      headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="solicitud-${p.datos.id}.json"` },
    })
  } catch (error) {
    const r = respuestaErrorArco(error)
    if (r) return r
    console.error('GET arco/solicitudes/[id]/exportar error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

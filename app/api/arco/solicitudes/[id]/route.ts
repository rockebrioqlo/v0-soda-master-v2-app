import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { conRespuestaSugerida } from '@/lib/arco-http'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

/** Una solicitud, con el texto sugerido de respuesta cuando ya tiene resultado (borrador para revisión legal). Solo admin. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const fila = await db.getSolicitudArco(p.datos.id)
    if (!fila) return Response.json({ error: 'La solicitud no existe', codigo: 'SOLICITUD_NO_ENCONTRADA' }, { status: 404 })
    return Response.json(conRespuestaSugerida(fila))
  } catch (error) {
    console.error('GET arco/solicitudes/[id] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

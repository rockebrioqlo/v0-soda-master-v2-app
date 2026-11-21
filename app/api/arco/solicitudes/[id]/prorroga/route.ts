import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { ProrrogaSchema, respuestaErrorArco } from '@/lib/arco-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

/**
 * Prórroga ÚNICA de 30 días corridos, con motivo (solo admin). Solo una solicitud pendiente y antes de vencer; la segunda
 * prórroga da 409 `PRORROGA_YA_USADA` (atómico: dos prórrogas simultáneas aplican solo una). El motivo no queda en la auditoría.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, ProrrogaSchema, 'Prórroga')
    if (!parsed.ok) return parsed.respuesta
    const fila = await db.prorrogarSolicitudArco(p.datos.id, parsed.datos.motivo, actorDe(s.usuario))
    return Response.json(fila)
  } catch (error) {
    const r = respuestaErrorArco(error)
    if (r) return r
    console.error('POST arco/solicitudes/[id]/prorroga error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

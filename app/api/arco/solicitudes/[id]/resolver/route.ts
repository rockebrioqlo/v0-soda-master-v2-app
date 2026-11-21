import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { ResolverSchema, respuestaErrorArco } from '@/lib/arco-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

/**
 * Resuelve una solicitud (solo admin): acceso, portabilidad, rectificación y oposición se dan por atendidas; cualquiera se
 * puede rechazar con un motivo. Una supresión no se da por atendida aquí (409 `USAR_SUPRIMIR`): hay que anonimizar.
 * La entrada de auditoría lleva el id, el tipo y el resultado, nunca el texto de la respuesta.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, ResolverSchema, 'Resolución')
    if (!parsed.ok) return parsed.respuesta
    const fila = await db.resolverSolicitudArco(p.datos.id, parsed.datos.resultado, parsed.datos.respuesta, actorDe(s.usuario))
    return Response.json(fila)
  } catch (error) {
    const r = respuestaErrorArco(error)
    if (r) return r
    console.error('POST arco/solicitudes/[id]/resolver error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

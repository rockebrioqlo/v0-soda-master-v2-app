import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { SolicitudNuevaSchema, SolicitudesConsultaSchema, respuestaErrorArco } from '@/lib/arco-http'
import { leerBody, leerConsulta } from '@/lib/validacion-http'

/** Lista de solicitudes de derechos ARCOP (solo admin): las pendientes primero, con los días que les quedan. */
export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, SolicitudesConsultaSchema)
    if (!q.ok) return q.respuesta
    const filas = await db.listarSolicitudesArco({ estado: q.datos.estado, limite: q.datos.limite })
    return Response.json(filas)
  } catch (error) {
    console.error('GET arco/solicitudes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

/**
 * Ingresa una solicitud (solo admin). `vence_en` (ingreso + 30 días corridos), el estado y quién la ingresó los decide el
 * servidor. 404 si el titular no existe; 409 si ya hay una igual pendiente. Deja una entrada en la auditoría (sin valores).
 */
export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, SolicitudNuevaSchema, 'Solicitud')
    if (!parsed.ok) return parsed.respuesta
    const fila = await db.crearSolicitudArco({ ...parsed.datos, actor: actorDe(s.usuario) })
    return Response.json(fila, { status: 201 })
  } catch (error) {
    const r = respuestaErrorArco(error)
    if (r) return r
    console.error('POST arco/solicitudes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { requireAcceso, requireSesion } from '@/lib/sesion'
import { NotificacionConsultaSchema, NotificacionPostSchema } from '@/lib/catalogo-http'
import { leerBody, leerConsulta } from '@/lib/validacion-http'

/**
 * GET /api/notificaciones?solo_pendientes=true&limite=100
 *
 * Devuelve las notificaciones para un usuario y/o rol. Diseñado para
 * polling ligero del cliente: por defecto sólo devuelve las pendientes
 * (vista=false) ordenadas por fecha descendente.
 */
export async function GET(request: Request) {
  try {
    // Solo las notificaciones del usuario de la sesión y de su rol (usuario_id y rol de la URL se rechazan: 400).
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, NotificacionConsultaSchema)
    if (!q.ok) return q.respuesta
    const usuario_id = s.usuario.id
    const rol = s.usuario.rol

    const solo_pendientes_raw = q.datos.solo_pendientes
    const solo_pendientes = solo_pendientes_raw === undefined
      ? true
      : !(solo_pendientes_raw === 'false' || solo_pendientes_raw === '0')

    const limite = q.datos.limite ?? 100

    const data = await db.listarNotificacionesPara({
      usuario_id,
      rol,
      solo_pendientes,
      limite,
    })
    return Response.json(data, {
      // El polling no debe cachearse en intermediarios
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('[GET /api/notificaciones] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

/**
 * POST /api/notificaciones
 *
 * Body: { tipo, orden_id?, mesa_nombre?, mensaje, destinatario_usuario_id?, destinatario_rol? }
 *
 * Crea una notificación dirigida a un usuario específico o a todos los
 * usuarios de un rol. Se valida que `tipo` sea uno de los permitidos y
 * que exista al menos un destinatario.
 */
export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, NotificacionPostSchema, 'Datos de la notificación')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos

    const row = await db.crearNotificacion({
      tipo: d.tipo,
      orden_id: d.orden_id ?? null,
      mesa_nombre: d.mesa_nombre ?? null,
      mensaje: d.mensaje,
      destinatario_usuario_id: d.destinatario_usuario_id ?? null,
      destinatario_rol: d.destinatario_rol ?? null,
    })

    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('[POST /api/notificaciones] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

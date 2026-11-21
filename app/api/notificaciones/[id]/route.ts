import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso } from '@/lib/sesion'
import { NotificacionPatchSchema } from '@/lib/catalogo-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

/**
 * PATCH /api/notificaciones/[id]
 *
 * Body: { vista: true }
 *
 * Marca una notificación como vista para que no se siga reentregando
 * en el polling. Acepta sólo `vista: true` por ahora (no permitimos
 * "des-marcar" desde el cliente). Solo la marca su destinatario (el usuario, o un usuario con ese
 * rol: la misma regla con la que el sondeo se la entrega) o un admin; otro usuario → 403 (sesión 14.5b-1).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(context.params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, NotificacionPatchSchema, 'Datos de la notificación')
    if (!parsed.ok) return parsed.respuesta
    const id = p.datos.id

    const destino = await db.getDestinatarioNotificacion(id)
    if (!destino) {
      return Response.json({ error: 'Notificación no encontrada', codigo: 'NOTIFICACION_NO_ENCONTRADA' }, { status: 404 })
    }
    const esDestinatario =
      destino.destinatario_usuario_id === s.usuario.id ||
      (destino.destinatario_rol !== null && destino.destinatario_rol === s.usuario.rol)
    if (!esDestinatario && !esAdminSesion(s.usuario)) {
      return Response.json(
        { error: 'Esta notificación es de otro usuario.', codigo: 'NOTIFICACION_AJENA' },
        { status: 403 },
      )
    }
    const updated = await db.marcarNotificacionVista(id)
    return Response.json({ id, vista: true, actualizado: updated })
  } catch (error) {
    console.error('[PATCH /api/notificaciones/[id]] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

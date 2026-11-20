/**
 * Lógica de `PATCH /api/ordenes` (y de la ruta `/api/ordenes/[id]`, que la
 * comparte): allowlist de campos, rol y transición de estado (sesión 6:
 * R3/A7). El usuario sale de la sesión, nunca del body.
 */
import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { OrdenPatchSchema, respuestaDeError, validarBody } from '@/lib/ordenes-http'
import { puedeCambiarAEstado, puedeEditarNotas } from '@/lib/ordenes-reglas'

export async function manejarPatchOrden(
  request: Request,
  completarBody?: (body: any) => any,
): Promise<Response> {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta

    // El body se lee una sola vez; `completarBody` agrega el id de la ruta [id].
    const crudo = await request.json().catch(() => null)
    const cuerpo = completarBody && crudo && typeof crudo === 'object' ? completarBody(crudo) : crudo
    const parsed = validarBody(cuerpo, OrdenPatchSchema, 'Datos de la orden')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos

    if (d.action && d.estado && d.estado !== 'en_cocina') {
      return Response.json(
        { error: 'La acción enviar_cocina no admite otro estado.', codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    const destino = d.action === 'enviar_cocina' ? 'en_cocina' : d.estado
    if (!destino && d.notas === undefined) {
      return Response.json({ error: 'No hay nada que cambiar.', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
    }

    const roles = s.usuario.roles
    if (destino && !puedeCambiarAEstado(roles, destino)) {
      return Response.json(
        {
          error:
            destino === 'cancelado'
              ? 'Solo el administrador puede cancelar una orden.'
              : `Tu rol no puede pasar una orden a "${destino}".`,
          codigo: 'ROL_SIN_PERMISO',
        },
        { status: 403 },
      )
    }
    if (d.notas !== undefined && !puedeEditarNotas(roles)) {
      return Response.json(
        { error: 'Tu rol no puede editar las notas de la orden.', codigo: 'ROL_SIN_PERMISO' },
        { status: 403 },
      )
    }
    if (destino === 'cancelado' && !d.notas) {
      return Response.json(
        { error: 'Indica el motivo de la cancelación (notas).', codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }

    const orden = await db.actualizarOrden(
      d.id,
      { estado: destino, notas: d.notas },
      { id: s.usuario.id, nombre: s.usuario.nombre, rol: s.usuario.rol },
    )
    return Response.json(orden)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Update orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

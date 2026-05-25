import { db } from '@/lib/db'

const TIPOS = ['problema', 'listo', 'nueva_orden'] as const

/**
 * GET /api/notificaciones?usuario_id=...&rol=...&solo_pendientes=true&limite=100
 *
 * Devuelve las notificaciones para un usuario y/o rol. Diseñado para
 * polling ligero del cliente: por defecto sólo devuelve las pendientes
 * (vista=false) ordenadas por fecha descendente.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const usuario_id = searchParams.get('usuario_id')
    const rol = searchParams.get('rol')

    if (!usuario_id && !rol) {
      return Response.json(
        { error: 'Se requiere usuario_id o rol' },
        { status: 400 },
      )
    }

    const solo_pendientes_raw = searchParams.get('solo_pendientes')
    const solo_pendientes = solo_pendientes_raw === null
      ? true
      : !(solo_pendientes_raw === 'false' || solo_pendientes_raw === '0')

    const limite = Number(searchParams.get('limite')) || 100

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
    const body = await request.json()
    const tipo = String(body?.tipo || '')
    if (!TIPOS.includes(tipo as any)) {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    const mensaje = String(body?.mensaje || '').trim()
    if (!mensaje) {
      return Response.json({ error: 'mensaje requerido' }, { status: 400 })
    }
    const destinatario_usuario_id = body?.destinatario_usuario_id
      ? String(body.destinatario_usuario_id)
      : null
    const destinatario_rol = body?.destinatario_rol ? String(body.destinatario_rol) : null
    if (!destinatario_usuario_id && !destinatario_rol) {
      return Response.json(
        { error: 'Se requiere destinatario_usuario_id o destinatario_rol' },
        { status: 400 },
      )
    }

    const row = await db.crearNotificacion({
      tipo: tipo as any,
      orden_id: body?.orden_id ? String(body.orden_id) : null,
      mesa_nombre: body?.mesa_nombre ? String(body.mesa_nombre) : null,
      mensaje,
      destinatario_usuario_id,
      destinatario_rol,
    })

    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('[POST /api/notificaciones] error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

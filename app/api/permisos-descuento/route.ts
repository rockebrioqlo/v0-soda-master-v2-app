import { db } from '@/lib/db'

function esAdmin(rol?: string | null) {
  return rol === 'admin' || rol === 'administrador'
}

export async function GET() {
  try {
    const data = await db.getPermisosDescuento()
    return Response.json(data)
  } catch (error) {
    console.error('Get permisos-descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const usuarioId = String(body.usuario_id || '')
    if (!usuarioId) {
      return Response.json({ error: 'usuario_id requerido' }, { status: 400 })
    }
    const usuario = await db.getUsuarioById(usuarioId)
    if (!usuario || !esAdmin(usuario.rol)) {
      return Response.json(
        { error: 'Solo el administrador puede modificar permisos' },
        { status: 403 }
      )
    }
    const items = Array.isArray(body.permisos) ? body.permisos : null
    if (!items || items.length === 0) {
      return Response.json({ error: 'permisos requerido' }, { status: 400 })
    }
    const validados: Array<{ rol: string; puede_aplicar: boolean; limite_maximo: number; requiere_motivo: boolean }> = []
    for (const item of items) {
      const rol = String(item.rol || '')
      if (!rol) return Response.json({ error: 'rol requerido por item' }, { status: 400 })
      const limite = Number(item.limite_maximo)
      if (!Number.isFinite(limite) || limite < 0 || limite > 100) {
        return Response.json({ error: `limite_maximo inválido para ${rol}` }, { status: 400 })
      }
      validados.push({
        rol,
        puede_aplicar: !!item.puede_aplicar,
        limite_maximo: limite,
        requiere_motivo: !!item.requiere_motivo,
      })
    }
    const data = await db.actualizarPermisosDescuento(validados)
    return Response.json(data)
  } catch (error) {
    console.error('Patch permisos-descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

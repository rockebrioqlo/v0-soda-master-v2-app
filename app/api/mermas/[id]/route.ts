import { db } from '@/lib/db'

const CONSECUENCIAS = new Set<string>(['descuento_liquidacion', 'solo_registro', 'amonestacion'])

function esAdmin(rol?: string | null) {
  return rol === 'admin' || rol === 'administrador'
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const usuarioId = String(body.usuario_id || '')
    if (!usuarioId) {
      return Response.json({ error: 'usuario_id requerido' }, { status: 400 })
    }
    const usuario = await db.getUsuarioById(usuarioId)
    if (!usuario || !esAdmin(usuario.rol)) {
      return Response.json(
        { error: 'Solo el administrador puede modificar mermas' },
        { status: 403 }
      )
    }

    const updates: { responsable_id?: string | null; consecuencia?: string | null; monto_descuento?: number } = {}
    if (body.responsable_id !== undefined) {
      updates.responsable_id = body.responsable_id ? String(body.responsable_id) : null
    }
    if (body.consecuencia !== undefined) {
      if (body.consecuencia && !CONSECUENCIAS.has(String(body.consecuencia))) {
        return Response.json({ error: 'Consecuencia inválida' }, { status: 400 })
      }
      updates.consecuencia = body.consecuencia ? String(body.consecuencia) : null
    }
    if (body.monto_descuento !== undefined) {
      const n = Number(body.monto_descuento)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'monto_descuento inválido' }, { status: 400 })
      }
      updates.monto_descuento = n
    }
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Sin campos a actualizar' }, { status: 400 })
    }

    const merma = await db.actualizarMerma(id, updates)
    if (!merma) {
      return Response.json({ error: 'Merma no encontrada' }, { status: 404 })
    }
    return Response.json(merma)
  } catch (error) {
    console.error('Patch merma error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

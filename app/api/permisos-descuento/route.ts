import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

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
    // Solo admin, según la sesión (ya no se acepta `usuario_id` del body).
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
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

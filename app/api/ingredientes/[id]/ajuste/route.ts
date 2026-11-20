import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { AjusteStockSchema } from '@/lib/inventario-http'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Sesión 11: único camino para fijar el stock de un insumo a mano (conteo físico).
// Deja un movimiento `ajuste` con la diferencia, el motivo y quién lo hizo (la sesión).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
    }
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, AjusteStockSchema, 'Datos del ajuste')
    if (!parsed.ok) return parsed.respuesta
    const r = await db.ajustarStockIngrediente({
      ingrediente_id: id,
      stock_nuevo: parsed.datos.stock_nuevo,
      motivo: parsed.datos.motivo,
      usuario_nombre: s.usuario.nombre ?? 'admin',
    })
    return Response.json(r)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('POST ajuste de stock error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

// POST /api/caja/cerrar — arqueo y cierre. El cajero cuenta el
// efectivo físico y reporta `efectivo_contado`. El servidor calcula el
// esperado (fondo + entradas - salidas) y la diferencia. Si hay
// diferencia, queda registrada y el admin puede revisarla en el
// historial.
//
// Cuerpo: { caja_id, efectivo_contado, notas? }. El usuario sale de la sesión.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
    if (!body?.caja_id) {
      return Response.json({ error: 'caja_id requerido' }, { status: 400 })
    }
    const contado = Number(body.efectivo_contado)
    if (!Number.isFinite(contado) || contado < 0) {
      return Response.json({ error: 'efectivo_contado inválido' }, { status: 400 })
    }
    const resultado = await db.cerrarCaja({
      caja_id: body.caja_id,
      usuario_id: s.usuario.id,
      usuario_nombre: s.usuario.nombre,
      efectivo_contado: contado,
      notas: body.notas ?? null,
    })
    return Response.json(resultado)
  } catch (error: any) {
    console.error('POST /api/caja/cerrar error:', error)
    if (error?.code === 'CAJA_YA_CERRADA') {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

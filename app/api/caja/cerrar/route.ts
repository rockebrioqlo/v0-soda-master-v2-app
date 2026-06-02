import { db } from '@/lib/db'

// POST /api/caja/cerrar — arqueo y cierre. El cajero cuenta el
// efectivo físico y reporta `efectivo_contado`. El servidor calcula el
// esperado (fondo + entradas - salidas) y la diferencia. Si hay
// diferencia, queda registrada y el admin puede revisarla en el
// historial.
//
// Cuerpo: { caja_id, usuario_id, usuario_nombre, efectivo_contado, notas? }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body?.caja_id || !body?.usuario_id || !body?.usuario_nombre) {
      return Response.json(
        { error: 'caja_id, usuario_id y usuario_nombre requeridos' },
        { status: 400 },
      )
    }
    const contado = Number(body.efectivo_contado)
    if (!Number.isFinite(contado) || contado < 0) {
      return Response.json({ error: 'efectivo_contado inválido' }, { status: 400 })
    }
    const resultado = await db.cerrarCaja({
      caja_id: body.caja_id,
      usuario_id: body.usuario_id,
      usuario_nombre: body.usuario_nombre,
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

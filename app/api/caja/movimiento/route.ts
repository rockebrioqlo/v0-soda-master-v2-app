import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

// POST /api/caja/movimiento — registra un retiro, depósito o ajuste
// manual en la caja abierta. Los movimientos automáticos de venta y
// vuelto los inserta directamente `db.crearPago`.
//
// Cuerpo: { tipo: 'retiro'|'deposito'|'ajuste', monto, descripcion?,
//           }. El usuario sale de la sesión.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
    const tiposPermitidos = new Set(['retiro', 'deposito', 'ajuste'])
    if (!tiposPermitidos.has(body?.tipo)) {
      return Response.json(
        { error: 'tipo debe ser retiro, deposito o ajuste' },
        { status: 400 },
      )
    }
    const monto = Number(body.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'monto debe ser > 0' }, { status: 400 })
    }
    const mov = await db.registrarMovimientoCaja({
      tipo: body.tipo,
      monto,
      descripcion: body.descripcion ?? null,
      usuario_id: s.usuario.id,
      usuario_nombre: s.usuario.nombre,
    })
    return Response.json(mov, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/caja/movimiento error:', error)
    if (error?.code === 'CAJA_NO_ABIERTA') {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

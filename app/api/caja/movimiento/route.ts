import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { CajaMovimientoSchema } from '@/lib/caja-http'
import { leerBody } from '@/lib/validacion-http'

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
    const parsed = await leerBody(request, CajaMovimientoSchema, 'Datos del movimiento')
    if (!parsed.ok) return parsed.respuesta
    const mov = await db.registrarMovimientoCaja({
      tipo: parsed.datos.tipo,
      monto: parsed.datos.monto,
      descripcion: parsed.datos.descripcion || null,
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

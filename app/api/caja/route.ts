import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

// GET /api/caja — estado de la caja abierta (si hay) + resumen con
// totales (fondo, ventas en efectivo, vuelto entregado, retiros,
// depósitos, efectivo esperado). El frontend usa esto para decidir si
// mostrar el botón "Abrir caja" o el panel de operaciones.
export async function GET() {
  try {
    const caja = await db.getCajaAbierta()
    if (!caja) {
      return Response.json({ abierta: false })
    }
    const detalle = await db.getCajaConResumen(caja.id)
    return Response.json({ abierta: true, ...detalle })
  } catch (error: any) {
    console.error('GET /api/caja error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

// POST /api/caja — abre una nueva caja con un fondo inicial.
// Cuerpo: { fondo_inicial, notas? }. El usuario sale de la sesión.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
    const fondo = Number(body.fondo_inicial)
    if (!Number.isFinite(fondo) || fondo < 0) {
      return Response.json({ error: 'fondo_inicial inválido' }, { status: 400 })
    }
    const caja = await db.abrirCaja({
      usuario_id: s.usuario.id,
      usuario_nombre: s.usuario.nombre,
      fondo_inicial: fondo,
      notas: body.notas ?? null,
    })
    return Response.json(caja, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/caja error:', error)
    if (error?.code === 'CAJA_YA_ABIERTA') {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

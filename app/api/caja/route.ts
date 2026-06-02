import { db } from '@/lib/db'

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
// Cuerpo: { usuario_id, usuario_nombre, fondo_inicial, notas? }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body?.usuario_id || !body?.usuario_nombre) {
      return Response.json({ error: 'usuario_id y usuario_nombre requeridos' }, { status: 400 })
    }
    const fondo = Number(body.fondo_inicial)
    if (!Number.isFinite(fondo) || fondo < 0) {
      return Response.json({ error: 'fondo_inicial inválido' }, { status: 400 })
    }
    const caja = await db.abrirCaja({
      usuario_id: body.usuario_id,
      usuario_nombre: body.usuario_nombre,
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

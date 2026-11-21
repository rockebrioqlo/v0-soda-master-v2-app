import { db } from '@/lib/db'
import { requireSesion, requireAcceso } from '@/lib/sesion'
import { CajaAbrirSchema } from '@/lib/caja-http'
import { leerBody } from '@/lib/validacion-http'

// GET /api/caja — estado de la caja abierta (si hay) + resumen con
// totales (fondo, ventas en efectivo, vuelto entregado, retiros,
// depósitos, efectivo esperado). El frontend usa esto para decidir si
// mostrar el botón "Abrir caja" o el panel de operaciones.
export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
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
    const parsed = await leerBody(request, CajaAbrirSchema, 'Datos de apertura')
    if (!parsed.ok) return parsed.respuesta
    const caja = await db.abrirCaja({
      usuario_id: s.usuario.id,
      usuario_nombre: s.usuario.nombre,
      fondo_inicial: parsed.datos.fondo_inicial,
      notas: parsed.datos.notas || null,
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

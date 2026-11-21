import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { fechaOHoy, leerConsulta, limite } from '@/lib/validacion-http'

// GET /api/kds/historial?fecha=hoy|YYYY-MM-DD&limite=N
// Devuelve el historial de pedidos (órdenes con sus items) para que
// cocina/bar puedan revisar lo que prepararon durante el día o días
// anteriores. Incluye órdenes pagadas/canceladas/perdidas.
//
// El filtro por estación (cocina vs bar) se hace en el frontend
// mirando la categoría de cada item, porque ahí ya tenemos el contexto
// del rol que pidió la página.
export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, z.object({ fecha: fechaOHoy.optional(), limite: limite(500).optional() }).strict())
    if (!q.ok) return q.respuesta
    const historial = await db.getHistorialKDS({ fecha: q.datos.fecha, limite: q.datos.limite ?? 200 })
    return Response.json(historial)
  } catch (error: any) {
    console.error('GET /api/kds/historial error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

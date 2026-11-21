import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { leerConsulta, limite } from '@/lib/validacion-http'

// GET /api/caja/historial?limite=N — listado de cajas previas (abiertas
// y cerradas) ordenadas por apertura desc. Cada item incluye totales
// principales y la cuenta de pagos en efectivo asociados.
export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, z.object({ limite: limite(200).optional() }).strict())
    if (!q.ok) return q.respuesta
    const cajas = await db.getHistorialCajas(q.datos.limite ?? 30)
    return Response.json(cajas)
  } catch (error: any) {
    console.error('GET /api/caja/historial error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

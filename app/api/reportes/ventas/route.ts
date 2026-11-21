import { db } from '@/lib/db'
import { parseRango } from '../_utils'
import { requireAcceso } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const { searchParams } = new URL(request.url)
    const { desde, hasta } = parseRango(searchParams)
    const data = await db.getReporteVentas(desde, hasta)
    return Response.json(data)
  } catch (error) {
    console.error('Reporte ventas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

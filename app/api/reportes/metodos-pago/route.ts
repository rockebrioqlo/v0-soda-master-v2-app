import { db } from '@/lib/db'
import { parseRango } from '../_utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { desde, hasta } = parseRango(searchParams)
    const data = await db.getReporteMetodosPago(desde, hasta)
    return Response.json(data)
  } catch (error) {
    console.error('Reporte metodos-pago error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

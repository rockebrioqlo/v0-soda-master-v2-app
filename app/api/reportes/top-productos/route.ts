import { db } from '@/lib/db'
import { parseRango } from '../_utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { desde, hasta } = parseRango(searchParams)
    const limiteRaw = parseInt(searchParams.get('limite') || '10', 10)
    const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 100) : 10
    const data = await db.getReporteTopProductos(desde, hasta, limite)
    return Response.json(data)
  } catch (error) {
    console.error('Reporte top-productos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

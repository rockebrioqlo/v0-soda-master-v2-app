import { db } from '@/lib/db'

// GET /api/caja/historial?limite=N — listado de cajas previas (abiertas
// y cerradas) ordenadas por apertura desc. Cada item incluye totales
// principales y la cuenta de pagos en efectivo asociados.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const lim = Number(url.searchParams.get('limite') || 30)
    const cajas = await db.getHistorialCajas(lim)
    return Response.json(cajas)
  } catch (error: any) {
    console.error('GET /api/caja/historial error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

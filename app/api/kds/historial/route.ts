import { db } from '@/lib/db'

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
    const url = new URL(request.url)
    const fecha = url.searchParams.get('fecha') || undefined
    const limite = Number(url.searchParams.get('limite') || 200)
    const historial = await db.getHistorialKDS({ fecha, limite })
    return Response.json(historial)
  } catch (error: any) {
    console.error('GET /api/kds/historial error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

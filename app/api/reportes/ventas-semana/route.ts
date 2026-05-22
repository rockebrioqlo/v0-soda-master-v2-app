import { db } from '@/lib/db'

export async function GET() {
  try {
    const data = await db.getReporteVentasSemana()
    return Response.json(data)
  } catch (error) {
    console.error('Reporte ventas-semana error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

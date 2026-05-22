import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') || undefined
    const pagos = await db.getPagos(fecha ? { fecha } : undefined)
    return Response.json(pagos)
  } catch (error) {
    console.error('Get pagos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const pago = await request.json()
    if (!pago?.orden_id && !pago?.comandaId && !pago?.ordenId) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const newPago = await db.crearPago(pago)
    return Response.json(newPago, { status: 201 })
  } catch (error) {
    console.error('Create pago error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

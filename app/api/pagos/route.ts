import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const pago = await request.json()
    const newPago = await db.crearPago(pago)
    return Response.json(newPago)
  } catch (error) {
    console.error('Create pago error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

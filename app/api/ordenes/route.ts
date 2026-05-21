import { db } from '@/lib/db'

export async function GET() {
  try {
    const ordenes = await db.getOrdenesPendientes()
    return Response.json(ordenes)
  } catch (error) {
    console.error('Get ordenes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const orden = await request.json()
    const newOrden = await db.crearOrden(orden)
    return Response.json(newOrden)
  } catch (error) {
    console.error('Create orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const item = await request.json()
    const newItem = await db.crearItemOrden(item)
    return Response.json(newItem)
  } catch (error) {
    console.error('Create item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'

export async function GET() {
  try {
    const data = await db.getMargenesProductos()
    return Response.json(data)
  } catch (error) {
    console.error('GET margenes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

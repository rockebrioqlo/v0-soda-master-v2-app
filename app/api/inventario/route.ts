import { db } from '@/lib/db'

export async function GET() {
  try {
    const inventario = await db.getInventario()
    return Response.json(inventario)
  } catch (error) {
    console.error('Get inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

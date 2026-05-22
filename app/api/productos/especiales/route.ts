import { db } from '@/lib/db'

export async function GET() {
  try {
    const productos = await db.getProductosEspeciales()
    return Response.json(productos)
  } catch (error) {
    console.error('Get productos especiales error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

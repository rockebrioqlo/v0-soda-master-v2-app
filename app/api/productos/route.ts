import { db } from '@/lib/db'

export async function GET() {
  try {
    const productos = await db.getProductos()
    return Response.json(productos)
  } catch (error) {
    console.error('Get productos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const producto = await request.json()
    const newProducto = await db.crearProducto(producto)
    return Response.json(newProducto)
  } catch (error) {
    console.error('Create producto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

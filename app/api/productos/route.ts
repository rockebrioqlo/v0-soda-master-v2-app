import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ProductoPostSchema } from '@/lib/catalogo-http'
import { leerBody } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const productos = await db.getProductos()
    return Response.json(productos)
  } catch (error) {
    console.error('Get productos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ProductoPostSchema, 'Datos del producto')
    if (!parsed.ok) return parsed.respuesta
    const newProducto = await db.crearProducto(parsed.datos as any)
    return Response.json(newProducto)
  } catch (error) {
    console.error('Create producto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

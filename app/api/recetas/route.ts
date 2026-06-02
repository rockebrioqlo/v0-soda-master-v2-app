import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // Modo "resumen": devuelve un objeto { producto_id: {base, opcionales,
    // extras, total} } para mostrar el indicador en la tabla de inventario
    // sin tener que hacer una request por producto.
    if (searchParams.get('resumen') === 'true') {
      const data = await db.getResumenRecetasPorProducto()
      return Response.json(data)
    }
    const productoId = searchParams.get('producto_id')
    if (!productoId) {
      return Response.json({ error: 'producto_id requerido' }, { status: 400 })
    }
    const opciones = searchParams.get('opciones') === 'true'
    if (opciones) {
      const data = await db.getOpcionesRecetaProducto(productoId)
      return Response.json(data)
    }
    const receta = await db.getRecetaProducto(productoId)
    return Response.json(receta)
  } catch (error) {
    console.error('GET recetas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const productoId = String(body?.producto_id || '')
    if (!productoId) {
      return Response.json({ error: 'producto_id requerido' }, { status: 400 })
    }
    if (!Array.isArray(body.ingredientes)) {
      return Response.json({ error: 'ingredientes debe ser un array' }, { status: 400 })
    }
    const receta = await db.guardarRecetaProducto(productoId, {
      nombre: body.nombre ? String(body.nombre) : undefined,
      modo_stock: body.modo_stock ? String(body.modo_stock) : undefined,
      ingredientes: body.ingredientes,
    })
    return Response.json(receta)
  } catch (error) {
    console.error('POST recetas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

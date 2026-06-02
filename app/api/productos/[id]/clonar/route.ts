import { db } from '@/lib/db'

// POST /api/productos/:id/clonar
// Crea una variante de un producto existente (mismo categoría, modo de
// stock, descripción y receta). Útil para "Burger Doble" a partir de
// "Burger Simple": clic, se ajusta el nombre/precio y queda como
// producto independiente con sus mismos ingredientes copiados.
//
// Cuerpo: { nombre: string, precio?: number }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const nombre = (body?.nombre || '').toString().trim()
    if (!nombre) {
      return Response.json({ error: 'nombre requerido' }, { status: 400 })
    }
    const precio = body?.precio !== undefined && body?.precio !== null
      ? Number(body.precio)
      : undefined
    if (precio !== undefined && (!Number.isFinite(precio) || precio < 0)) {
      return Response.json({ error: 'precio inválido' }, { status: 400 })
    }
    const result = await db.clonarProductoConReceta({
      producto_id: id,
      nombre,
      precio,
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/productos/:id/clonar error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

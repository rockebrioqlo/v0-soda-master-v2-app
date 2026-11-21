import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ProductoClonarSchema } from '@/lib/catalogo-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

// POST /api/productos/:id/clonar
// Crea una variante de un producto existente (mismo categoría, modo de
// stock, descripción y receta). Útil para "Burger Doble" a partir de
// "Burger Simple": clic, se ajusta el nombre/precio y queda como
// producto independiente con sus mismos ingredientes copiados.
//
// Cuerpo: { nombre: string, precio?: number }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(context.params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, ProductoClonarSchema, 'Datos de la variante')
    if (!parsed.ok) return parsed.respuesta
    const result = await db.clonarProductoConReceta({
      producto_id: p.datos.id,
      nombre: parsed.datos.nombre,
      precio: parsed.datos.precio ?? undefined,
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/productos/:id/clonar error:', error)
    const msg = String(error?.message ?? '')
    if (msg.includes('no encontrado')) return Response.json({ error: msg, codigo: 'PRODUCTO_NO_ENCONTRADO' }, { status: 404 })
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

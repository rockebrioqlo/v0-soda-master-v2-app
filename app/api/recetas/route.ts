import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { RecetaPostSchema } from '@/lib/catalogo-http'
import { respuestaDeError } from '@/lib/ordenes-http'
import { booleanoConsulta, leerBody, leerConsulta, uuid } from '@/lib/validacion-http'

const RecetasConsultaSchema = z
  .object({
    resumen: booleanoConsulta.optional(),
    producto_id: uuid.optional(),
    opciones: booleanoConsulta.optional(),
  })
  .strict()

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, RecetasConsultaSchema)
    if (!q.ok) return q.respuesta
    // Modo "resumen": devuelve un objeto { producto_id: {base, opcionales,
    // extras, total} } para mostrar el indicador en la tabla de inventario
    // sin tener que hacer una request por producto.
    if (q.datos.resumen === 'true') {
      const data = await db.getResumenRecetasPorProducto()
      return Response.json(data)
    }
    const productoId = q.datos.producto_id
    if (!productoId) {
      return Response.json({ error: 'producto_id requerido', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
    }
    if (q.datos.opciones === 'true') {
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

// F31 (sesión 14.5b-1): body con zod `.strict()` (cantidad mayor que 0, uuid de producto e insumos),
// solo admin por la tabla del proxy, y `guardarRecetaProducto` valida que el producto y los insumos
// existan y estén activos ANTES de tocar la receta, y escribe todo en una transacción.
export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, RecetaPostSchema, 'Datos de la receta')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const receta = await db.guardarRecetaProducto(d.producto_id, {
      nombre: d.nombre || undefined,
      modo_stock: d.modo_stock,
      ingredientes: d.ingredientes.map((l) => ({ ...l, nombre_display: l.nombre_display ?? null })),
    })
    return Response.json(receta)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('POST recetas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

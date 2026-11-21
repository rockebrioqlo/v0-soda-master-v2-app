import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'
import { InventarioPatchPorIdSchema } from '@/lib/mermas-http'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const id = p.datos.id
    // F45 (14.5b-2): zod `.strict()`; el alias `cantidad` que nadie usaba ya no se acepta. La lógica
    // (fijar `stock_actual` directo) no cambia.
    const parsed = await leerBody(request, InventarioPatchPorIdSchema, 'Datos del inventario')
    if (!parsed.ok) return parsed.respuesta
    const inventario = await db.actualizarInventario(id, parsed.datos)
    if (!inventario) {
      return Response.json({ error: 'Producto sin registro de inventario', codigo: 'INVENTARIO_NO_ENCONTRADO' }, { status: 404 })
    }
    return Response.json(inventario)
  } catch (error) {
    console.error('Update inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

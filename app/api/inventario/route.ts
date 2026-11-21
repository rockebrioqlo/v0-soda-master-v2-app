import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { InventarioPatchSchema } from '@/lib/mermas-http'
import { leerBody } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const inventario = await db.getInventarioCompleto()
    return Response.json(inventario)
  } catch (error) {
    console.error('Get inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Sesión 14.5b-2 (F45): body con zod `.strict()` y el UPDATE pasa por `db.actualizarInventario` (el mismo
// SQL de antes, ya no `neon()` directo). La lógica no cambia: `stock_actual` se fija directo (ver F45 en
// el ROADMAP); un producto sin fila de inventario responde 404 en vez de romper.
export async function PATCH(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, InventarioPatchSchema, 'Datos del inventario')
    if (!parsed.ok) return parsed.respuesta
    const { producto_id, stock_actual, stock_minimo, unidad_medida } = parsed.datos
    const inventario = await db.actualizarInventario(producto_id, { stock_actual, stock_minimo, unidad_medida })
    if (!inventario) {
      return Response.json({ error: 'Producto sin registro de inventario', codigo: 'INVENTARIO_NO_ENCONTRADO' }, { status: 404 })
    }
    return Response.json(inventario)
  } catch (error) {
    console.error('Update inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

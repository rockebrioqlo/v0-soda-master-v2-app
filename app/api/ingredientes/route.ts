import { db } from '@/lib/db'
import { requireSesion, requireAcceso } from '@/lib/sesion'
import { IngredientePostSchema } from '@/lib/inventario-http'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const data = await db.getIngredientes(true)
    return Response.json(data)
  } catch (error) {
    console.error('GET ingredientes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Sesión 11: body con zod `.strict()`, solo admin. `stock_actual` es el stock inicial
// (deja un movimiento `entrada`); `unidad_medida` es la unidad de consumo.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, IngredientePostSchema, 'Datos del insumo')
    if (!parsed.ok) return parsed.respuesta
    const row = await db.crearIngrediente(parsed.datos)
    return Response.json(row, { status: 201 })
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('POST ingredientes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

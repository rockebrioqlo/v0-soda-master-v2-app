import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { CompraPostSchema } from '@/lib/inventario-http'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const proveedorId = searchParams.get('proveedor_id')
    const limite = searchParams.get('limite')
    const data = await db.getCompras({
      proveedorId: proveedorId || undefined,
      limite: limite ? Number(limite) : undefined,
    })
    return Response.json(data)
  } catch (error) {
    console.error('GET compras error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Sesión 11: body con zod `.strict()`, solo admin, usuario de la sesión. `cantidad` y
// `precio_unitario` van en la unidad de compra; `factor` (opcional) corrige las unidades de
// consumo que trajo cada una (si falta, el factor por defecto del insumo).
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, CompraPostSchema, 'Datos de la compra')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const compra = await db.crearCompra({
      proveedor_id: d.proveedor_id || null,
      tipo_documento: d.tipo_documento,
      numero_documento: d.numero_documento || null,
      fecha: d.fecha || null,
      impuesto: d.impuesto ?? 0,
      notas: d.notas || null,
      usuario_id: s.usuario.id, // de la sesión, no del body
      items: d.items,
    })
    return Response.json(compra, { status: 201 })
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('POST compras error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

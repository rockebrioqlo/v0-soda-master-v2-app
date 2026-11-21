import { db } from '@/lib/db'
import { requireAcceso, requireSesion } from '@/lib/sesion'
import { CompraPostSchema } from '@/lib/inventario-http'
import { respuestaDeError } from '@/lib/ordenes-http'
import { leerBody, leerConsulta, limite, uuid } from '@/lib/validacion-http'
import { z } from 'zod'

const ComprasConsultaSchema = z
  .object({ proveedor_id: uuid.optional(), limite: limite(500).optional() })
  .strict()

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, ComprasConsultaSchema)
    if (!q.ok) return q.respuesta
    const data = await db.getCompras({
      proveedorId: q.datos.proveedor_id,
      limite: q.datos.limite,
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

import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

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

export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return Response.json({ error: 'items requeridos' }, { status: 400 })
    }
    const tipo = body.tipo_documento
    const tipoValido = ['boleta', 'factura', 'nota', 'otro'].includes(String(tipo))
    const compra = await db.crearCompra({
      proveedor_id: body.proveedor_id || null,
      tipo_documento: tipoValido ? tipo : 'boleta',
      numero_documento: body.numero_documento ? String(body.numero_documento) : null,
      fecha: body.fecha ? String(body.fecha) : null,
      impuesto: Number(body.impuesto) || 0,
      notas: body.notas ? String(body.notas) : null,
      usuario_id: s.usuario.id, // de la sesión, no del body
      items: body.items.map((it: any) => ({
        ingrediente_id: String(it.ingrediente_id),
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        notas: it.notas ? String(it.notas) : null,
      })),
    })
    return Response.json(compra, { status: 201 })
  } catch (error) {
    console.error('POST compras error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error en servidor' },
      { status: 500 },
    )
  }
}

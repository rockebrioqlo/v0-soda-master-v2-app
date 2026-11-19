import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

/**
 * Pérdidas ("perros muertos"): clientes que consumieron pero se fueron
 * sin pagar. La fila queda registrada para que el admin pueda revisar
 * después cuánto se pierde por este motivo y eventualmente cruzar con
 * el mesero/cajero responsable.
 *
 * Es DISTINTO de cancelar una comanda: cancelar significa que la venta
 * no ocurrió (no se prepararon los items). En cambio, una pérdida
 * reconoce que el consumo sí ocurrió.
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') || undefined
    const perdidas = await db.getPerdidas(fecha ? { fecha } : undefined)
    return Response.json(perdidas)
  } catch (error: any) {
    console.error('Get perdidas error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const body = await request.json()
    const ordenId = body?.orden_id || body?.ordenId
    if (!ordenId || typeof ordenId !== 'string') {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const motivo = (body?.motivo ?? '').toString().trim()
    if (motivo.length < 3) {
      return Response.json(
        { error: 'Debes indicar un motivo (mínimo 3 caracteres)' },
        { status: 400 },
      )
    }
    // Quien autoriza la pérdida es el admin/cajero de la sesión
    // (antes llegaba en el body y se podía falsear).
    const autorizadoPor = s.usuario.id
    const autorizadoPorNombre = s.usuario.nombre

    const tasaImpuesto = Number(body?.tasa_impuesto ?? 0)
    const impuestoHabilitado = body?.impuesto_habilitado !== false

    const result = await db.registrarPerdida({
      orden_id: ordenId,
      motivo,
      autorizado_por: autorizadoPor,
      autorizado_por_nombre: autorizadoPorNombre,
      tasa_impuesto: Number.isFinite(tasaImpuesto) ? tasaImpuesto : 0,
      impuesto_habilitado: impuestoHabilitado,
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Register perdida error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

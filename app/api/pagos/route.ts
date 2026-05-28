import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') || undefined
    const pagos = await db.getPagos(fecha ? { fecha } : undefined)
    return Response.json(pagos)
  } catch (error) {
    console.error('Get pagos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const pago = await request.json()
    if (!pago?.orden_id && !pago?.comandaId && !pago?.ordenId) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const monto = Number(pago.monto ?? pago.total)
    const propina = Number(pago.propina ?? 0)
    const descuento = Number(pago.descuento ?? 0)
    const divididoEn = Number(pago.dividido_en ?? pago.divididoEn ?? 1)
    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'monto debe ser mayor que 0' }, { status: 400 })
    }
    if (!Number.isFinite(propina) || propina < 0) {
      return Response.json({ error: 'propina inválida' }, { status: 400 })
    }
    if (!Number.isFinite(descuento) || descuento < 0) {
      return Response.json({ error: 'descuento inválido' }, { status: 400 })
    }
    if (!Number.isFinite(divididoEn) || divididoEn < 1) {
      return Response.json({ error: 'dividido_en inválido' }, { status: 400 })
    }
    // Pago parcial opcional: el cliente puede mandar `item_orden_ids` para
    // pagar SOLO esos items y dejar el resto abierto a otros pagos.
    const itemIdsRaw = pago.item_orden_ids ?? pago.itemOrdenIds
    if (itemIdsRaw !== undefined && !Array.isArray(itemIdsRaw)) {
      return Response.json({ error: 'item_orden_ids debe ser un arreglo' }, { status: 400 })
    }
    // `item_partials` permite cobrar una porción de una línea con cantidad > 1
    // (ej. 1 de 2 cervezas iguales). El backend splittea la línea automáticamente.
    const itemPartialsRaw = pago.item_partials ?? pago.itemPartials
    if (itemPartialsRaw !== undefined) {
      if (!Array.isArray(itemPartialsRaw)) {
        return Response.json({ error: 'item_partials debe ser un arreglo' }, { status: 400 })
      }
      for (const p of itemPartialsRaw) {
        if (!p || typeof p.id !== 'string' || !Number.isFinite(Number(p.cantidad)) || Number(p.cantidad) <= 0) {
          return Response.json(
            { error: 'item_partials inválido: requiere { id: string, cantidad: number > 0 }' },
            { status: 400 },
          )
        }
      }
    }
    const newPago = await db.crearPago(pago)
    return Response.json(newPago, { status: 201 })
  } catch (error: any) {
    console.error('Create pago error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

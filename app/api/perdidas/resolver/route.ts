import { db } from '@/lib/db'

/**
 * Cobro retroactivo de un "perro muerto": el cliente volvió, paga lo que
 * había consumido, y la pérdida queda saldada. Sólo admin/cajero deberían
 * llamar esto (lo controlamos en cliente). El servidor:
 *  - crea un `pagos` con `referencia` apuntando a la pérdida;
 *  - marca la fila de `perdidas_comanda` como `resuelto=true`;
 *  - deja una nota en `ordenes.notas` para mantener el historial.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const perdidaId = body?.id || body?.perdida_id
    if (!perdidaId || typeof perdidaId !== 'string') {
      return Response.json({ error: 'id (de la pérdida) requerido' }, { status: 400 })
    }
    const resueltoPorId = body?.resuelto_por_id || body?.resueltoPorId
    const resueltoPorNombre = body?.resuelto_por_nombre || body?.resueltoPorNombre
    if (!resueltoPorId || !resueltoPorNombre) {
      return Response.json(
        { error: 'resuelto_por_id y resuelto_por_nombre requeridos' },
        { status: 400 },
      )
    }
    const monto = body?.monto !== undefined ? Number(body.monto) : undefined
    const metodo = body?.metodo
    const referencia = body?.referencia ?? null

    const result = await db.resolverPerdida({
      perdida_id: perdidaId,
      monto,
      metodo,
      referencia,
      resuelto_por_id: resueltoPorId,
      resuelto_por_nombre: resueltoPorNombre,
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Resolver perdida error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

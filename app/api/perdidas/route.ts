import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'
import { PerdidaPostSchema } from '@/lib/cuentas-http'

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
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') || undefined
    const perdidas = await db.getPerdidas(fecha ? { fecha } : undefined)
    return Response.json(perdidas)
  } catch (error: any) {
    console.error('Get perdidas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

/**
 * Registrar una pérdida (sesión 7, B2): solo admin (la pantalla ya lo exigía;
 * ahora también el servidor). Body `.strict()` con `orden_id` y `motivo`:
 * quien autoriza sale de la sesión y el monto lo calcula el servidor como lo
 * cobraría Pagos (ítems sin pagar, descuento prorrateado, IVA de la
 * configuración); `tasa_impuesto`, `impuesto_habilitado` y `autorizado_por*`
 * ya no se aceptan. Un segundo registro de la misma orden → 409.
 */
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const v = await leerBody(request, PerdidaPostSchema, 'Datos de la pérdida')
    if (!v.ok) return v.respuesta
    const result = await db.registrarPerdida({
      orden_id: v.datos.orden_id,
      motivo: v.datos.motivo,
      usuario: { id: s.usuario.id, nombre: s.usuario.nombre },
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    const r = respuestaDeError(error)
    if (r) return r
    console.error('Register perdida error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

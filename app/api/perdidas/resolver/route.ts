import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'
import { PerdidaResolverSchema } from '@/lib/cuentas-http'

/**
 * Cobro retroactivo de un "perro muerto": el cliente volvió, paga lo que
 * había consumido, y la pérdida queda saldada. Solo admin o cajero. El
 * servidor (sesión 7):
 *  - toma quién cobra de la sesión (el body ya no trae `resuelto_por_*`);
 *  - en una sola transacción con la pérdida bloqueada: crea el `pagos` con
 *    `referencia` apuntando a la pérdida, marca `perdidas_comanda` como
 *    `resuelto = true` y deja una nota en `ordenes.notas`;
 *  - dos cobros en paralelo: uno gana (201) y el otro recibe 409.
 * El monto del cliente todavía no se compara con la pérdida (B3, sesión 9).
 */
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta
    const v = await leerBody(request, PerdidaResolverSchema, 'Datos del cobro retroactivo')
    if (!v.ok) return v.respuesta

    const result = await db.resolverPerdida({
      perdida_id: v.datos.perdida_id,
      monto: v.datos.monto,
      metodo: v.datos.metodo,
      referencia: v.datos.referencia ?? null,
      resuelto_por_id: s.usuario.id,
      resuelto_por_nombre: s.usuario.nombre,
    })
    return Response.json(result, { status: 201 })
  } catch (error: any) {
    const r = respuestaDeError(error)
    if (r) return r
    console.error('Resolver perdida error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

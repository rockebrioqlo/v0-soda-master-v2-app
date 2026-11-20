import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { ComandaEnviarSchema, leerBody, respuestaDeError } from '@/lib/ordenes-http'

// Sesión 8 (#11, B1, R7, F10): la comanda completa (orden + ítems) en UNA transacción.
// `mesa_id` abre la comanda; `orden_id` agrega ítems a una existente. El servidor decide el
// usuario (sesión), el precio, el estado, la hora de envío y los montos; el stock se descuenta
// todo-o-nada. Si algo falla (stock, mesa ocupada, orden cobrada), no queda nada a medias.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ComandaEnviarSchema, 'Datos de la comanda')
    if (!parsed.ok) return parsed.respuesta
    const { mesa_id, orden_id, notas, items } = parsed.datos
    const resultado = await db.enviarComanda({
      mesa_id,
      orden_id,
      notas,
      items,
      usuario_id: s.usuario.id,
      enviar: true,
    })
    return Response.json(resultado)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Enviar comanda error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { z } from 'zod'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'
import { booleanoConsulta, fechaOHoy, leerConsulta, limite as limiteConsulta, uuid } from '@/lib/validacion-http'
import { manejarPatchOrden } from '@/lib/ordenes-patch'
import { IdSchema, OrdenPostSchema, leerBody, respuestaDeError } from '@/lib/ordenes-http'

// Consulta de GET /api/ordenes (F14, sesión 14.5b-1): uuid, fecha y límite validados, un valor mal escrito da 400.
const OrdenesConsultaSchema = z
  .object({
    mesa_id: uuid.optional(),
    kds: booleanoConsulta.optional(),
    fecha: fechaOHoy.optional(),
    limite: limiteConsulta(500).optional(),
    orden: z.enum(['asc', 'desc']).optional(),
  })
  .strict()

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, OrdenesConsultaSchema)
    if (!q.ok) return q.respuesta
    const { mesa_id: mesaId, kds, fecha, limite: limiteParam, orden: ordenParam } = q.datos

    if (kds === 'true') {
      const ordenes = await db.getOrdenesParaKDS()
      return Response.json(ordenes)
    }

    if (mesaId) {
      const ordenes = await db.getOrdenesPorMesa(mesaId)
      return Response.json(ordenes)
    }

    if (fecha || limiteParam || ordenParam) {
      const limite = limiteParam
      const orden = ordenParam === 'asc' ? 'asc' : ordenParam === 'desc' ? 'desc' : undefined
      const ordenes = await db.getOrdenes({
        fecha: fecha || undefined,
        limite,
        orden,
      })
      return Response.json(ordenes)
    }

    const ordenes = await db.getOrdenesPendientes()
    return Response.json(ordenes)
  } catch (error) {
    console.error('Get ordenes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, OrdenPostSchema, 'Datos de la orden')
    if (!parsed.ok) return parsed.respuesta
    // Quien abre la comanda es el usuario de la sesión: crearOrden usa este
    // id para decidir si un cajero puede abrir mesa (apertura_mesa). Los
    // montos arrancan en 0 y los calcula el servidor al agregar ítems.
    const newOrden = await db.crearOrden({
      mesa_id: parsed.datos.mesa_id,
      usuario_id: s.usuario.id,
      estado: parsed.datos.estado,
      notas: parsed.datos.notas,
    })
    return Response.json(newOrden)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Create orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Allowlist de campos, rol y transición de estado: ver lib/ordenes-patch.ts.
export async function PATCH(request: Request) {
  return manejarPatchOrden(request)
}

export async function DELETE(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, IdSchema, 'Datos de la orden')
    if (!parsed.ok) return parsed.respuesta
    await db.eliminarOrden(parsed.datos.id, {
      id: s.usuario.id,
      nombre: s.usuario.nombre,
      rol: s.usuario.rol,
      esAdmin: esAdminSesion(s.usuario),
    })
    return Response.json({ success: true })
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Delete orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

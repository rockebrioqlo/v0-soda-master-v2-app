import { db } from '@/lib/db'
import { esAdminSesion, requireSesion } from '@/lib/sesion'
import { manejarPatchOrden } from '@/lib/ordenes-patch'
import { IdSchema, OrdenPostSchema, leerBody, respuestaDeError } from '@/lib/ordenes-http'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mesaId = searchParams.get('mesa_id')
    const kds = searchParams.get('kds')
    const fecha = searchParams.get('fecha')
    const limiteParam = searchParams.get('limite')
    const ordenParam = searchParams.get('orden')

    if (kds === 'true') {
      const ordenes = await db.getOrdenesParaKDS()
      return Response.json(ordenes)
    }

    if (mesaId) {
      const ordenes = await db.getOrdenesPorMesa(mesaId)
      return Response.json(ordenes)
    }

    if (fecha || limiteParam || ordenParam) {
      const limite = limiteParam ? parseInt(limiteParam, 10) || undefined : undefined
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

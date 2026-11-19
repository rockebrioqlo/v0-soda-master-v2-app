import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

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
    const orden = await request.json()
    // Quien abre la comanda es el usuario de la sesión: crearOrden usa este
    // id para decidir si un cajero puede abrir mesa (apertura_mesa).
    const newOrden = await db.crearOrden({ ...orden, usuario_id: s.usuario.id })
    return Response.json(newOrden)
  } catch (error) {
    console.error('Create orden error:', error)
    if (error instanceof Error && error.message.includes('comanda activa')) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, action, ...updates } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    
    if (action === 'enviar_cocina') {
      const orden = await db.enviarOrdenACocina(id)
      return Response.json(orden)
    }
    
    const orden = await db.actualizarOrden(id, updates)
    return Response.json(orden)
  } catch (error) {
    console.error('Update orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    await db.eliminarOrden(id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete orden error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

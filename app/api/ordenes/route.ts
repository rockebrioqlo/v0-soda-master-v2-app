import { db } from '@/lib/db'

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
    const orden = await request.json()
    const newOrden = await db.crearOrden(orden)
    return Response.json(newOrden)
  } catch (error) {
    console.error('Create orden error:', error)
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

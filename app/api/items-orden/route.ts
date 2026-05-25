import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ordenId = searchParams.get('orden_id')
    
    if (!ordenId) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    
    const items = await db.getItemsOrden(ordenId)
    return Response.json(items)
  } catch (error) {
    console.error('Get items error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const item = await request.json()
    const newItem = await db.crearItemOrden(item)
    return Response.json(newItem)
  } catch (error) {
    console.error('Create item error:', error)
    const message = error instanceof Error ? error.message : 'Error en servidor'
    const status = message.includes('Stock insuficiente') || message.includes('Cantidad inválida') ? 400 : 500
    return Response.json({ error: message }, { status })
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, ...updates } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    const item = await db.actualizarItemOrden(id, updates)
    return Response.json(item)
  } catch (error) {
    console.error('Update item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    await db.eliminarItemOrden(id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

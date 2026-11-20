import { db, ErrorItemOrden } from '@/lib/db'
import { esAdminSesion, requireSesion } from '@/lib/sesion'

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
    // El proxy ya filtró por rol; aquí hace falta saber si es admin: solo el
    // admin cambia precios, y nadie toca ítems ya pagados (sesión 5).
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const { id, ...updates } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    const item = await db.actualizarItemOrden(id, updates, { esAdmin: esAdminSesion(s.usuario) })
    return Response.json(item)
  } catch (error) {
    if (error instanceof ErrorItemOrden) {
      return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status })
    }
    console.error('Update item error:', error)
    const message = error instanceof Error ? error.message : 'Error en servidor'
    return Response.json({ error: message }, { status: 500 })
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
    if (error instanceof ErrorItemOrden) {
      return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status })
    }
    console.error('Delete item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

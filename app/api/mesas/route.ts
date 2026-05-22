import { db } from '@/lib/db'

export async function GET() {
  try {
    const mesas = await db.getMesas()
    return Response.json(mesas)
  } catch (error) {
    console.error('Get mesas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, ...updates } = await request.json()
    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }
    const mesa = await db.actualizarMesa(id, updates)
    return Response.json(mesa)
  } catch (error) {
    console.error('Update mesa error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const mesa = await db.crearMesa(body || {})
    return Response.json(mesa, { status: 201 })
  } catch (error: any) {
    console.error('Create mesa error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('mesas_numero_key') || message.includes('duplicate key')) {
      return Response.json({ error: 'Número de mesa ya existe' }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

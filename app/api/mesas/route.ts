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

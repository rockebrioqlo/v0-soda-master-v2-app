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

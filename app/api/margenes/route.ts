import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const data = await db.getMargenesProductos()
    return Response.json(data)
  } catch (error) {
    console.error('GET margenes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

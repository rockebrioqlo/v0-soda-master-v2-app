import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const productos = await db.getProductosEspeciales()
    return Response.json(productos)
  } catch (error) {
    console.error('Get productos especiales error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

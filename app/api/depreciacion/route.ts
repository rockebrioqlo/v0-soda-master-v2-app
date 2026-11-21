import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const resumen = await db.getResumenDepreciacion()
    return Response.json(resumen)
  } catch (error) {
    console.error('GET depreciacion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

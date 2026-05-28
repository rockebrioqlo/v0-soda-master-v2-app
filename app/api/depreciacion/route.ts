import { db } from '@/lib/db'

export async function GET() {
  try {
    const resumen = await db.getResumenDepreciacion()
    return Response.json(resumen)
  } catch (error) {
    console.error('GET depreciacion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

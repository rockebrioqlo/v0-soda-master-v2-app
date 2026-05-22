import { db } from '@/lib/db'

export async function GET() {
  try {
    const config = await db.getConfiguracion()
    return Response.json(config)
  } catch (error) {
    console.error('Get configuracion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Body debe ser un objeto clave-valor' }, { status: 400 })
    }
    const updated = await db.actualizarConfiguracion(body)
    return Response.json(updated)
  } catch (error) {
    console.error('Update configuracion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export const PUT = PATCH

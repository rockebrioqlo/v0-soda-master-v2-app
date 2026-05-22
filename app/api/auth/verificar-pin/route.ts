import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { email, pin } = await request.json()
    if (!email || !pin) {
      return Response.json({ error: 'email y pin requeridos' }, { status: 400 })
    }
    const usuario = await db.verificarPIN(String(email), String(pin))
    if (!usuario) {
      return Response.json({ valido: false }, { status: 401 })
    }
    return Response.json({
      valido: true,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    })
  } catch (error) {
    console.error('Verificar PIN error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

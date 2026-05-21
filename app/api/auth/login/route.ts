import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { email, pin } = await request.json()

    if (!email || !pin) {
      return Response.json({ error: 'Email y PIN requeridos' }, { status: 400 })
    }

    const usuario = await db.verificarPIN(email, pin)

    if (!usuario) {
      return Response.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    return Response.json(usuario)
  } catch (error) {
    console.error('Login error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

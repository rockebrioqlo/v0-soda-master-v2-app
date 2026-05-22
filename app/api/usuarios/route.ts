import { db } from '@/lib/db'

export async function GET() {
  try {
    const usuarios = await db.getUsuarios()
    return Response.json(usuarios)
  } catch (error) {
    console.error('Get usuarios error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body?.email || !body?.nombre || !body?.rol) {
      return Response.json({ error: 'email, nombre y rol son requeridos' }, { status: 400 })
    }
    if (!body.pin && !body.pinHash && !body.pin_hash) {
      return Response.json({ error: 'PIN requerido' }, { status: 400 })
    }
    const newUsuario = await db.crearUsuario(body)
    return Response.json(newUsuario, { status: 201 })
  } catch (error: any) {
    console.error('Create usuario error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('usuarios_email_key') || message.includes('duplicate key')) {
      return Response.json({ error: 'Email ya registrado' }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

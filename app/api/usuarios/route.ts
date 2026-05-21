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
    const usuario = await request.json()
    const newUsuario = await db.crearUsuario(usuario)
    return Response.json(newUsuario)
  } catch (error) {
    console.error('Create usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { z } from 'zod'
import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    // Si pasan ?id=..., devolvemos solo ese usuario. Lo usa el polling
    // de verificación de sesión para no traer la lista completa cada
    // minuto y evitar falsos positivos por respuestas inconsistentes.
    // F16 (sesión 14.5a): la sesión se valida antes de cualquier rama y el estado de bloqueo por PIN
    // (sesión 4) solo lo ve el admin, también en la consulta de un solo usuario.
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (id) {
      if (!z.string().uuid().safeParse(id).success) {
        return Response.json({ error: 'id inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
      }
      const usuario = await db.getUsuarioById(id)
      if (!usuario) {
        return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
      }
      return Response.json(
        esAdminSesion(s.usuario) ? usuario : { ...usuario, intentosFallidos: 0, bloqueadoHasta: null },
      )
    }
    const usuarios = await db.getUsuarios()
    if (!esAdminSesion(s.usuario)) {
      return Response.json(
        usuarios.map((u) => ({ ...u, intentosFallidos: 0, bloqueadoHasta: null })),
      )
    }
    return Response.json(usuarios)
  } catch (error) {
    console.error('Get usuarios error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // F13 (14.5b-1): solo admin, por la tabla del proxy también dentro de la ruta. El esquema zod del body va con F44 (14.5b-2).
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
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

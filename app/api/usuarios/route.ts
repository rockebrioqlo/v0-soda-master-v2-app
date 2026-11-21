import { z } from 'zod'
import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'
import { UsuarioPostSchema } from '@/lib/usuarios-http'
import { leerBody } from '@/lib/validacion-http'

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
    // F13 (14.5b-1): solo admin, por la tabla del proxy también dentro de la ruta.
    // F44 (14.5b-2): esquema .strict() con `pin` en claro (4 a 8 dígitos); `pinHash`, `pin_hash` e `id` se
    // rechazan con 400 y su nombre: el servidor hashea y nunca acepta un hash del cliente. El email se normaliza.
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, UsuarioPostSchema, 'Datos del usuario')
    if (!parsed.ok) return parsed.respuesta
    const newUsuario = await db.crearUsuario(parsed.datos)
    return Response.json(newUsuario, { status: 201 })
  } catch (error: any) {
    console.error('Create usuario error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('usuarios_email_key') || message.includes('usuarios_email_norm_uk') || message.includes('duplicate key')) {
      return Response.json({ error: 'Email ya registrado' }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

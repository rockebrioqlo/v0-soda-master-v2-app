import { z } from 'zod'
import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

const Schema = z.object({ usuario_id: z.string().uuid() }).strict()

// Solo admin: quita el bloqueo por PIN fallidos de un usuario (todas sus claves: cada IP y la global) y reinicia sus
// contadores. Es la ÚNICA ruta que reinicia contadores además del ingreso correcto. (La interfaz en usuarios-page llega en la sesión 4.)
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta

    const parsed = Schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: 'usuario_id inválido' }, { status: 400 })
    }
    const usuario = await db.getUsuarioById(parsed.data.usuario_id)
    if (!usuario) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    const habiaRegistro = await db.desbloquearUsuario(usuario.email)
    return Response.json({ ok: true, usuario_id: usuario.id, tenia_intentos: habiaRegistro })
  } catch (error) {
    console.error('Desbloquear error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

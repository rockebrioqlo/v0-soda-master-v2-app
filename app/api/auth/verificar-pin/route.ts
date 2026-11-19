import { z } from 'zod'
import { db } from '@/lib/db'
import { ipDePeticion, requireSesion } from '@/lib/sesion'
import { rolesEfectivos } from '@/lib/permisos-api'
import { registrarExito, registrarFallo, respuestaSiBloqueado } from '@/lib/intentos-login'
import { emitirAutorizacionAdmin } from '@/lib/autorizacion-admin'

const Schema = z.object({
  email: z.string().trim().min(1).max(254),
  pin: z.string().min(1).max(32),
})

// El admin escribe su PIN en el dispositivo de otra persona. Exige una
// sesión abierta en ese dispositivo y cuenta para el límite de intentos.
// Si el PIN es de un admin, devuelve `autorizacion`: token firmado de
// 5 minutos que exigen las rutas de descuentos y mermas.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta

    const parsed = Schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: 'email y pin requeridos' }, { status: 400 })
    }
    const { email, pin } = parsed.data
    const ip = ipDePeticion(request)

    const bloqueo = await respuestaSiBloqueado(email, ip)
    if (bloqueo) return bloqueo

    const usuario = await db.verificarPIN(email, pin)
    if (!usuario) {
      const recienBloqueado = await registrarFallo(email, ip)
      if (recienBloqueado) return recienBloqueado
      return Response.json({ valido: false }, { status: 401 })
    }
    await registrarExito(email)

    const esAdmin = rolesEfectivos(usuario.rol, usuario.roles_adicionales).includes('admin')
    const autorizacion = esAdmin ? emitirAutorizacionAdmin(usuario.id) : null
    return Response.json({
      valido: true,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      autorizacion: autorizacion?.token ?? null,
      autorizacion_expira: autorizacion?.expira ?? null,
    })
  } catch (error) {
    console.error('Verificar PIN error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

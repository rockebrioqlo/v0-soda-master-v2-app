import { z } from 'zod'
import { db } from '@/lib/db'
import { crearSesion, ipDePeticion, revocarSesionDePeticion } from '@/lib/sesion'
import { registrarExito, registrarFallo, respuestaSiBloqueado } from '@/lib/intentos-login'

const LoginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  pin: z.string().min(1).max(32),
})

export async function POST(request: Request) {
  try {
    const parsed = LoginSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: 'Email y PIN requeridos' }, { status: 400 })
    }
    const { email, pin } = parsed.data
    const ip = ipDePeticion(request)

    const bloqueo = await respuestaSiBloqueado(email, ip)
    if (bloqueo) return bloqueo

    // verificarPIN ya rechaza usuarios desactivados (activo = false).
    const usuario = await db.verificarPIN(email, pin)
    if (!usuario) {
      const recienBloqueado = await registrarFallo(email, ip)
      if (recienBloqueado) return recienBloqueado
      return Response.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    await registrarExito(email)
    // Si el dispositivo traía otra sesión, se cierra antes de abrir la nueva.
    await revocarSesionDePeticion(request)
    const cookie = await crearSesion(usuario.id)

    return Response.json(usuario, { headers: { 'Set-Cookie': cookie } })
  } catch (error) {
    console.error('Login error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { z } from 'zod'
import { db } from '@/lib/db'
import { crearSesion, ipDePeticion, revocarSesionDePeticion } from '@/lib/sesion'
import { exitoIntento, falloIntento, iniciarIntento } from '@/lib/intentos-login'

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

    // F46 (14.5b-2): el intento se cuenta ANTES de verificar (un statement atómico por clave); si alguna
    // clave está bloqueada se responde 429 sin gastar bcrypt.
    const { respuesta, intento } = await iniciarIntento(email, ip)
    if (respuesta) return respuesta

    // verificarPIN ya rechaza usuarios desactivados (activo = false) y no distingue mayúsculas en el email.
    const usuario = await db.verificarPIN(email, pin)
    if (!usuario) {
      const recienBloqueado = falloIntento(intento)
      if (recienBloqueado) return recienBloqueado
      return Response.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // El éxito (reiniciar usuario + IP y devolver cupo) corre en paralelo con la apertura de la sesión: no suma
    // un viaje a la base al login. Si el dispositivo traía otra sesión, se cierra antes de abrir la nueva.
    const [, cookie] = await Promise.all([
      exitoIntento(intento),
      revocarSesionDePeticion(request).then(() => crearSesion(usuario.id)),
    ])

    return Response.json(usuario, { headers: { 'Set-Cookie': cookie } })
  } catch (error) {
    console.error('Login error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

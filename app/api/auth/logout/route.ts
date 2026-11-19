import { cookieBorrada, revocarSesionDePeticion } from '@/lib/sesion'

// Revoca la sesión de este dispositivo en la base y borra la cookie.
// Es pública a propósito: con una cookie vencida o inválida igual se borra.
export async function POST(request: Request) {
  try {
    await revocarSesionDePeticion(request)
  } catch (error) {
    console.error('Logout error:', error)
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookieBorrada() } })
}

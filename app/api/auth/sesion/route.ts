import { cookieBorrada, obtenerSesion } from '@/lib/sesion'

// Quién soy: el usuario de la sesión vigente, o 401 (y se borra la cookie).
// La app la llama al cargar y cada minuto para detectar sesiones cerradas
// o usuarios desactivados.
export async function GET(request: Request) {
  try {
    const usuario = await obtenerSesion(request)
    if (!usuario) {
      return Response.json(
        { error: 'Sesión requerida' },
        { status: 401, headers: { 'Set-Cookie': cookieBorrada() } },
      )
    }
    const { sesion_id: _sesionId, roles: _roles, ...datos } = usuario
    return Response.json(datos, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Get sesion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

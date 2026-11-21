import { cookieBorrada, resolverSesionDePeticion, respuestaSesionInvalida } from '@/lib/sesion'

// Quién soy: el usuario de la sesión vigente, o 401 (y se borra la cookie).
// La app la llama al cargar y cada minuto para detectar sesiones cerradas
// o usuarios desactivados. F42 (sesión 14.5a): es un sondeo, así que NUNCA renueva la actividad de la
// sesión (solo valida); el 401 trae `codigo` SESION_INACTIVA o SESION_VENCIDA cuando corresponde,
// para que el login muestre por qué se cerró.
export async function GET(request: Request) {
  try {
    const resuelta = await resolverSesionDePeticion(request)
    if (!resuelta.ok) {
      const respuesta = respuestaSesionInvalida(resuelta.motivo)
      respuesta.headers.set('Set-Cookie', cookieBorrada())
      return respuesta
    }
    const { sesion_id: _sesionId, roles: _roles, ...datos } = resuelta.usuario
    return Response.json(datos, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Get sesion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

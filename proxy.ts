/**
 * Proxy de Next 16 (antes "middleware"): primer control de acceso a la API.
 *
 * Para cada petición a /api/**:
 *   1. Si la ruta es pública según lib/permisos-api.ts, pasa.
 *   2. Si no hay cookie de sesión válida (firma + sesión vigente en la base
 *      + usuario activo) → 401.
 *   3. Si el rol no tiene permiso para esa ruta y método → 403.
 *
 * Las rutas que necesitan saber quién hace la acción vuelven a validar con
 * requireSesion() (lib/sesion.ts): la guía de Next 16 recomienda no dejar
 * toda la autorización solo en el proxy. El proxy corre en Node.js.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { accesoParaRuta, tieneAlgunRol } from '@/lib/permisos-api'
import { obtenerSesion } from '@/lib/sesion'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const metodo = request.method === 'HEAD' ? 'GET' : request.method
  const acceso = accesoParaRuta(pathname, metodo)

  if (acceso === 'publico') return NextResponse.next()

  let usuario
  try {
    usuario = await obtenerSesion(request)
  } catch (error) {
    console.error('[proxy] error validando sesión:', error)
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 })
  }

  if (!usuario) {
    return NextResponse.json({ error: 'Sesión requerida' }, { status: 401 })
  }

  if (acceso !== 'sesion' && !tieneAlgunRol(usuario.roles, acceso)) {
    return NextResponse.json({ error: 'No tienes permiso para esta acción' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

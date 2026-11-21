/**
 * Proxy de Next 16 (antes "middleware"): primer control de acceso a la API.
 *
 * Para cada petición a /api/**:
 *   1. Si la ruta es pública según lib/permisos-api.ts, pasa.
 *   2. Si la cookie no existe o su firma HMAC no es válida (se revisa en
 *      memoria, sin tocar la base) → 401. Estas peticiones tampoco se cuentan:
 *      su límite por IP lo hace la regla de Vercel WAF (README).
 *   3. Con firma válida, en paralelo: validar la sesión en la base (vigente,
 *      sin inactividad vencida, usuario activo; una acción real renueva la actividad, F42) y contar la petición de esa sesión (240/min, sesión 4).
 *      Sobre el límite → 429 con Retry-After. Sin sesión vigente → 401.
 *   4. Si el rol no tiene permiso para esa ruta y método → 403.
 *
 * Las rutas que necesitan saber quién hace la acción vuelven a validar con
 * requireSesion() (lib/sesion.ts): la guía de Next 16 recomienda no dejar
 * toda la autorización solo en el proxy. El proxy corre en Node.js.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { accesoParaRuta, tieneAlgunRol } from '@/lib/permisos-api'
import { COOKIE_SESION, hashToken, leerCookie, resolverSesion, respuestaSesionInvalida, tokenDeCookie } from '@/lib/sesion'
import { esPeticionSondeo } from '@/lib/sesion-reglas'
import { contarYLimitar } from '@/lib/limite-api'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const metodo = request.method === 'HEAD' ? 'GET' : request.method
  const acceso = accesoParaRuta(pathname, metodo)

  if (acceso === 'publico') return NextResponse.next()

  const token = tokenDeCookie(leerCookie(request, COOKIE_SESION))
  if (!token) {
    return NextResponse.json({ error: 'Sesión requerida' }, { status: 401 })
  }

  // F42: solo una acción real renueva la actividad de la sesión; el sondeo y las recargas
  // automáticas (cabecera x-sm-sondeo) la validan pero no la renuevan.
  const renovar = !esPeticionSondeo(pathname, request.headers)
  let resuelta
  let limite: Response | null
  try {
    ;[resuelta, limite] = await Promise.all([
      resolverSesion(token, { renovar }),
      contarYLimitar(hashToken(token)),
    ])
  } catch (error) {
    console.error('[proxy] error validando sesión:', error)
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 })
  }

  if (limite) return limite

  if (!resuelta.ok) {
    return respuestaSesionInvalida(resuelta.motivo)
  }
  const usuario = resuelta.usuario

  if (acceso !== 'sesion' && !tieneAlgunRol(usuario.roles, acceso)) {
    return NextResponse.json({ error: 'No tienes permiso para esta acción' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

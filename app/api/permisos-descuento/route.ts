import { db } from '@/lib/db'
import { requireSesion, requireAcceso } from '@/lib/sesion'
import { PermisosDescuentoSchema } from '@/lib/catalogo-http'
import { leerBody } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const data = await db.getPermisosDescuento()
    return Response.json(data)
  } catch (error) {
    console.error('Get permisos-descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    // Solo admin, según la sesión (la pantalla ya no manda `usuario_id`).
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, PermisosDescuentoSchema, 'Permisos de descuento')
    if (!parsed.ok) return parsed.respuesta
    const data = await db.actualizarPermisosDescuento(parsed.datos.permisos)
    return Response.json(data)
  } catch (error) {
    console.error('Patch permisos-descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso } from '@/lib/sesion'
import { CAMPOS_MESA_SOLO_ADMIN, MesaPatchSchema, MesaPostSchema } from '@/lib/catalogo-http'
import { leerBody } from '@/lib/validacion-http'
import { respuestaDeError } from '@/lib/ordenes-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const mesas = await db.getMesas()
    return Response.json(mesas)
  } catch (error) {
    console.error('Get mesas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Salón (mesero y cajero) solo cambia el `estado` de la mesa; nombre, capacidad, área y número son del admin
// (sesión 14.5b-1: antes cualquier rol de salón podía renumerar o redimensionar mesas).
export async function PATCH(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, MesaPatchSchema, 'Datos de la mesa')
    if (!parsed.ok) return parsed.respuesta
    const { id, ...updates } = parsed.datos
    if (!esAdminSesion(s.usuario) && CAMPOS_MESA_SOLO_ADMIN.some((c) => updates[c] !== undefined)) {
      return Response.json(
        { error: 'Solo el administrador puede cambiar el nombre, la capacidad, el área o el número de una mesa.', codigo: 'ROL_SIN_PERMISO' },
        { status: 403 },
      )
    }
    const mesa = await db.actualizarMesa(id, { ...updates, area: updates.area ?? undefined })
    return Response.json(mesa)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Update mesa error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, MesaPostSchema, 'Datos de la mesa')
    if (!parsed.ok) return parsed.respuesta
    const mesa = await db.crearMesa({ ...parsed.datos, area: parsed.datos.area ?? null })
    return Response.json(mesa, { status: 201 })
  } catch (error: any) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Create mesa error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('mesas_numero_key') || message.includes('duplicate key')) {
      return Response.json({ error: 'Número de mesa ya existe' }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

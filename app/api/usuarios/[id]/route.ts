import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerParamsRuta } from '@/lib/validacion-http'

const ROLES_VALIDOS = ['admin', 'administrador', 'mesero', 'cocina', 'bar', 'cajero']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const id = p.datos.id
    const updates = await request.json()
    if (updates.rol !== undefined && !ROLES_VALIDOS.includes(String(updates.rol))) {
      return Response.json({ error: 'Rol inválido' }, { status: 400 })
    }
    if (updates.roles_adicionales !== undefined) {
      if (!Array.isArray(updates.roles_adicionales)) {
        return Response.json(
          { error: 'roles_adicionales debe ser un arreglo' },
          { status: 400 },
        )
      }
      for (const r of updates.roles_adicionales) {
        if (!ROLES_VALIDOS.includes(String(r))) {
          return Response.json(
            { error: `Rol adicional inválido: ${r}` },
            { status: 400 },
          )
        }
      }
    }
    const usuario = await db.actualizarUsuario(id, updates)
    if (!usuario) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    // Desactivar a alguien cierra todas sus sesiones al instante.
    if (usuario.activo === false) {
      await db.revocarSesionesUsuario(usuario.id)
    }
    return Response.json(usuario)
  } catch (error) {
    console.error('Update usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const ok = await db.eliminarUsuario(p.datos.id)
    if (!ok) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

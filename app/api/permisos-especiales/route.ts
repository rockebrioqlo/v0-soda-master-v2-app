import { z } from 'zod'
import { db } from '@/lib/db'
import { booleanoConsulta, leerBody, leerConsulta, uuid } from '@/lib/validacion-http'
import { PermisoEspecialPatchSchema, PermisoEspecialPostSchema } from '@/lib/catalogo-http'
import { esAdminSesion, requireSesion } from '@/lib/sesion'

/**
 * Permisos delegados temporalmente (ej: admin → cajero, apertura de mesa).
 * - GET: listar; permite filtrar por ?usuario_id=… &tipo=… &solo_vigentes=true
 * - POST: otorgar nuevo permiso (admin)
 * - PATCH: revocar un permiso existente (admin)
 */
export async function GET(request: Request) {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(
      request,
      z
        .object({ usuario_id: uuid.optional(), tipo: z.string().max(40).optional(), solo_vigentes: booleanoConsulta.optional() })
        .strict(),
    )
    if (!q.ok) return q.respuesta
    // Un usuario que no es admin solo ve sus propios permisos.
    const usuarioId = esAdminSesion(s.usuario) ? q.datos.usuario_id : s.usuario.id
    const tipo = q.datos.tipo
    const soloVigentes = q.datos.solo_vigentes === 'true'
    const rows = await db.getPermisosEspeciales({
      usuario_id: usuarioId,
      tipo,
      solo_vigentes: soloVigentes,
    })
    return Response.json(rows)
  } catch (error: any) {
    console.error('GET /api/permisos-especiales error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Quien otorga es el admin de la sesión, no `otorgado_por` del body.
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, PermisoEspecialPostSchema, 'Datos del permiso')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const row = await db.otorgarPermisoEspecial({
      usuario_id: d.usuario_id,
      tipo: d.tipo,
      motivo: d.motivo ?? null,
      valido_hasta: d.valido_hasta,
      otorgado_por: s.usuario.id,
      otorgado_por_nombre: s.usuario.nombre,
    })
    return Response.json(row, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/permisos-especiales error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    // Quien revoca es el admin de la sesión.
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, PermisoEspecialPatchSchema, 'Datos del permiso')
    if (!parsed.ok) return parsed.respuesta
    const row = await db.revocarPermisoEspecial({
      id: parsed.datos.id,
      revocado_por: s.usuario.id,
      revocado_por_nombre: s.usuario.nombre,
    })
    return Response.json(row)
  } catch (error: any) {
    console.error('PATCH /api/permisos-especiales error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
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
    const { searchParams } = new URL(request.url)
    // Un usuario que no es admin solo ve sus propios permisos.
    const usuarioId = esAdminSesion(s.usuario)
      ? searchParams.get('usuario_id') || undefined
      : s.usuario.id
    const tipo = searchParams.get('tipo') || undefined
    const soloVigentes = searchParams.get('solo_vigentes') === 'true'
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
    const body = await request.json()
    const usuarioId = body?.usuario_id
    const tipo = (body?.tipo || '').toString().trim()
    const validoHasta = body?.valido_hasta
    const motivo = body?.motivo ?? null
    const otorgadoPor = s.usuario.id
    const otorgadoPorNombre = s.usuario.nombre

    if (!usuarioId) {
      return Response.json({ error: 'usuario_id requerido' }, { status: 400 })
    }
    if (!tipo) {
      return Response.json({ error: 'tipo requerido' }, { status: 400 })
    }
    if (!validoHasta) {
      return Response.json({ error: 'valido_hasta requerido' }, { status: 400 })
    }
    const row = await db.otorgarPermisoEspecial({
      usuario_id: usuarioId,
      tipo,
      motivo,
      valido_hasta: validoHasta,
      otorgado_por: otorgadoPor,
      otorgado_por_nombre: otorgadoPorNombre,
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
    const body = await request.json()
    const id = body?.id
    const revocadoPor = s.usuario.id
    const revocadoPorNombre = s.usuario.nombre
    if (!id) {
      return Response.json({ error: 'id requerido' }, { status: 400 })
    }
    const row = await db.revocarPermisoEspecial({
      id,
      revocado_por: revocadoPor,
      revocado_por_nombre: revocadoPorNombre,
    })
    return Response.json(row)
  } catch (error: any) {
    console.error('PATCH /api/permisos-especiales error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

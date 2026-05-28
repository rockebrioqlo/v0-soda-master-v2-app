import { db } from '@/lib/db'

/**
 * Permisos delegados temporalmente (ej: admin → cajero, apertura de mesa).
 * - GET: listar; permite filtrar por ?usuario_id=… &tipo=… &solo_vigentes=true
 * - POST: otorgar nuevo permiso (admin)
 * - PATCH: revocar un permiso existente (admin)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const usuarioId = searchParams.get('usuario_id') || undefined
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
    const body = await request.json()
    const usuarioId = body?.usuario_id
    const tipo = (body?.tipo || '').toString().trim()
    const validoHasta = body?.valido_hasta
    const motivo = body?.motivo ?? null
    const otorgadoPor = body?.otorgado_por
    const otorgadoPorNombre = body?.otorgado_por_nombre

    if (!usuarioId) {
      return Response.json({ error: 'usuario_id requerido' }, { status: 400 })
    }
    if (!tipo) {
      return Response.json({ error: 'tipo requerido' }, { status: 400 })
    }
    if (!validoHasta) {
      return Response.json({ error: 'valido_hasta requerido' }, { status: 400 })
    }
    if (!otorgadoPor || !otorgadoPorNombre) {
      return Response.json(
        { error: 'otorgado_por y otorgado_por_nombre requeridos' },
        { status: 400 },
      )
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
    const body = await request.json()
    const id = body?.id
    const revocadoPor = body?.revocado_por
    const revocadoPorNombre = body?.revocado_por_nombre
    if (!id || !revocadoPor || !revocadoPorNombre) {
      return Response.json(
        { error: 'id, revocado_por y revocado_por_nombre requeridos' },
        { status: 400 },
      )
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

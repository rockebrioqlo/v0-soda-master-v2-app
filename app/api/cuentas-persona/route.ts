import { db } from '@/lib/db'

/**
 * CRUD de personas que comparten una mesa/comanda.
 *
 * - GET ?orden_id=X      → lista las personas de esa orden.
 * - POST { orden_id, nombre? } → crea Persona N (idx autoasignado).
 * - PATCH { id, nombre } → renombra.
 * - DELETE { id }        → elimina (items vuelven a compartido).
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ordenId = searchParams.get('orden_id')
    if (!ordenId) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const rows = await db.getCuentasPersona(ordenId)
    return Response.json(rows)
  } catch (error: any) {
    console.error('GET /api/cuentas-persona error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ordenId = body?.orden_id || body?.ordenId
    if (!ordenId || typeof ordenId !== 'string') {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const nombre =
      typeof body?.nombre === 'string' && body.nombre.trim().length > 0
        ? body.nombre.trim()
        : null
    const row = await db.crearCuentaPersona({ orden_id: ordenId, nombre })
    return Response.json(row, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/cuentas-persona error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = body?.id
    if (!id || typeof id !== 'string') {
      return Response.json({ error: 'id requerido' }, { status: 400 })
    }
    const nombre =
      typeof body?.nombre === 'string' && body.nombre.trim().length > 0
        ? body.nombre.trim()
        : null
    const row = await db.renombrarCuentaPersona(id, nombre)
    return Response.json(row)
  } catch (error: any) {
    console.error('PATCH /api/cuentas-persona error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { searchParams } = new URL(request.url)
    const id = body?.id || searchParams.get('id')
    if (!id || typeof id !== 'string') {
      return Response.json({ error: 'id requerido' }, { status: 400 })
    }
    await db.eliminarCuentaPersona(id)
    return Response.json({ ok: true })
  } catch (error: any) {
    console.error('DELETE /api/cuentas-persona error:', error)
    return Response.json({ error: error?.message || 'Error en servidor' }, { status: 500 })
  }
}

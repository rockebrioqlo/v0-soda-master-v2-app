import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TIPOS_MERMA = new Set([
  'accidente',
  'vencido',
  'perdida_sin_explicacion',
  'consumo_interno',
  'error_preparacion',
  'robo',
])
const TIPOS_MERMA_ADMIN_ONLY = new Set(['robo', 'perdida_sin_explicacion'])

function esAdmin(rol?: string | null) {
  return rol === 'admin' || rol === 'administrador'
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const motivo = String(body.motivo || '')
    if (motivo !== 'merma' && motivo !== 'correccion_admin') {
      return Response.json(
        { error: "Motivo inválido. Usa 'merma' o 'correccion_admin'." },
        { status: 400 }
      )
    }
    const registradoPor = String(body.registrado_por || '')
    if (!registradoPor) {
      return Response.json({ error: 'registrado_por requerido' }, { status: 400 })
    }
    const usuario = await db.getUsuarioById(registradoPor)
    if (!usuario) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }
    if (motivo === 'correccion_admin' && !esAdmin(usuario.rol)) {
      return Response.json(
        { error: 'Solo el administrador puede hacer correcciones administrativas' },
        { status: 403 }
      )
    }
    let motivoMerma: string | null = null
    if (motivo === 'merma') {
      motivoMerma = String(body.motivo_merma || '')
      if (!TIPOS_MERMA.has(motivoMerma)) {
        return Response.json({ error: 'Tipo de merma inválido' }, { status: 400 })
      }
      if (TIPOS_MERMA_ADMIN_ONLY.has(motivoMerma) && !esAdmin(usuario.rol)) {
        return Response.json(
          { error: 'Solo el administrador puede registrar este tipo de merma' },
          { status: 403 }
        )
      }
    }

    const result = await db.eliminarIngredienteConMotivo({
      ingrediente_id: id,
      motivo: motivo as 'merma' | 'correccion_admin',
      motivo_merma: motivoMerma,
      descripcion: body.descripcion ? String(body.descripcion) : null,
      cantidad: body.cantidad !== undefined ? Number(body.cantidad) : null,
      registrado_por: registradoPor,
      registrado_por_nombre: usuario.nombre ?? null,
      registrado_por_rol: usuario.rol ?? null,
    })

    return Response.json(result)
  } catch (error) {
    console.error('DELETE ingrediente error:', error)
    const msg = error instanceof Error ? error.message : 'Error en servidor'
    const status =
      msg.includes('no encontrado') || msg.includes('ya está dado de baja')
        ? 400
        : msg.includes('Motivo') || msg.includes('Describe')
          ? 400
          : msg.includes('Stock insuficiente')
            ? 409
            : 500
    return Response.json({ error: msg }, { status })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json()
    const updates: Record<string, unknown> = {}
    if (body.nombre !== undefined) updates.nombre = String(body.nombre)
    if (body.categoria !== undefined) updates.categoria = String(body.categoria)
    if (body.unidad_medida !== undefined) updates.unidad_medida = String(body.unidad_medida)
    if (body.stock_actual !== undefined) updates.stock_actual = Number(body.stock_actual)
    if (body.stock_minimo !== undefined) updates.stock_minimo = Number(body.stock_minimo)
    if (body.costo_unitario !== undefined) updates.costo_unitario = Number(body.costo_unitario)
    if (body.tipo !== undefined && ['comida', 'negocio', 'otro'].includes(body.tipo)) {
      updates.tipo = body.tipo
    }
    if (body.activo !== undefined) updates.activo = !!body.activo

    const row = await db.actualizarIngrediente(id, updates as any)
    if (!row) return Response.json({ error: 'Ingrediente no encontrado' }, { status: 404 })
    return Response.json(row)
  } catch (error) {
    console.error('PATCH ingrediente error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

import { db } from '@/lib/db'

// Tipos válidos para mermas de productos. Mantener en sync con el
// endpoint /api/mermas (TIPOS_ADMIN_ONLY) para no permitir que un cajero
// abuse del flujo de "eliminar por merma" para reportar robo sin admin.
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const result = await db.eliminarProductoConMotivo({
      producto_id: id,
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
    console.error('DELETE producto error:', error)
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    if (typeof body.nombre === 'string') updates.nombre = body.nombre
    if (typeof body.descripcion === 'string') updates.descripcion = body.descripcion
    if (body.precio !== undefined) {
      const n = Number(body.precio)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'precio inválido' }, { status: 400 })
      }
      updates.precio = n
    }
    if (typeof body.categoria === 'string') updates.categoria = body.categoria
    if (typeof body.activo === 'boolean') updates.activo = body.activo
    if (body.es_ingrediente_especial !== undefined || body.esIngredienteEspecial !== undefined) {
      updates.esIngredienteEspecial = !!(body.es_ingrediente_especial ?? body.esIngredienteEspecial)
    }
    if (body.costo_adicional !== undefined || body.costoAdicional !== undefined) {
      const raw = body.costo_adicional ?? body.costoAdicional
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'costo_adicional inválido' }, { status: 400 })
      }
      updates.costoAdicional = n
    }
    if (typeof body.imagen_url === 'string') updates.imagen_url = body.imagen_url
    const modoRaw = body.modo_stock ?? body.modoStock
    if (modoRaw !== undefined) {
      const modo = String(modoRaw)
      if (!['producto', 'receta', 'producto_y_receta'].includes(modo)) {
        return Response.json({ error: 'modo_stock inválido' }, { status: 400 })
      }
      updates.modoStock = modo
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'Sin campos a actualizar' }, { status: 400 })
    }

    const updated = await db.actualizarProducto(id, updates as any)
    if (!updated) {
      return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('Patch producto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

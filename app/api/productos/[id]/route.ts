import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'
import { ProductoPatchSchema } from '@/lib/catalogo-http'
import { BajaConMotivoSchema } from '@/lib/mermas-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

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


export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const id = p.datos.id
    // Sesión y rol primero (F45, 14.5b-2: la tabla de acceso dice solo admin), luego el body.
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsedBody = await leerBody(request, BajaConMotivoSchema, 'Datos de la baja')
    if (!parsedBody.ok) return parsedBody.respuesta
    const body = parsedBody.datos
    const motivo = body.motivo
    // Quien registra es el usuario de la sesión (el cliente ya no manda `registrado_por`: se rechaza).
    const usuario = s.usuario
    const registradoPor = usuario.id
    if (motivo === 'correccion_admin' && !esAdminSesion(usuario)) {
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
      if (TIPOS_MERMA_ADMIN_ONLY.has(motivoMerma) && !esAdminSesion(usuario)) {
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
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, ProductoPatchSchema, 'Datos del producto')
    if (!parsed.ok) return parsed.respuesta
    const body = parsed.datos

    const updates: Record<string, unknown> = {}
    if (body.nombre !== undefined) updates.nombre = body.nombre
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.precio !== undefined) updates.precio = body.precio
    if (body.categoria !== undefined) updates.categoria = body.categoria
    if (body.activo !== undefined) updates.activo = body.activo
    if (body.es_ingrediente_especial !== undefined) updates.esIngredienteEspecial = body.es_ingrediente_especial
    if (body.costo_adicional !== undefined) updates.costoAdicional = body.costo_adicional
    if (body.imagen_url !== undefined) updates.imagen_url = body.imagen_url
    if (body.modo_stock !== undefined) updates.modoStock = body.modo_stock

    const updated = await db.actualizarProducto(p.datos.id, updates as any)
    if (!updated) {
      return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
    }
    return Response.json(updated)
  } catch (error) {
    console.error('Patch producto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

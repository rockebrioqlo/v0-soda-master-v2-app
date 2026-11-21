import { db } from '@/lib/db'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'
import { BajaConMotivoSchema } from '@/lib/mermas-http'
import { IngredientePatchSchema } from '@/lib/inventario-http'
import { leerBody, respuestaDeError } from '@/lib/ordenes-http'

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


export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido' }, { status: 400 })
    }
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

// Sesión 11: body con zod `.strict()` y solo admin. `stock_actual` ya no se acepta (400):
// el stock cambia por compras, ventas, mermas y `POST /api/ingredientes/[id]/ajuste`.
// Cambiar la unidad de consumo de un insumo con stock, recetas o movimientos → 409 UNIDAD_EN_USO.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'ID inválido', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
    }
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, IngredientePatchSchema, 'Datos del insumo')
    if (!parsed.ok) return parsed.respuesta
    const row = await db.actualizarIngrediente(id, parsed.datos)
    if (!row) {
      return Response.json({ error: 'Ingrediente no encontrado', codigo: 'INSUMO_NO_ENCONTRADO' }, { status: 404 })
    }
    return Response.json(row)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('PATCH ingrediente error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

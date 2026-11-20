import { z } from 'zod'
import { db, ErrorCobro } from '@/lib/db'
import { ERRORES_COBRO } from '@/lib/cobro'
import { requireSesion } from '@/lib/sesion'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') || undefined
    const pagos = await db.getPagos(fecha ? { fecha } : undefined)
    return Response.json(pagos)
  } catch (error) {
    console.error('Get pagos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Cobro seguro (sesión 5). El navegador solo dice QUÉ se cobra y cómo; los
// montos, el descuento, el IVA y el vuelto los calcula el servidor. Los
// campos que antes mandaba el navegador (monto, descuento, vuelto,
// usuario_id…) ya no existen: `.strict()` rechaza cualquier campo extra.
const dinero = z.number().int().min(0).max(100_000_000)

const CobroSchema = z
  .object({
    orden_id: z.string().uuid(),
    metodo: z.enum(['efectivo', 'tarjeta']),
    // Lo que la pantalla muestra como total (sin propina). Si no coincide con
    // el cálculo del servidor, el cobro se rechaza con 409.
    monto_esperado: dinero,
    // Pago parcial: ítems completos y/o parte de una línea (1 de 2).
    item_orden_ids: z.array(z.string().uuid()).max(200).optional(),
    item_partials: z
      .array(
        z
          .object({ id: z.string().uuid(), cantidad: z.number().int().positive().max(1000) })
          .strict(),
      )
      .max(200)
      .optional(),
    propina: z
      .object({
        tipo: z.enum(['porcentaje', 'monto']),
        valor: z.number().min(0).max(100_000_000),
      })
      .strict()
      .nullish(),
    dividido_en: z.number().int().min(1).max(20).optional(),
    efectivo_recibido: dinero.nullish(),
    referencia: z.string().trim().max(60).nullish(),
  })
  .strict()

export async function POST(request: Request) {
  try {
    // Quien cobra es el usuario de la sesión, nunca un id del body.
    const s = await requireSesion(request, ['admin', 'cajero'])
    if (!s.ok) return s.respuesta

    const parsed = CobroSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      const motivo = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ')
      return Response.json(
        { error: `Datos de cobro inválidos (${motivo})`, codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    const d = parsed.data

    const pago = await db.crearPago({
      orden_id: d.orden_id,
      metodo: d.metodo,
      monto_esperado: d.monto_esperado,
      item_orden_ids: d.item_orden_ids,
      item_partials: d.item_partials,
      propina: d.propina ?? null,
      dividido_en: d.dividido_en,
      efectivo_recibido: d.efectivo_recibido ?? null,
      referencia: d.referencia ?? null,
      usuario: { id: s.usuario.id, nombre: s.usuario.nombre },
    })
    return Response.json(pago, { status: 201 })
  } catch (error: any) {
    if (error instanceof ErrorCobro) {
      const def = ERRORES_COBRO[error.codigo] ?? { status: 409, mensaje: error.message }
      return Response.json(
        {
          error: error.message !== error.codigo ? error.message : def.mensaje,
          codigo: error.codigo,
          ...(error.detalle ?? {}),
        },
        { status: def.status },
      )
    }
    console.error('Create pago error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

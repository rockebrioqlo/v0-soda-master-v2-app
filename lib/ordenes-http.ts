/**
 * Validación y respuestas de error de las rutas de órdenes e ítems
 * (sesión 6). Los esquemas son `.strict()`: un campo que no está en la lista
 * se rechaza con 400 y su nombre, en vez de ignorarse o guardarse.
 */
import { z, ZodError } from 'zod'
import { ErrorItemOrden, ErrorOrden } from '@/lib/db'
import { DESTINOS_PATCH } from '@/lib/ordenes-reglas'

const uuid = z.string().uuid()

export const OrdenPostSchema = z
  .object({
    mesa_id: uuid,
    estado: z.enum(['pendiente', 'en_cocina']).optional(),
    notas: z.string().trim().max(500).optional(),
  })
  .strict()

export const OrdenPatchSchema = z
  .object({
    id: uuid,
    action: z.literal('enviar_cocina').optional(),
    estado: z.enum(DESTINOS_PATCH).optional(),
    notas: z.string().trim().max(500).optional(),
  })
  .strict()

export const IdSchema = z.object({ id: uuid }).strict()

export const ItemPostSchema = z
  .object({
    orden_id: uuid,
    producto_id: uuid,
    cantidad: z.number().int().min(1).max(999),
    modificadores: z.array(z.string().max(120)).max(50).optional(),
    seleccion_modificadores: z.array(z.string().max(120)).max(50).optional(),
    extras_ingredientes: z
      .array(
        z
          .object({ ingrediente_id: z.string().max(64), cantidad: z.number().min(0).max(20).optional() })
          .strict(),
      )
      .max(30)
      .optional(),
    notas_especiales: z.string().max(4000).nullish(),
    // Se aceptan por compatibilidad con pestañas antiguas, pero el servidor
    // calcula el precio y empieza siempre en 'pendiente': estos dos se ignoran.
    precio_unitario: z.number().optional(),
    estado_item: z.string().max(30).optional(),
  })
  .strict()

export const ItemPatchSchema = z
  .object({
    id: uuid,
    cantidad: z.number().int().min(1).max(999).optional(),
    estado_item: z.enum(['pendiente', 'en_preparacion', 'listo', 'entregado', 'problema']).optional(),
    notas_especiales: z.string().max(4000).nullable().optional(),
    modificadores: z.array(z.string().max(120)).max(50).optional(),
    // Ignorado salvo con `precio_manual` (solo admin).
    precio_unitario: z.number().min(0).max(100_000_000).optional(),
    precio_manual: z.boolean().optional(),
    motivo: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.precio_manual === true) {
      if (d.precio_unitario === undefined) {
        ctx.addIssue({ code: 'custom', path: ['precio_unitario'], message: 'Indica el precio manual' })
      }
      if (!d.motivo) {
        ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'El motivo del cambio de precio es obligatorio' })
      }
    }
  })

/** Lee el body JSON y lo valida; devuelve los datos o la respuesta 400 lista. */
export async function leerBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  etiqueta: string,
) {
  return validarBody(await request.json().catch(() => null), schema, etiqueta)
}

/** Valida un body ya leído. */
export function validarBody<T extends z.ZodTypeAny>(
  crudo: unknown,
  schema: T,
  etiqueta: string,
): { ok: true; datos: z.infer<T> } | { ok: false; respuesta: Response } {
  const parsed = schema.safeParse(crudo)
  if (parsed.success) return { ok: true, datos: parsed.data }
  const motivo = parsed.error.issues
    .slice(0, 3)
    .map((i) => {
      const campo = i.path.join('.') || 'body'
      return i.code === 'unrecognized_keys'
        ? `campo no permitido: ${(i as any).keys?.join(', ')}`
        : `${campo}: ${i.message}`
    })
    .join('; ')
  return {
    ok: false,
    respuesta: Response.json(
      { error: `${etiqueta} inválidos (${motivo})`, codigo: 'DATOS_INVALIDOS' },
      { status: 400 },
    ),
  }
}

/** Convierte un error de negocio en su respuesta HTTP; devuelve null si no lo es. */
export function respuestaDeError(error: unknown): Response | null {
  if (error instanceof ErrorOrden || error instanceof ErrorItemOrden) {
    return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status })
  }
  if (error instanceof ZodError) {
    return Response.json({ error: 'Datos inválidos', codigo: 'DATOS_INVALIDOS' }, { status: 400 })
  }
  return null
}

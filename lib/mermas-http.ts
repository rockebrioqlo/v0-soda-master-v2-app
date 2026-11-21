/**
 * Esquemas zod `.strict()` de mermas, del stock de productos (`inventario`) y de la baja de productos
 * e insumos con motivo (sesión 14.5b-2, F45). `registrado_por` y `usuario_id`, que mandaba el cliente,
 * son heredados y se rechazan: quién registra sale de la sesión.
 */
import { z } from 'zod'
import { uuid } from '@/lib/validacion-http'

export const TIPOS_MERMA_ROUTE = [
  'accidente',
  'vencido',
  'perdida_sin_explicacion',
  'consumo_interno',
  'comanda_no_pagada',
  'error_preparacion',
  'robo',
] as const

export const MOTIVOS_CNP_LISTA = ['cliente_se_fue', 'error_mesero', 'cortesia'] as const
export const CONSECUENCIAS_LISTA = ['descuento_liquidacion', 'solo_registro', 'amonestacion'] as const

/** Tipos de merma al dar de baja un producto o insumo (no incluye `comanda_no_pagada`). */
export const TIPOS_BAJA = [
  'accidente',
  'vencido',
  'perdida_sin_explicacion',
  'consumo_interno',
  'error_preparacion',
  'robo',
] as const

const texto = (max: number) => z.string().trim().max(max)

export const MermaPostSchema = z
  .object({
    tipo: z.enum(TIPOS_MERMA_ROUTE),
    cantidad: z.number().finite().positive().max(1_000_000),
    descripcion: texto(500).nullish(),
    producto_id: uuid.nullish(),
    comanda_no_pagada: z
      .object({
        orden_id: uuid,
        motivo: z.enum(MOTIVOS_CNP_LISTA),
        autorizacion: z.string().max(2000).nullish(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const MermaPatchSchema = z
  .object({
    responsable_id: uuid.nullable().optional(),
    consecuencia: z.enum(CONSECUENCIAS_LISTA).nullable().optional(),
    monto_descuento: z.number().finite().min(0).max(100_000_000).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Sin campos a actualizar' })

// ── Stock de productos vendibles (`inventario`) ─────────────────────────
const stockEntero = z.number().int().min(0).max(999_999_999)
const unidadMedida = z.string().trim().min(1).max(30)

export const InventarioPatchSchema = z
  .object({
    producto_id: uuid,
    stock_actual: stockEntero.optional(),
    stock_minimo: stockEntero.optional(),
    unidad_medida: unidadMedida.optional(),
  })
  .strict()

/** `PATCH /api/inventario/[id]`: el `id` va en la ruta. Sin el alias `cantidad` que nadie usaba. */
export const InventarioPatchPorIdSchema = z
  .object({
    stock_actual: stockEntero.optional(),
    stock_minimo: stockEntero.optional(),
    unidad_medida: unidadMedida.optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Sin campos a actualizar' })

// ── Baja de un producto o insumo con motivo (DELETE) ────────────────────
export const BajaConMotivoSchema = z
  .object({
    motivo: z.enum(['merma', 'correccion_admin']),
    motivo_merma: z.enum(TIPOS_BAJA).optional(),
    descripcion: texto(500).optional(),
    cantidad: z.number().finite().min(0).max(999_999_999).optional(),
  })
  .strict()

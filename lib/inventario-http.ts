/**
 * Validación de las rutas de insumos y compras (sesión 11). Los esquemas son
 * `.strict()`: un campo que no está en la lista se rechaza con 400 y su nombre.
 * `stock_actual` solo se acepta al CREAR un insumo (stock inicial, que deja un
 * movimiento `entrada`); después el stock solo cambia por compras, ventas, mermas
 * y `POST /api/ingredientes/[id]/ajuste`.
 */
import { z } from 'zod'

const uuid = z.string().uuid()
const TOPE_STOCK = 999_999_999
const TIPOS = ['comida', 'negocio', 'otro'] as const

/** Unidades de consumo y de compra: texto corto. */
const unidad = z.string().trim().min(1).max(30)

const camposInsumo = {
  nombre: z.string().trim().min(1).max(120),
  categoria: z.string().trim().min(1).max(60),
  unidad_medida: unidad,
  /** NULL o vacío = la misma unidad que la de consumo. */
  unidad_compra: z.string().trim().max(30).nullable(),
  /** Unidades de consumo por unidad de compra (decimal; el factor real se corrige en cada compra). */
  factor_compra: z.number().positive().max(1_000_000),
  /** 1 a 300 %: 75 → para 150 de receta se descuentan 200 del stock. */
  rendimiento_pct: z.number().min(1).max(300),
  stock_minimo: z.number().min(0).max(TOPE_STOCK),
  costo_unitario: z.number().min(0).max(1_000_000_000),
  tipo: z.enum(TIPOS),
}

export const IngredientePostSchema = z
  .object({
    nombre: camposInsumo.nombre,
    categoria: camposInsumo.categoria.optional(),
    unidad_medida: camposInsumo.unidad_medida.optional(),
    unidad_compra: camposInsumo.unidad_compra.optional(),
    factor_compra: camposInsumo.factor_compra.optional(),
    rendimiento_pct: camposInsumo.rendimiento_pct.optional(),
    stock_actual: z.number().min(0).max(TOPE_STOCK).optional(),
    stock_minimo: camposInsumo.stock_minimo.optional(),
    costo_unitario: camposInsumo.costo_unitario.optional(),
    tipo: camposInsumo.tipo.optional(),
  })
  .strict()

export const IngredientePatchSchema = z
  .object({
    nombre: camposInsumo.nombre.optional(),
    categoria: camposInsumo.categoria.optional(),
    unidad_medida: camposInsumo.unidad_medida.optional(),
    unidad_compra: camposInsumo.unidad_compra.optional(),
    factor_compra: camposInsumo.factor_compra.optional(),
    rendimiento_pct: camposInsumo.rendimiento_pct.optional(),
    stock_minimo: camposInsumo.stock_minimo.optional(),
    costo_unitario: camposInsumo.costo_unitario.optional(),
    tipo: camposInsumo.tipo.optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay nada que actualizar' })

export const AjusteStockSchema = z
  .object({
    stock_nuevo: z.number().min(0).max(TOPE_STOCK),
    motivo: z.string().trim().min(3).max(300),
  })
  .strict()

const ItemCompraSchema = z
  .object({
    ingrediente_id: uuid,
    /** En unidad de COMPRA (paquetes, cajas, kg…). */
    cantidad: z.number().positive().max(TOPE_STOCK),
    /** Precio por unidad de COMPRA. */
    precio_unitario: z.number().min(0).max(10_000_000_000),
    /** Unidades de consumo por unidad de compra; si falta, el del insumo. */
    factor: z.number().positive().max(1_000_000).nullish(),
    notas: z.string().trim().max(300).nullish(),
  })
  .strict()

export const CompraPostSchema = z
  .object({
    proveedor_id: uuid.nullish(),
    tipo_documento: z.enum(['boleta', 'factura', 'nota', 'otro']).optional(),
    numero_documento: z.string().trim().max(60).nullish(),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'usa aaaa-mm-dd')
      .nullish(),
    impuesto: z.number().min(0).max(10_000_000_000).optional(),
    notas: z.string().trim().max(500).nullish(),
    items: z.array(ItemCompraSchema).min(1).max(100),
  })
  .strict()

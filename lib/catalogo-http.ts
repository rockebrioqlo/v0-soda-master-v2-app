/**
 * Esquemas zod `.strict()` de productos, mesas, recetas, notificaciones y permisos (sesión 14.5b-1,
 * F31). Los campos son los que mandan hoy las pantallas; lo que no está aquí se rechaza con 400 y
 * su nombre. Quién actúa (otorgado_por, revocado_por, usuario_id…) sale de la sesión, nunca del body.
 */
import { z } from 'zod'
import { uuid } from '@/lib/validacion-http'

const texto = (max: number) => z.string().trim().max(max)
const dinero = z.number().finite().min(0).max(100_000_000)

// ── Productos ───────────────────────────────────────────────────────────
export const MODOS_STOCK = ['producto', 'receta', 'producto_y_receta'] as const

export const ProductoPostSchema = z
  .object({
    nombre: texto(120).min(1),
    categoria: texto(60).min(1),
    precio: dinero,
    descripcion: texto(500).optional(),
    imagen_url: texto(500).optional(),
  })
  .strict()

export const ProductoPatchSchema = z
  .object({
    nombre: texto(120).min(1).optional(),
    descripcion: texto(500).optional(),
    precio: dinero.optional(),
    categoria: texto(60).min(1).optional(),
    activo: z.boolean().optional(),
    es_ingrediente_especial: z.boolean().optional(),
    costo_adicional: dinero.optional(),
    imagen_url: texto(500).optional(),
    modo_stock: z.enum(MODOS_STOCK).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Sin campos a actualizar' })

export const ProductoClonarSchema = z
  .object({ nombre: texto(120).min(1), precio: dinero.nullish() })
  .strict()

// ── Mesas ───────────────────────────────────────────────────────────────
const MESA_CAMPOS = {
  capacidad: z.number().int().min(1).max(100).optional(),
  area: texto(60).nullish(),
  numero: z.number().int().min(1).max(9999).optional(),
  estado: z.enum(['libre', 'ocupada', 'reservada']).optional(),
}

export const MesaPostSchema = z
  .object({ nombre: texto(60).min(1).optional(), ...MESA_CAMPOS })
  .strict()

export const MesaPatchSchema = z.object({ id: uuid, ...MESA_CAMPOS }).strict()
export const MesaPatchPorIdSchema = z.object({ ...MESA_CAMPOS }).strict()

/** Campos de una mesa que solo cambia el admin (salón solo cambia `estado`). */
export const CAMPOS_MESA_SOLO_ADMIN = ['capacidad', 'area', 'numero'] as const

// ── Recetas ─────────────────────────────────────────────────────────────
const RecetaLineaSchema = z
  .object({
    ingrediente_id: uuid,
    // F31: una cantidad 0 (o negativa) se rechaza; antes se convertía en 1 sin avisar.
    cantidad: z.number().finite().gt(0, 'La cantidad debe ser mayor que 0').max(1_000_000),
    opcional: z.boolean().optional(),
    extra: z.boolean().optional(),
    costo_adicional: z.number().finite().min(0).max(10_000_000).optional(),
    nombre_display: texto(120).nullish(),
  })
  .strict()

export const RecetaPostSchema = z
  .object({
    producto_id: uuid,
    nombre: texto(120).optional(),
    modo_stock: z.enum(MODOS_STOCK).optional(),
    ingredientes: z.array(RecetaLineaSchema).max(200),
  })
  .strict()

// ── Notificaciones ──────────────────────────────────────────────────────
export const NotificacionPostSchema = z
  .object({
    tipo: z.enum(['problema', 'listo', 'nueva_orden']),
    orden_id: uuid.nullish(),
    mesa_nombre: texto(80).nullish(),
    mensaje: texto(300).min(1),
    destinatario_usuario_id: uuid.nullish(),
    destinatario_rol: z.enum(['admin', 'mesero', 'cajero', 'cocina', 'bar']).nullish(),
  })
  .strict()
  .refine((d) => !!d.destinatario_usuario_id || !!d.destinatario_rol, {
    message: 'Se requiere destinatario_usuario_id o destinatario_rol',
    path: ['destinatario_usuario_id'],
  })

export const NotificacionPatchSchema = z.object({ vista: z.literal(true) }).strict()

export const NotificacionConsultaSchema = z
  .object({
    solo_pendientes: z.enum(['true', 'false', '0', '1']).optional(),
    limite: z
      .string()
      .regex(/^\d{1,6}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(500))
      .optional(),
  })
  .strict()

// ── Permisos ────────────────────────────────────────────────────────────
export const PermisosDescuentoSchema = z
  .object({
    permisos: z
      .array(
        z
          .object({
            rol: z.enum(['admin', 'administrador', 'mesero', 'cajero', 'cocina', 'bar']),
            puede_aplicar: z.boolean(),
            limite_maximo: z.number().finite().min(0).max(100),
            requiere_motivo: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()

export const PermisoEspecialPostSchema = z
  .object({
    usuario_id: uuid,
    tipo: z.enum(['apertura_mesa']),
    valido_hasta: z.string().datetime({ offset: true }),
    motivo: texto(300).nullish(),
  })
  .strict()

export const PermisoEspecialPatchSchema = z.object({ id: uuid }).strict()

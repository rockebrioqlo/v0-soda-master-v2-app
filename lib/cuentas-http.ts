/**
 * Esquemas zod de las rutas de personas por mesa, asignaciones y pérdidas
 * (sesión 7). Todos `.strict()`: un campo que no está en la lista se rechaza
 * con 400 y su nombre. El usuario siempre sale de la sesión, nunca del body.
 */
import { z } from 'zod'

const uuid = z.string().uuid()

export const CuentaPersonaPostSchema = z
  .object({
    orden_id: uuid,
    nombre: z.string().trim().max(60).nullish(),
  })
  .strict()

export const CuentaPersonaPatchSchema = z
  .object({
    id: uuid,
    nombre: z.string().trim().max(60).nullable(),
  })
  .strict()

export const CuentaPersonaDeleteSchema = z.object({ id: uuid }).strict()

export const AsignacionesSchema = z
  .object({
    orden_id: uuid,
    asignaciones: z
      .array(
        z
          .object({
            item_orden_id: uuid,
            cantidad: z.number().int().min(1).max(999),
            cuenta_persona_id: uuid.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()

export const PerdidaPostSchema = z
  .object({
    orden_id: uuid,
    motivo: z.string().trim().min(3, 'Debes indicar un motivo (mínimo 3 caracteres)').max(300),
  })
  .strict()

export const PerdidaResolverSchema = z
  .object({
    perdida_id: uuid,
    // El monto del cliente sigue sin contrastarse con la pérdida: B3 (sesión 9).
    monto: z.number().positive().max(100_000_000).optional(),
    metodo: z.enum(['efectivo', 'tarjeta']).optional(),
    referencia: z.string().trim().max(60).nullish(),
  })
  .strict()

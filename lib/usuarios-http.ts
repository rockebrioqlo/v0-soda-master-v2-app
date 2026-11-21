/**
 * Esquemas zod `.strict()` de `POST /api/usuarios` y `PATCH /api/usuarios/[id]` (sesión 14.5b-2, F44 y F47).
 *
 * - El servidor recibe `pin` en claro y lo hashea; NUNCA acepta un hash del cliente: `pinHash`,
 *   `pin_hash` e `id` (y cualquier otro campo desconocido) se rechazan con 400 y su nombre.
 * - El email se normaliza (recortado y en minúsculas): la base tiene un índice único sobre
 *   `lower(btrim(email))`.
 * - `pin_actual` solo se manda al cambiar el PROPIO PIN (la ruta lo verifica y cuenta el intento para el
 *   bloqueo); al cambiar el de otro usuario no se pide.
 */
import { z } from 'zod'

export const ROLES_USUARIO = ['admin', 'administrador', 'mesero', 'cocina', 'bar', 'cajero'] as const

/** Entre 4 y 8 dígitos (la pantalla hoy deja de 4 a 6). */
export const pinSchema = z.string().regex(/^\d{4,8}$/, 'PIN de 4 a 8 dígitos')

const email = z.string().trim().toLowerCase().email().max(254)
const nombre = z.string().trim().min(1).max(80)
const rol = z.enum(ROLES_USUARIO)
const rolesAdicionales = z.array(rol).max(6)

export const UsuarioPostSchema = z
  .object({
    email,
    nombre,
    rol,
    roles_adicionales: rolesAdicionales.optional(),
    activo: z.boolean().optional(),
    pin: pinSchema,
  })
  .strict()

export const UsuarioPatchSchema = z
  .object({
    email: email.optional(),
    nombre: nombre.optional(),
    rol: rol.optional(),
    roles_adicionales: rolesAdicionales.optional(),
    activo: z.boolean().optional(),
    pin: pinSchema.optional(),
    /** El PIN vigente, solo al cambiar el propio. No se valida el formato: uno equivocado es un 401, no un 400. */
    pin_actual: z.string().min(1).max(32).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Sin campos a actualizar' })
  .refine((d) => d.pin_actual === undefined || d.pin !== undefined, {
    message: 'pin_actual solo va junto con pin',
    path: ['pin_actual'],
  })

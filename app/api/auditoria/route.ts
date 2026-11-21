import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { fechaYmd, leerConsulta, limite } from '@/lib/validacion-http'

const ConsultaSchema = z
  .object({
    entidad: z.string().trim().min(1).max(40).optional(),
    accion: z.string().trim().min(1).max(40).optional(),
    desde: fechaYmd.optional(),
    hasta: fechaYmd.optional(),
    limite: limite(500).optional(),
  })
  .strict()
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { message: 'desde no puede ser posterior a hasta', path: ['desde'] })

/**
 * Lectura de `auditoria_admin` (sesión 17, K1): solo admin (tabla de `lib/permisos-api.ts`). Filtros por
 * entidad, acción y fechas (hora de Santiago, `hasta` inclusive) y límite (por defecto 200, tope 500).
 * Los `detalles` de los accesos a datos personales llevan solo nombres de campo, nunca valores.
 */
export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, ConsultaSchema)
    if (!q.ok) return q.respuesta
    const filas = await db.getAuditoriaAdmin({
      entidad: q.datos.entidad,
      accion: q.datos.accion,
      desde: q.datos.desde,
      hasta: q.datos.hasta,
      limite: q.datos.limite,
    })
    return Response.json(filas)
  } catch (error) {
    console.error('GET auditoria error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

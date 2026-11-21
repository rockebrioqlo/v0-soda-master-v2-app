/**
 * Esquemas zod `.strict()` y respuestas de error de las rutas `/api/arco/**` (sesión 18, K1). Todo lo que decide el servidor
 * (`vence_en`, `estado`, `ingresada_por`, `resuelta_por`, el actor) NO se acepta del navegador.
 */
import { z } from 'zod'
import { limite, uuid } from '@/lib/validacion-http'
import { ErrorArco } from '@/lib/arco-reglas'
import { componerRespuesta } from '@/lib/arco-respuesta'

export const SolicitudNuevaSchema = z
  .object({
    tipo: z.enum(['acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad']),
    titular_tipo: z.enum(['usuario', 'empleado', 'proveedor']),
    titular_id: uuid,
    canal: z.enum(['presencial', 'correo', 'formulario', 'telefono', 'otro']),
  })
  .strict()

export const SolicitudesConsultaSchema = z
  .object({
    estado: z.enum(['pendiente', 'resuelta', 'rechazada']).optional(),
    limite: limite(500).optional(),
  })
  .strict()

export const ProrrogaSchema = z.object({ motivo: z.string().trim().min(10).max(500) }).strict()

export const ResolverSchema = z
  .object({
    resultado: z.enum(['atendida', 'rechazada']),
    respuesta: z.string().trim().min(10).max(4000),
  })
  .strict()

/** `es_persona_natural` solo aplica a proveedores (la ruta lo exige ahí). */
export const SuprimirSchema = z.object({ es_persona_natural: z.boolean().optional() }).strict()

/** Si el error es de las solicitudes ARCOP responde con su código y estado; si no, devuelve `null`. */
export function respuestaErrorArco(error: unknown): Response | null {
  if (error instanceof ErrorArco) {
    return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status })
  }
  return null
}

/** La solicitud con el texto sugerido de respuesta (borrador para revisión legal) cuando ya hay un resultado. */
export function conRespuestaSugerida<T extends { tipo: string; ingresada_en: unknown; resultado?: unknown }>(fila: T) {
  const sugerida = fila.resultado
    ? componerRespuesta({ tipo: fila.tipo, ingresada_en: fila.ingresada_en as string | Date | null, resultado: fila.resultado as any })
    : null
  return { ...fila, respuesta_sugerida: sugerida }
}

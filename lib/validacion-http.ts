/**
 * Validación común de las rutas de la API (sesión 14.5b-1, F14 y F31).
 *
 * - `leerBody` / `validarBody`: body con esquema zod (los esquemas son `.strict()`: un campo que no
 *   está en la lista se rechaza con su nombre).
 * - `leerConsulta`: parámetros de consulta (`?a=b`). Un valor vacío cuenta como ausente (como hacía
 *   el `|| undefined` de antes).
 * - `leerParamsRuta`: segmentos dinámicos (`/api/x/[id]`).
 * - Esquemas reutilizables: `uuid`, `fechaYmd`, `fechaOHoy`, `limite`, `booleanoConsulta`.
 *
 * Todo error de datos responde 400 con `codigo: 'DATOS_INVALIDOS'` (antes un uuid o una fecha
 * mal escritos llegaban a Postgres y salían como 500).
 */
import { z } from 'zod'

export const uuid = z.string().uuid()

function esFechaReal(s: string): boolean {
  const [a, m, d] = s.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

/** Fecha de calendario real `AAAA-MM-DD` (`2026-13-45` o `2026-02-31` no pasan). */
export const fechaYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha con formato AAAA-MM-DD')
  .refine(esFechaReal, 'fecha inexistente')

/** `hoy` o una fecha `AAAA-MM-DD` (lo que aceptan los filtros por fecha de `lib/db.ts`). */
export const fechaOHoy = z.union([z.literal('hoy'), fechaYmd])

/** Entero positivo de una consulta (`?limite=50`), de 1 a `max`. */
export const limite = (max = 500) =>
  z
    .string()
    .regex(/^\d{1,6}$/, 'número entero')
    .transform(Number)
    .pipe(z.number().int().min(1).max(max))

/** `true` o `false` escritos en la consulta. */
export const booleanoConsulta = z.enum(['true', 'false'])

type Resultado<T> = { ok: true; datos: T } | { ok: false; respuesta: Response }

export function respuestaDatosInvalidos(etiqueta: string, error: z.ZodError): Response {
  const motivo = error.issues
    .slice(0, 3)
    .map((i) => {
      const campo = i.path.join('.') || 'valor'
      return i.code === 'unrecognized_keys'
        ? `campo no permitido: ${(i as any).keys?.join(', ')}`
        : `${campo}: ${i.message}`
    })
    .join('; ')
  return Response.json(
    { error: `${etiqueta} inválidos (${motivo})`, codigo: 'DATOS_INVALIDOS' },
    { status: 400 },
  )
}

/** Valida un body ya leído. */
export function validarBody<T extends z.ZodTypeAny>(
  crudo: unknown,
  schema: T,
  etiqueta: string,
): Resultado<z.infer<T>> {
  const parsed = schema.safeParse(crudo)
  if (parsed.success) return { ok: true, datos: parsed.data }
  return { ok: false, respuesta: respuestaDatosInvalidos(etiqueta, parsed.error) }
}

/** Lee el JSON del body y lo valida. Un body ausente o que no es JSON da 400. */
export async function leerBody<T extends z.ZodTypeAny>(request: Request, schema: T, etiqueta: string) {
  return validarBody(await request.json().catch(() => null), schema, etiqueta)
}

/** Valida los parámetros de consulta (todos llegan como texto; el esquema decide el tipo). */
export function leerConsulta<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  etiqueta = 'Consulta',
): Resultado<z.infer<T>> {
  const crudo: Record<string, string> = {}
  for (const [clave, valor] of new URL(request.url).searchParams) {
    if (valor !== '') crudo[clave] = valor
  }
  return validarBody(crudo, schema, etiqueta)
}

/** Valida los segmentos dinámicos de la ruta (`{ params }` de un Route Handler). */
export async function leerParamsRuta<T extends z.ZodTypeAny>(
  params: Promise<Record<string, string>> | Record<string, string>,
  schema: T,
  etiqueta = 'Parámetros',
): Promise<Resultado<z.infer<T>>> {
  return validarBody(await params, schema, etiqueta)
}

/** Esquema del segmento `[id]` más común. */
export const IdRutaSchema = z.object({ id: uuid }).strict()

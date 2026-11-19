/**
 * Límite de peticiones a la API por sesión (sesión 4 del ROADMAP).
 *
 * - Solo cuenta peticiones con cookie de sesión de firma válida (verificada
 *   en memoria por el proxy). Las anónimas o con cookie falsa NO tocan la
 *   base: el proxy responde 401 antes. Su límite por IP lo hace la regla
 *   de Vercel WAF (ver README, "Rate limiting").
 * - Clave = `s:<hash del token>`, contador por ventana fija de 60 s en
 *   `soda_master.limite_peticiones`, un solo statement atómico. Se lanza
 *   en paralelo con la validación de sesión, sin sumar latencia.
 * - Fail-open: si la base falla al contar, la petición pasa (se registra
 *   el error) para que un problema de Neon no tumbe el POS.
 */
import { db } from '@/lib/db'

export const LIMITE_POR_SESION = 240 // peticiones por minuto

/** 429 con Retry-After. */
export function respuestaLimite(retryAfterSeg: number): Response {
  const seg = Math.max(1, Math.ceil(retryAfterSeg))
  return Response.json(
    { error: `Demasiadas peticiones. Espera ${seg} segundo${seg === 1 ? '' : 's'}.`, retry_after: seg },
    { status: 429, headers: { 'Retry-After': String(seg) } },
  )
}

/** Cuenta la petición. Devuelve la respuesta 429 si superó el límite, o null. */
export async function contarYLimitar(tokenHash: string): Promise<Response | null> {
  try {
    const { n, restanteSeg } = await db.contarPeticion(`s:${tokenHash}`)
    // Limpieza oportunista de contadores viejos (~1 % de las peticiones).
    if (Math.random() < 0.01) {
      db.limpiarContadoresViejos().catch((e) => console.error('[limite-api] limpieza:', e))
    }
    return n > LIMITE_POR_SESION ? respuestaLimite(restanteSeg) : null
  } catch (error) {
    console.error('[limite-api] error contando (fail-open):', error)
    return null
  }
}

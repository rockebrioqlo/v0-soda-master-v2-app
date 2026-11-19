/**
 * Pausa de los sondeos cuando la API responde 429 (sesión 4 del ROADMAP).
 * El wrapper de fetch (lib/app-context.tsx) llama `registrarLimite` y los
 * sondeos (notificaciones, KDS, caja, sesión, usuarios) revisan
 * `enPausaPorLimite()` antes de pedir datos.
 */
let pausaHastaMs = 0
let ultimoAvisoMs = 0

/** Marca la pausa. Devuelve true si conviene avisar al usuario (máx. un aviso cada 15 s). */
export function registrarLimite(retryAfterSeg: number): boolean {
  const seg = Number.isFinite(retryAfterSeg) && retryAfterSeg > 0 ? Math.min(retryAfterSeg, 120) : 10
  pausaHastaMs = Math.max(pausaHastaMs, Date.now() + seg * 1000)
  if (Date.now() - ultimoAvisoMs < 15_000) return false
  ultimoAvisoMs = Date.now()
  return true
}

export function enPausaPorLimite(): boolean {
  return Date.now() < pausaHastaMs
}

export function segundosDePausa(): number {
  return Math.max(0, Math.ceil((pausaHastaMs - Date.now()) / 1000))
}

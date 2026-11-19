/**
 * Límite de PIN fallidos (sesión 3 del ROADMAP), por usuario y por IP.
 *
 * - Por usuario (`u:<email>`): 3 fallos en 15 min → bloqueo de 5 min,
 *   que se duplica en cada bloqueo seguido (5, 10, 20, 40 min) hasta 1 h.
 *   Los bloqueos previos se olvidan tras 24 h sin fallos. También cuenta
 *   para emails que no existen, así la respuesta no revela qué cuentas hay.
 * - Por IP (`ip:<ip>`): 20 fallos en 15 min → bloqueo de 15 min. Es más
 *   holgado porque todas las tablets del local salen por la misma IP.
 *
 * Se aplica en /api/auth/login y /api/auth/verificar-pin. Un admin puede
 * quitar el bloqueo de un usuario con POST /api/auth/desbloquear.
 */
import { db, type ReglaIntentos } from '@/lib/db'

export const REGLA_USUARIO: ReglaIntentos = {
  umbral: 3,
  ventanaSeg: 15 * 60,
  bloqueoBaseSeg: 5 * 60,
  bloqueoMaxSeg: 60 * 60,
}

export const REGLA_IP: ReglaIntentos = {
  umbral: 20,
  ventanaSeg: 15 * 60,
  bloqueoBaseSeg: 15 * 60,
  bloqueoMaxSeg: 15 * 60,
}

export function claveUsuario(email: string): string {
  return `u:${email.trim().toLowerCase()}`
}

export function claveIp(ip: string): string {
  return `ip:${ip}`
}

/** Respuesta 429 con Retry-After, o null si no hay bloqueo vigente. */
export async function respuestaSiBloqueado(email: string, ip: string): Promise<Response | null> {
  const hasta = await db.getBloqueoVigente([claveUsuario(email), claveIp(ip)])
  return hasta ? respuestaBloqueo(hasta) : null
}

export function respuestaBloqueo(hasta: Date): Response {
  const segundos = Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 1000))
  const minutos = Math.ceil(segundos / 60)
  return Response.json(
    {
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
      bloqueado_hasta: hasta.toISOString(),
    },
    { status: 429, headers: { 'Retry-After': String(segundos) } },
  )
}

/** Registra el fallo en ambas claves. Si alguna quedó bloqueada, devuelve la respuesta 429. */
export async function registrarFallo(email: string, ip: string): Promise<Response | null> {
  const [hastaUsuario, hastaIp] = await Promise.all([
    db.registrarIntentoFallido(claveUsuario(email), REGLA_USUARIO),
    db.registrarIntentoFallido(claveIp(ip), REGLA_IP),
  ])
  const hasta = [hastaUsuario, hastaIp]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  return hasta ? respuestaBloqueo(hasta) : null
}

export async function registrarExito(email: string): Promise<void> {
  await db.limpiarIntentos(claveUsuario(email))
}

/**
 * Límite de PIN fallidos (sesión 3, rehecho en la 14.5b-2: F46, F48), en tres claves de `intentos_login`:
 *
 * - `ui:<email>|<ip>` (usuario + IP): 3 intentos → bloqueo de 5 min, que se duplica en cada bloqueo seguido
 *   (5, 10, 20, 40 min) hasta 1 h; los bloqueos previos se olvidan tras 24 h sin fallos. Es POR IP: alguien
 *   desde internet se bloquea a sí mismo y no al usuario legítimo en el local (F48). También cuenta para
 *   emails que no existen, así la respuesta no revela qué cuentas hay.
 * - `ug:<email>` (tope global del usuario): suma los intentos de TODAS las IPs que no tienen un ingreso
 *   correcto reciente de ese usuario (`ultimo_exito` de los últimos 30 días en su clave `ui:`). Cierra el ataque
 *   repartido en muchas IPs: 12 intentos en 1 h → bloqueo de 30 min que se duplica hasta 6 h. Las IPs con
 *   éxito reciente (el local) quedan exentas y solo responden a su propia clave `ui:`.
 * - `ip:<ip>`: 20 intentos en 15 min → bloqueo de 15 min. Es más holgado porque todas las tablets del local
 *   salen por la misma IP.
 *
 * El intento se CUENTA ANTES de verificar el PIN, en un statement atómico (`db.contarIntento`): una ráfaga
 * en paralelo ya no pasa toda la comprobación (F46). El intento que llega al umbral sí se verifica; si falla
 * responde 429 y si acierta el éxito deshace el bloqueo. El éxito reinicia la clave usuario + IP (y anota
 * `ultimo_exito`) y devuelve el cupo gastado en la clave global y en la de la IP, así 10 tablets que abren
 * turno juntas no se bloquean entre sí.
 *
 * Se aplica en `/api/auth/login`, `/api/auth/verificar-pin` y al cambiar el PROPIO PIN
 * (`PATCH /api/usuarios/[id]` con `pin_actual`). Un admin quita el bloqueo con `POST /api/auth/desbloquear`.
 */
import { db, type ReglaIntentos } from '@/lib/db'

export const REGLA_USUARIO_IP: ReglaIntentos = {
  umbral: 3,
  ventanaSeg: 15 * 60,
  bloqueoBaseSeg: 5 * 60,
  bloqueoMaxSeg: 60 * 60,
}

export const REGLA_GLOBAL_USUARIO: ReglaIntentos = {
  umbral: 12,
  ventanaSeg: 60 * 60,
  bloqueoBaseSeg: 30 * 60,
  bloqueoMaxSeg: 6 * 60 * 60,
}

export const REGLA_IP: ReglaIntentos = {
  umbral: 20,
  ventanaSeg: 15 * 60,
  bloqueoBaseSeg: 15 * 60,
  bloqueoMaxSeg: 15 * 60,
}

/** Días que dura la exención del tope global tras un ingreso correcto desde una IP. */
export const EXENCION_DIAS = 30

export function respuestaBloqueo(hasta: Date): Response {
  const segundos = Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 1000))
  const minutos = Math.ceil(segundos / 60)
  return Response.json(
    {
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
      codigo: 'PIN_BLOQUEADO',
      bloqueado_hasta: hasta.toISOString(),
    },
    { status: 429, headers: { 'Retry-After': String(segundos) } },
  )
}

/** Lo que `iniciarIntento` recuerda para cerrar el intento (éxito o fallo) sin volver a leer la base. */
export interface Intento {
  email: string
  ip: string
  /** Se cuenta en la clave global solo si la IP no tiene un éxito reciente. */
  global: { activadoAhora: boolean } | null
  ip_: { activadoAhora: boolean }
  /** Fin del bloqueo que ESTE intento activó (si lo activó): si falla, el 429 usa esta fecha. */
  bloqueoNuevo: Date | null
}

/**
 * Cuenta el intento y decide si se puede verificar el PIN. Devuelve `respuesta` (429) si alguna clave
 * está bloqueada: en ese caso NO se debe verificar nada (ni gastar bcrypt). Si no, devuelve el `intento`
 * que hay que cerrar con `falloIntento` o `exitoIntento`.
 */
export async function iniciarIntento(
  email: string,
  ip: string,
): Promise<{ respuesta: Response; intento?: undefined } | { respuesta: null; intento: Intento }> {
  // Limpieza oportunista de contadores viejos (sin tareas periódicas): 1 de cada 20 intentos.
  if (Math.random() < 0.05) await db.limpiarIntentosViejos(EXENCION_DIAS).catch(() => {})

  const ui = await db.contarIntento('ui:', email, `|${ip}`, REGLA_USUARIO_IP, EXENCION_DIAS)
  if (ui.bloqueado && ui.hasta) return { respuesta: respuestaBloqueo(ui.hasta) }

  const [ug, ipc] = await Promise.all([
    ui.exento ? null : db.contarIntento('ug:', email, '', REGLA_GLOBAL_USUARIO, EXENCION_DIAS),
    db.contarIntento('ip:', '', ip, REGLA_IP, EXENCION_DIAS),
  ])
  const bloqueada = [ug, ipc].find((c) => c && c.bloqueado && c.hasta)
  if (bloqueada && bloqueada.hasta) return { respuesta: respuestaBloqueo(bloqueada.hasta) }

  const activados = [ui, ug, ipc]
    .filter((c): c is NonNullable<typeof c> => !!c && c.activadoAhora && !!c.hasta)
    .map((c) => c.hasta as Date)
    .sort((a, b) => b.getTime() - a.getTime())
  return {
    respuesta: null,
    intento: {
      email,
      ip,
      global: ug ? { activadoAhora: ug.activadoAhora } : null,
      ip_: { activadoAhora: !!ipc?.activadoAhora },
      bloqueoNuevo: activados[0] ?? null,
    },
  }
}

/** El PIN era incorrecto: no hay nada que escribir (el intento ya se contó). 429 si este intento activó un bloqueo. */
export function falloIntento(intento: Intento): Response | null {
  return intento.bloqueoNuevo ? respuestaBloqueo(intento.bloqueoNuevo) : null
}

/** El PIN era correcto: reinicia usuario + IP (y anota el éxito) y devuelve el cupo de la IP y el global. */
export async function exitoIntento(intento: Intento): Promise<void> {
  await Promise.all([
    db.registrarExitoUsuarioIp(intento.email, intento.ip),
    intento.global
      ? db.devolverCupoIntento('ug:', intento.email, '', intento.global.activadoAhora, REGLA_GLOBAL_USUARIO.umbral)
      : null,
    db.devolverCupoIntento('ip:', '', intento.ip, intento.ip_.activadoAhora, REGLA_IP.umbral),
  ])
}

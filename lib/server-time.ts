// Servicio de hora autoritativa para el sistema.
//
// Objetivo: que las operaciones del POS no dependan del reloj del
// computador del cajero. El "reloj oficial" lo decide el servidor,
// sincronizado contra `ntp.shoa.cl` (Hora Oficial de Chile,
// http://www.shoa.cl/php/horaoficial.php) cuando es posible, y con
// fallback a NTP-over-HTTPS si UDP no está disponible (típicamente en
// entornos serverless como Vercel).
//
// Esta hora se usa para:
//  - Endpoint `/api/hora` que el frontend consume para mostrar
//    relojes, validar formularios y avisar al cajero si su reloj
//    local está muy desfasado.
//  - NO se usa para `created_at` de las tablas: ese viene del
//    `DEFAULT now()` de Postgres, que ya es autoritativo en UTC y
//    está sincronizado por la infraestructura cloud (Neon/AWS NTP).
//    Lo dejamos así porque sumar otra dependencia para cada INSERT
//    sería frágil y costoso.

import dgram from 'node:dgram'

export type SNTPSource = 'sntp' | 'http' | 'system' | 'cache'

export interface ServerTimeInfo {
  // Milisegundos epoch del "ahora" según la fuente autoritativa.
  now_ms: number
  now_iso: string
  // Offset entre el reloj del servidor Node y la fuente NTP, en ms.
  // Positivo = el servidor adelantado respecto al NTP oficial.
  // Negativo = el servidor atrasado.
  offset_ms: number
  // Fuente que se logró usar.
  source: SNTPSource
  // Endpoint específico usado (host:port o URL).
  endpoint: string
  // Cuándo se sincronizó por última vez (ms epoch del reloj del server).
  synced_at_ms: number
  // Edad del cache en ms (0 si recién sincronizado).
  cache_age_ms: number
}

interface InternalState {
  offset_ms: number
  source: SNTPSource
  endpoint: string
  synced_at_ms: number
}

let _state: InternalState = {
  offset_ms: 0,
  source: 'system',
  endpoint: 'system clock',
  synced_at_ms: 0,
}
let _syncing: Promise<InternalState> | null = null

// Resincronizamos cada 10 minutos. Más frecuente sería innecesario:
// el reloj del servidor Node se desvía típicamente <10ms/h.
const TTL_MS = 10 * 60 * 1000

const NTP_HOSTS = ['ntp.shoa.cl', 'horaoficial.cl']
const NTP_PORT = 123
const NTP_TIMEOUT_MS = 1500
// 70 años en segundos: diferencia entre 1900-01-01 (epoch NTP) y
// 1970-01-01 (epoch Unix), incluyendo 17 años bisiestos.
const NTP_UNIX_EPOCH_OFFSET = 2208988800

/**
 * Cliente SNTP mínimo (RFC 4330). Funciona en entornos con UDP
 * habilitado. En Vercel serverless lanza ENETUNREACH/EACCES.
 */
async function consultarSNTP(host: string): Promise<{ offset_ms: number; endpoint: string }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const buffer = Buffer.alloc(48)
    // LI=0 (sin warning), VN=4 (versión 4), Mode=3 (client)
    buffer[0] = 0b00_100_011

    const t1 = Date.now()
    let cerrado = false

    const cerrar = () => {
      if (cerrado) return
      cerrado = true
      try {
        socket.close()
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      cerrar()
      reject(new Error(`SNTP timeout (${host})`))
    }, NTP_TIMEOUT_MS)

    socket.once('error', (err) => {
      clearTimeout(timer)
      cerrar()
      reject(err)
    })

    socket.once('message', (msg) => {
      clearTimeout(timer)
      cerrar()
      const t4 = Date.now()
      try {
        // El timestamp "Transmit" del servidor ocupa los bytes 40..47
        // (segundos + fracción). Convertimos a ms epoch Unix.
        const secs = msg.readUInt32BE(40)
        const fracs = msg.readUInt32BE(44)
        const serverMs =
          (secs - NTP_UNIX_EPOCH_OFFSET) * 1000 + Math.round((fracs / 0x100000000) * 1000)
        // Asumimos round-trip simétrico: ajustamos por (t4 - t1)/2.
        const rtt = t4 - t1
        const offset = serverMs + rtt / 2 - t4
        resolve({ offset_ms: offset, endpoint: `${host}:${NTP_PORT}` })
      } catch (e) {
        reject(e)
      }
    })

    socket.send(buffer, NTP_PORT, host, (err) => {
      if (err) {
        clearTimeout(timer)
        cerrar()
        reject(err)
      }
    })
  })
}

/**
 * Fallback HTTPS si no podemos hacer UDP. Usamos `worldtimeapi.org`
 * (devuelve hora oficial para America/Santiago en JSON). Si está
 * caído, el último recurso es el header Date del propio worldtimeapi
 * o cualquier servidor HTTPS conocido.
 */
async function consultarHTTPS(): Promise<{ offset_ms: number; endpoint: string }> {
  const url = 'https://worldtimeapi.org/api/timezone/America/Santiago'
  const t1 = Date.now()
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(2500),
  })
  const t4 = Date.now()
  if (!res.ok) throw new Error(`HTTP ${res.status} de worldtimeapi`)
  const body = (await res.json()) as { unixtime?: number; utc_datetime?: string }
  let serverMs: number
  if (typeof body.unixtime === 'number') {
    serverMs = body.unixtime * 1000
  } else if (body.utc_datetime) {
    serverMs = Date.parse(body.utc_datetime)
  } else {
    throw new Error('Respuesta inválida de worldtimeapi')
  }
  const rtt = t4 - t1
  const offset = serverMs + rtt / 2 - t4
  return { offset_ms: offset, endpoint: url }
}

async function sincronizar(): Promise<InternalState> {
  // 1) Intentamos UDP/NTP contra hosts oficiales chilenos.
  for (const host of NTP_HOSTS) {
    try {
      const { offset_ms, endpoint } = await consultarSNTP(host)
      return {
        offset_ms,
        source: 'sntp',
        endpoint,
        synced_at_ms: Date.now(),
      }
    } catch (err) {
      // En serverless esto fallará; lo registramos a debug.
      if (process.env.DEBUG_NTP) {
        console.warn(`[server-time] SNTP ${host} falló:`, err)
      }
    }
  }
  // 2) Fallback HTTPS.
  try {
    const { offset_ms, endpoint } = await consultarHTTPS()
    return {
      offset_ms,
      source: 'http',
      endpoint,
      synced_at_ms: Date.now(),
    }
  } catch (err) {
    if (process.env.DEBUG_NTP) {
      console.warn('[server-time] HTTPS time fallback falló:', err)
    }
  }
  // 3) Último recurso: reloj del propio servidor (en Vercel/Neon
  //    eso ya está sincronizado vía NTP cloud, así que el error es
  //    minúsculo, pero el `source: 'system'` nos avisa que no
  //    pudimos contrastar con ntp.shoa.cl).
  return {
    offset_ms: 0,
    source: 'system',
    endpoint: 'system clock',
    synced_at_ms: Date.now(),
  }
}

async function ensureSync(forzar = false): Promise<InternalState> {
  const ahora = Date.now()
  if (!forzar && _state.synced_at_ms > 0 && ahora - _state.synced_at_ms < TTL_MS) {
    return _state
  }
  if (_syncing) return _syncing
  _syncing = sincronizar()
    .then((nuevo) => {
      _state = nuevo
      return nuevo
    })
    .finally(() => {
      _syncing = null
    })
  return _syncing
}

/**
 * Devuelve la hora autoritativa del sistema en ms epoch.
 * Equivalente a `Date.now()` pero ajustado por el offset NTP.
 */
export function getServerNowMs(state: InternalState = _state): number {
  return Date.now() + state.offset_ms
}

/**
 * Devuelve un `Date` autoritativo. Si no se sincronizó nunca, fuerza
 * un sync. Si ya hay caché vigente, lo usa.
 */
export async function getServerTimeInfo(opts: { forzar?: boolean } = {}): Promise<ServerTimeInfo> {
  const state = await ensureSync(!!opts.forzar)
  const nowMs = getServerNowMs(state)
  return {
    now_ms: nowMs,
    now_iso: new Date(nowMs).toISOString(),
    offset_ms: state.offset_ms,
    source: state.source,
    endpoint: state.endpoint,
    synced_at_ms: state.synced_at_ms,
    cache_age_ms: Date.now() - state.synced_at_ms,
  }
}

/**
 * Versión sincrónica (no fuerza fetch). Devuelve la hora con la última
 * info disponible. Útil cuando necesitamos calcular fechas en código
 * sincrónico y no queremos awaitear.
 */
export function getServerTimeInfoSync(): ServerTimeInfo {
  const nowMs = getServerNowMs()
  return {
    now_ms: nowMs,
    now_iso: new Date(nowMs).toISOString(),
    offset_ms: _state.offset_ms,
    source: _state.synced_at_ms === 0 ? 'system' : 'cache',
    endpoint: _state.endpoint,
    synced_at_ms: _state.synced_at_ms,
    cache_age_ms: _state.synced_at_ms === 0 ? 0 : Date.now() - _state.synced_at_ms,
  }
}

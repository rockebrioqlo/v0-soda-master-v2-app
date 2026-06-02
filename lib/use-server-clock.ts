'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ServerClockState {
  // Offset (ms) entre el reloj del servidor y el del cliente.
  // serverNow = clientNow + offsetMs
  offsetMs: number
  // Última vez que sincronizamos (epoch ms del reloj del cliente).
  syncedAtMs: number
  // Fuente reportada por el servidor ('sntp' | 'http' | 'system' | 'cache').
  source: string
  endpoint: string
  // True cuando ya logramos contactar al servidor al menos una vez.
  ready: boolean
}

const INITIAL: ServerClockState = {
  offsetMs: 0,
  syncedAtMs: 0,
  source: 'system',
  endpoint: '',
  ready: false,
}

// Cuánto se permite que el reloj del cliente esté desfasado respecto
// al servidor antes de mostrar un aviso. Por debajo de esto, los
// timestamps locales son lo suficientemente precisos para mostrar
// "hace X minutos" sin confundir al usuario.
export const DESFASE_ACEPTABLE_MS = 60_000

/**
 * Hook para usar la hora autoritativa del servidor. El componente
 * obtiene el offset una vez al montar y lo refresca cada 5 min. La
 * función `now()` devuelve la hora del servidor estimada al instante,
 * sumando el offset al reloj local (no requiere ida y vuelta al
 * server).
 */
export function useServerClock() {
  const [state, setState] = useState<ServerClockState>(INITIAL)
  const stateRef = useRef(state)
  stateRef.current = state

  const sincronizar = useCallback(async () => {
    try {
      const t1 = Date.now()
      const res = await fetch('/api/hora', { cache: 'no-store' })
      const t2 = Date.now()
      if (!res.ok) return
      const data = await res.json()
      if (typeof data?.now_ms !== 'number') return
      // Ajustamos por RTT/2 asumiendo simetría.
      const rtt = t2 - t1
      const offset = data.now_ms + rtt / 2 - t2
      setState({
        offsetMs: offset,
        syncedAtMs: Date.now(),
        source: String(data?.sync?.source || 'system'),
        endpoint: String(data?.sync?.endpoint || ''),
        ready: true,
      })
    } catch {
      // Silencioso: si no se puede sincronizar, el frontend sigue
      // usando el reloj local sin ofrecer aviso de desfase.
    }
  }, [])

  useEffect(() => {
    sincronizar()
    const id = window.setInterval(sincronizar, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [sincronizar])

  const serverNow = useCallback(() => {
    const s = stateRef.current
    return new Date(Date.now() + s.offsetMs)
  }, [])

  return {
    ...state,
    serverNow,
    sincronizar,
  }
}

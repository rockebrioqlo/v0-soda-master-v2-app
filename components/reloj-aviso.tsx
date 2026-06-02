'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { useServerClock, DESFASE_ACEPTABLE_MS } from '@/lib/use-server-clock'

function formatearOffset(ms: number) {
  const abs = Math.abs(ms)
  const horas = Math.floor(abs / 3_600_000)
  const minutos = Math.floor((abs % 3_600_000) / 60_000)
  const segundos = Math.floor((abs % 60_000) / 1000)
  if (horas > 0) return `${horas}h ${minutos}m`
  if (minutos > 0) return `${minutos}m ${segundos}s`
  return `${segundos}s`
}

/**
 * Banner discreto que aparece SOLO cuando el reloj del computador del
 * cajero está significativamente desfasado respecto al sistema. No
 * afecta operaciones (las ventas se registran con la hora de la BD),
 * pero ayuda al cajero a notar el problema.
 */
export function RelojAviso() {
  const clock = useServerClock()
  const [hora, setHora] = useState<string>('')

  useEffect(() => {
    if (!clock.ready) return
    const actualizar = () => {
      const d = clock.serverNow()
      setHora(
        d.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'America/Santiago',
          hour12: false,
        }),
      )
    }
    actualizar()
    const id = window.setInterval(actualizar, 1000)
    return () => window.clearInterval(id)
  }, [clock])

  if (!clock.ready) return null

  const desfasado = Math.abs(clock.offsetMs) > DESFASE_ACEPTABLE_MS
  if (!desfasado) return null

  const direccion = clock.offsetMs > 0 ? 'atrasado' : 'adelantado'

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">Tu reloj está {direccion} ~{formatearOffset(clock.offsetMs)}</span>{' '}
        respecto a la hora oficial del sistema. Las ventas se registran con la hora del sistema
        ({hora} {clock.source === 'sntp' ? '— NTP Chile' : ''}), no del computador. Ajusta el
        reloj para evitar confusiones.
      </div>
      <Clock className="h-4 w-4 shrink-0 opacity-70" />
    </div>
  )
}

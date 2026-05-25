'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { AlertCircle, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Toast global de notificaciones. Reacciona al state.notificaciones (que
 * incluye tanto las locales como las traídas vía polling desde
 * `/api/notificaciones`). Cuando el usuario cierra una notificación o pasan
 * 10 segundos, se marca como vista en backend para que el polling no la
 * vuelva a entregar en otro dispositivo del mismo usuario.
 */
export function NotificacionesToast() {
  const { state, navigateToPOS, marcarNotificacionVistaApi } = useApp()
  const [notificacionesVisibles, setNotificacionesVisibles] = useState<string[]>([])
  const dismissedRef = useRef<Set<string>>(new Set())

  // Promote new (no-vista) notifications into the visible toast queue
  useEffect(() => {
    state.notificaciones.forEach((notif) => {
      if (notif.vista) return
      if (dismissedRef.current.has(notif.id)) return
      if (notificacionesVisibles.includes(notif.id)) return
      setNotificacionesVisibles((prev) => [...prev, notif.id])
    })
  }, [state.notificaciones, notificacionesVisibles])

  // Auto-dismiss after 10s (problemas) or 6s (listo). Problemas duran más
  // porque requieren acción del mesero.
  useEffect(() => {
    if (notificacionesVisibles.length === 0) return
    const timers: number[] = []
    for (const id of notificacionesVisibles) {
      const notif = state.notificaciones.find((n) => n.id === id)
      if (!notif) continue
      const ttl = notif.tipo === 'problema' ? 10000 : 6000
      const handle = window.setTimeout(() => handleDismiss(id), ttl)
      timers.push(handle)
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificacionesVisibles])

  const handleDismiss = (id: string) => {
    if (dismissedRef.current.has(id)) return
    dismissedRef.current.add(id)
    setNotificacionesVisibles((prev) => prev.filter((x) => x !== id))
    void marcarNotificacionVistaApi(id)
  }

  const handleIrAPOS = (notif: { id: string; ordenId?: string | null; mesaNombre?: string | null }) => {
    handleDismiss(notif.id)
    // navigateToPOS espera mesaId; las notificaciones de problema vienen con
    // ordenId pero no con mesaId. Pasamos sólo ordenId y dejamos que el POS
    // resuelva la mesa por la comanda.
    if (notif.ordenId) {
      navigateToPOS('', notif.ordenId)
    }
  }

  const notificacionesPorMostrar = state.notificaciones.filter((n) =>
    notificacionesVisibles.includes(n.id),
  )

  if (notificacionesPorMostrar.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md space-y-3">
      {notificacionesPorMostrar.map((notif) => {
        const esProblema = notif.tipo === 'problema'
        const esListo = notif.tipo === 'listo'
        return (
          <div
            key={notif.id}
            className={cn(
              'rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-5',
              esProblema && 'border-red-500 bg-red-500/10',
              esListo && 'border-green-500 bg-green-500/10',
              !esProblema && !esListo && 'border-amber-500 bg-amber-500/10',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                {esProblema ? (
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                ) : esListo ? (
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                )}
                <div>
                  <p className="font-semibold text-foreground">{notif.mensaje}</p>
                  {esProblema && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ir a POS para resolver o cambiar items
                      {notif.mesaNombre ? ` de ${notif.mesaNombre}` : ''}.
                    </p>
                  )}
                  {esListo && notif.mesaNombre && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pasa a retirar a {notif.mesaNombre}.
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismiss(notif.id)}
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {esProblema && notif.ordenId && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/40 text-red-600 hover:bg-red-500/10"
                  onClick={() => handleIrAPOS(notif)}
                >
                  Ir a POS
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

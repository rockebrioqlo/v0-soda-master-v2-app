'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NotificacionesToast() {
  const { state, dispatch } = useApp()
  const [notificacionesVisibles, setNotificacionesVisibles] = useState<string[]>([])

  // Show notifications
  useEffect(() => {
    state.notificaciones.forEach(notif => {
      if (!notif.vista && !notificacionesVisibles.includes(notif.id)) {
        setNotificacionesVisibles(prev => [...prev, notif.id])
        dispatch({ type: 'MARCAR_NOTIFICACION_VISTA', payload: notif.id })

        // Auto-hide after 8 seconds
        const timeout = setTimeout(() => {
          setNotificacionesVisibles(prev => prev.filter(id => id !== notif.id))
        }, 8000)

        return () => clearTimeout(timeout)
      }
    })
  }, [state.notificaciones, notificacionesVisibles, dispatch])

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md space-y-3">
      {state.notificaciones.map(notif => (
        notificacionesVisibles.includes(notif.id) && (
          <div
            key={notif.id}
            className={cn(
              'rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-5',
              notif.tipo === 'problema' && 'border-red-500 bg-red-500/10'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">{notif.mensaje}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {notif.tipo === 'problema' && `Ir a POS para resolver o cambiar items de ${notif.mesaNombre}`}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotificacionesVisibles(prev => prev.filter(id => id !== notif.id))
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      ))}
    </div>
  )
}

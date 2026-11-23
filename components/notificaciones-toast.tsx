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
// Sesión 21b (K2): los avisos de "problema" (algo que el mesero debe resolver) no se cierran solos y, como los errores de
// `showToast`, se muestran como máximo 3 a la vez: al entrar uno nuevo sale el más viejo (sin marcarlo como visto en el
// backend, así no se pierde: reaparece al recargar o en otro dispositivo).
const MAX_PROBLEMAS = 3

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
      setNotificacionesVisibles((prev) => {
        const siguiente = [...prev, notif.id]
        const problemas = siguiente.filter(
          (id) => state.notificaciones.find((n) => n.id === id)?.tipo === 'problema',
        )
        const hora = (id: string) => state.notificaciones.find((n) => n.id === id)?.timestamp ?? 0
        // el más viejo es el de menor `timestamp` (un sondeo puede traer varios a la vez, en cualquier orden)
        const sobran = [...problemas]
          .sort((a, b) => hora(a) - hora(b))
          .slice(0, Math.max(0, problemas.length - MAX_PROBLEMAS))
        sobran.forEach((id) => dismissedRef.current.add(id))
        return siguiente.filter((id) => !sobran.includes(id))
      })
    })
  }, [state.notificaciones, notificacionesVisibles])

  // Auto-dismiss a los 6 s (listo y demás). Los problemas requieren acción del mesero: no se cierran solos
  // (sesión 21b, decisión del 23-11-2026), solo con la X o con "Ir a POS".
  useEffect(() => {
    if (notificacionesVisibles.length === 0) return
    const timers: number[] = []
    for (const id of notificacionesVisibles) {
      const notif = state.notificaciones.find((n) => n.id === id)
      if (!notif) continue
      if (notif.tipo === 'problema') continue
      const ttl = 6000
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

  // Sesión 21a (K2, #3): dos regiones siempre montadas para que un lector anuncie lo que entra: los problemas con
  // role="alert" (anuncio inmediato) y el resto con role="status" (educado).
  const renderNotif = (notif: (typeof notificacionesPorMostrar)[number]) => {
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
              className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={() => handleIrAPOS(notif)}
            >
              Ir a POS
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md space-y-3">
      <div role="alert" className="space-y-3">
        {notificacionesPorMostrar.filter((n) => n.tipo === 'problema').map(renderNotif)}
      </div>
      <div role="status" className="space-y-3">
        {notificacionesPorMostrar.filter((n) => n.tipo !== 'problema').map(renderNotif)}
      </div>
    </div>
  )
}

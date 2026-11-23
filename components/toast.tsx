'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
}

let toastListeners: ((toasts: Toast[]) => void)[] = []
let toasts: Toast[] = []
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]))
}

// Sesión 21a (K2, #3): los errores no se cierran solos (WCAG 2.2.1: quien usa un lector o tarda en leer los perdía a los
// 4 s) y hay como máximo 3 a la vez: al entrar uno nuevo sale el más viejo. Los demás avisos siguen en 4 s.
const MAX_ERRORES = 3

function quitarToast(id: string) {
  const timer = toastTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    toastTimers.delete(id)
  }
  toasts = toasts.filter(t => t.id !== id)
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).substring(2, 9)
  if (type === 'error') {
    const errores = toasts.filter(t => t.type === 'error')
    errores.slice(0, Math.max(0, errores.length - (MAX_ERRORES - 1))).forEach(t => quitarToast(t.id))
  }
  toasts.push({ id, message, type })
  notifyListeners()

  if (type !== 'error') {
    toastTimers.set(id, setTimeout(() => {
      toastTimers.delete(id)
      toasts = toasts.filter(t => t.id !== id)
      notifyListeners()
    }, 4000))
  }
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setCurrentToasts(newToasts)
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
      // C7: sin contenedor montado no queda nadie que mostrar los toasts: se cancelan los timers
      if (toastListeners.length === 0) {
        toastTimers.forEach(t => clearTimeout(t))
        toastTimers.clear()
        toasts = []
      }
    }
  }, [])

  const removeToast = (id: string) => {
    quitarToast(id)
    notifyListeners()
  }

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  const getStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'border-green-500/30 bg-green-500/10'
      case 'error':
        return 'border-red-500/30 bg-red-500/10'
      case 'warning':
        return 'border-yellow-500/30 bg-yellow-500/10'
      default:
        return 'border-blue-500/30 bg-blue-500/10'
    }
  }

  const renderToast = (toast: Toast) => (
    <div
      key={toast.id}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg animate-in slide-in-from-right-5 motion-reduce:animate-none',
        getStyles(toast.type)
      )}
    >
      <span aria-hidden="true">{getIcon(toast.type)}</span>
      <span className="text-sm text-foreground">{toast.message}</span>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        aria-label="Cerrar aviso"
        className="ml-2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )

  // Dos regiones siempre montadas (un lector solo anuncia lo que cambia en una región que ya existía):
  // los errores con role="alert" (anuncio inmediato) y el resto con role="status" (anuncio educado).
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      <div role="alert" className="flex flex-col gap-2">
        {currentToasts.filter(t => t.type === 'error').map(renderToast)}
      </div>
      <div role="status" className="flex flex-col gap-2">
        {currentToasts.filter(t => t.type !== 'error').map(renderToast)}
      </div>
    </div>
  )
}

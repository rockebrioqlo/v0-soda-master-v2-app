'use client'

import * as React from 'react'

/**
 * Sesión 21a (K2, #9): los diálogos que se abren por estado (`open={...}`) no tienen un `Trigger` al que Radix
 * devuelva el foco al cerrarse, y el foco caía en `body`. Aquí se guarda el elemento que tenía el foco en el momento
 * de abrir y se restaura al cerrar (si sigue en el documento). Lo usan `dialog.tsx`, `sheet.tsx` y `alert-dialog.tsx`.
 */
const OpenerContext = React.createContext<React.MutableRefObject<HTMLElement | null> | null>(null)

export function OpenerProvider({ open, children }: { open?: boolean; children: React.ReactNode }) {
  const opener = React.useRef<HTMLElement | null>(null)
  const estabaAbierto = React.useRef(false)
  // Layout effect: corre antes de que el FocusScope de Radix mueva el foco al diálogo.
  React.useLayoutEffect(() => {
    if (open && !estabaAbierto.current) {
      const activo = document.activeElement
      opener.current = activo instanceof HTMLElement && activo !== document.body ? activo : null
    }
    estabaAbierto.current = !!open
  }, [open])
  return <OpenerContext.Provider value={opener}>{children}</OpenerContext.Provider>
}

/** Manejador de `onCloseAutoFocus`: respeta el que ya traiga el diálogo y, si no lo impidió, devuelve el foco al que lo abrió. */
export function useRestaurarFoco(propio?: (event: Event) => void) {
  const opener = React.useContext(OpenerContext)
  return (event: Event) => {
    propio?.(event)
    if (event.defaultPrevented) return
    const el = opener?.current
    if (el && el.isConnected) {
      event.preventDefault()
      el.focus()
    }
  }
}

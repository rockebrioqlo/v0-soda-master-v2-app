"use client"

import { useEffect } from "react"

export function ResizeObserverFix() {
  useEffect(() => {
    // Suppress ResizeObserver loop error - this is a benign error that occurs
    // with components like Recharts that use ResizeObserver
    const resizeObserverError = (e: ErrorEvent) => {
      if (e.message === "ResizeObserver loop completed with undelivered notifications.") {
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener("error", resizeObserverError)

    return () => {
      window.removeEventListener("error", resizeObserverError)
    }
  }, [])

  return null
}

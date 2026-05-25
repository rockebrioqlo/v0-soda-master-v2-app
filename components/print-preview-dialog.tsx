'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  buildMultiTicketHtml,
  buildTicketHtml,
  normalizePrintConfig,
  type TicketData,
  type TicketPrintConfig,
} from '@/lib/print-ticket'
import { showToast } from '@/components/toast'

interface PrintPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ticket único a imprimir. Para múltiples copias usa `tickets`. */
  data?: TicketData | null
  /**
   * Lista de tickets a imprimir como un único documento separado por saltos
   * de página. Útil para el KDS doble (cocina + bar en un solo trabajo).
   * Si está presente, tiene prioridad sobre `data`.
   */
  tickets?: TicketData[] | null
  config: Partial<TicketPrintConfig> | TicketPrintConfig
  /** Título del dialog (default "Vista previa de impresión") */
  title?: string
  /** Texto opcional para el botón de cierre (default "Cerrar") */
  closeLabel?: string
  /** Callback al cerrar (después del print o cancelación) */
  onClosed?: () => void
}

/**
 * Dialog reutilizable que muestra la previsualización del ticket configurado
 * y permite imprimirlo. La previsualización se renderiza en un iframe aislado
 * usando exactamente el mismo HTML que se mandará a la impresora, así lo
 * que se ve es lo que se imprime, sea térmica de 58mm, 80mm o A4.
 */
export function PrintPreviewDialog({
  open,
  onOpenChange,
  data,
  tickets,
  config,
  title,
  closeLabel = 'Cerrar',
  onClosed,
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [zoom, setZoom] = useState(1)

  const normalized = useMemo(() => normalizePrintConfig(config), [config])

  // `tickets` (lista) tiene prioridad sobre `data` (single).
  const ticketsList = useMemo<TicketData[]>(() => {
    if (Array.isArray(tickets) && tickets.length > 0) return tickets
    if (data) return [data]
    return []
  }, [tickets, data])

  const hasContent = ticketsList.length > 0

  const html = useMemo(() => {
    if (!hasContent) return ''
    if (ticketsList.length === 1) return buildTicketHtml(ticketsList[0], normalized)
    return buildMultiTicketHtml(ticketsList, normalized)
  }, [ticketsList, normalized, hasContent])

  // Reset zoom cada vez que se abre el dialog
  useEffect(() => {
    if (open) setZoom(1)
  }, [open])

  const handlePrint = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) {
      showToast('No se pudo iniciar la impresión', 'error')
      return
    }
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch (err) {
      console.error('print failed', err)
      showToast('Tu navegador bloqueó la impresión. Revisa los permisos.', 'error')
    }
  }

  const handleClose = (next: boolean) => {
    onOpenChange(next)
    if (!next) onClosed?.()
  }

  // Ancho del iframe en píxeles aproximados (1mm ≈ 3.78px a 96dpi)
  const widthPx = Math.round(normalized.ancho_mm * 3.78)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Printer className="h-5 w-5" />
            {title || 'Vista previa de impresión'}
          </DialogTitle>
          <DialogDescription>
            {normalized.ancho_mm} mm · {normalized.tamano_fuente_pt} pt · margen {normalized.margen_mm} mm
            {ticketsList.length > 1 ? ` · ${ticketsList.length} copias` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2">
          <div className="text-xs text-muted-foreground">
            Lo que se ve aquí es exactamente lo que se enviará a la impresora.
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              title="Reducir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
              title="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex max-h-[60vh] justify-center overflow-auto bg-zinc-200 p-6 dark:bg-zinc-900">
          {hasContent ? (
            <div
              className="origin-top bg-white shadow-lg"
              style={{
                width: `${widthPx}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Vista previa de ticket"
                srcDoc={html}
                style={{
                  width: `${widthPx}px`,
                  minHeight: '300px',
                  border: 'none',
                  display: 'block',
                  background: 'white',
                }}
                /* sandbox sin allow-scripts: HTML estático */
                sandbox="allow-same-origin allow-modals"
                onLoad={(e) => {
                  // Ajustar alto del iframe al contenido para que se vea completo en preview
                  const target = e.currentTarget
                  try {
                    const doc = target.contentDocument
                    if (doc) {
                      const height = doc.documentElement.scrollHeight
                      target.style.height = `${Math.max(height, 300)}px`
                    }
                  } catch {
                    /* same-origin permitido por sandbox */
                  }
                }}
              />
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Sin datos para imprimir</div>
          )}
        </div>

        <DialogFooter className="border-t border-border p-4">
          <Button variant="outline" onClick={() => handleClose(false)}>
            <X className="mr-2 h-4 w-4" /> {closeLabel}
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!hasContent}
            className="bg-amber-500 text-zinc-900 hover:bg-amber-400"
          >
            <Printer className="mr-2 h-4 w-4" />
            {ticketsList.length > 1 ? `Imprimir ${ticketsList.length} copias` : 'Imprimir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatTime, getElapsedTime } from '@/lib/helpers'
import { Check, ChefHat, Wine, Clock, AlertCircle, Zap, RefreshCw, Printer, History } from 'lucide-react'
import { showToast } from '@/components/toast'
import type { Comanda, ItemComanda } from '@/lib/types'
import { PrintPreviewDialog } from '@/components/print-preview-dialog'
import { KDSHistorialDialog } from '@/components/kds-historial-dialog'
import {
  readPrintConfigFromState,
  splitComandaParaEstaciones,
  type TicketData,
} from '@/lib/print-ticket'

export function KDSPage() {
  const { state, updateOrden, actualizarItemOrden, recargarOrdenes, crearNotificacionApi } = useApp()
  const { comandas, usuarioActual, productos, configuracion } = state
  const [isLoading, setIsLoading] = useState(false)
  const [, setTick] = useState(0)
  const [reimprimirTickets, setReimprimirTickets] = useState<TicketData[]>([])
  const [showReimprimirDialog, setShowReimprimirDialog] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const printConfig = readPrintConfigFromState(configuracion)
  const nombreNegocio =
    configuracion?.nombre_negocio || configuracion?.nombreRestaurante || 'Soda Master'

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Serverless-friendly sync: no sockets, just a light refresh while KDS is visible.
  useEffect(() => {
    let cancelled = false
    let running = false

    const refresh = async () => {
      if (cancelled || running || document.visibilityState !== 'visible') return
      running = true
      try {
        await recargarOrdenes()
      } finally {
        running = false
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 7000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [recargarOrdenes])

  // Manual refresh - viable for serverless (no polling)
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      await recargarOrdenes()
      showToast('Ordenes actualizadas', 'success')
    } catch {
      showToast('Error al actualizar', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter comandas that are still being prepared in cocina/bar.
  // Once the comanda transitions to 'listo' or 'entregado' it is the mesero's
  // responsibility (delivery widget in POS), so the KDS drops it.
  const comandasActivas = comandas.filter(
    (c) => c.estado === 'en_cocina' || c.estado === 'en_preparacion'
  )

  const CATEGORIAS_BAR = ['bebidas', 'cervezas', 'jugos_bebidas', 'tragos']

  const isBarItem = (item: ItemComanda) => {
    if (item.categoria) return CATEGORIAS_BAR.includes(item.categoria)
    const producto = productos.find((p) => p.id === item.productoId)
    return CATEGORIAS_BAR.includes(producto?.categoria || '')
  }

  const isCocinaItem = (item: ItemComanda) => !isBarItem(item)

  // Dejamos los ítems 'listo' a la vista (en verde tachado) para que el
  // cocinero/bartender vea qué ya completó dentro de esa comanda; sólo
  // ocultamos 'entregado' (eso ya está fuera de su estación). El card
  // sólo se quita por completo cuando TODOS los ítems pasaron a listo
  // (y la orden cambia a estado 'listo'), que es manejado por
  // `comandasActivas` arriba.
  const getComandasForSection = (filterFn: (item: ItemComanda) => boolean) =>
    comandasActivas
      .map((comanda) => ({
        ...comanda,
        items: comanda.items.filter(
          (item) => filterFn(item) && item.estado !== 'entregado'
        ),
      }))
      .filter((comanda) => comanda.items.length > 0)

  const comandasCocina = getComandasForSection(isCocinaItem)
  const comandasBar = getComandasForSection(isBarItem)

  const handleMarkReady = async (comandaId: string, estado: string, itemIds: string[]) => {
    const comanda = comandas.find((c) => c.id === comandaId)
    if (!comanda) return

    if (estado === 'problema') {
      await Promise.all(itemIds.map((itemId) => actualizarItemOrden(itemId, { estado_item: 'problema' })))
      await updateOrden(comandaId, { estado: 'problema' })
      showToast(`Comanda ${comanda.mesaNombre} con problema - notificando al mesero`, 'error')
      // Notificación persistente al mesero que tomó la orden. El polling
      // del lado del mesero (otro dispositivo) la recogerá y mostrará el
      // toast aunque esté en otra pantalla.
      if (comanda.usuarioId) {
        void crearNotificacionApi({
          tipo: 'problema',
          orden_id: comandaId,
          mesa_nombre: comanda.mesaNombre,
          mensaje: `Problema en orden de ${comanda.mesaNombre}. Revisar en POS.`,
          destinatario_usuario_id: comanda.usuarioId,
        })
      }
    } else {
      await Promise.all(itemIds.map((itemId) => actualizarItemOrden(itemId, { estado_item: estado })))
      const itemIdsSet = new Set(itemIds)
      const itemsActualizados = comanda.items.map((item) =>
        itemIdsSet.has(item.id) ? { ...item, estado: estado as ItemComanda['estado'] } : item
      )
      const todosListos = itemsActualizados.length > 0 && itemsActualizados.every((item) => item.estado === 'listo')
      // El estado de la ORDEN refleja lo "mas avanzado" de sus items pero
      // sin saltarse: si marcamos sólo uno como listo, la orden sigue en
      // 'en_preparacion' y nadie en el KDS la pierde de vista. Recién
      // cuando TODOS quedaron listos, la orden pasa a 'listo' y sale del
      // KDS hacia el widget de entregas.
      const estadoOrden = estado === 'listo'
        ? (todosListos ? 'listo' : 'en_preparacion')
        : estado
      await updateOrden(comandaId, { estado: estadoOrden })
      await recargarOrdenes()

      // Toast con contexto: si fue un solo ítem, mencionamos su nombre.
      // Si fueron varios (bulk), avisamos cuántos.
      const itemsAfectados = comanda.items.filter((it) => itemIdsSet.has(it.id))
      const accion =
        estado === 'en_preparacion'
          ? 'en preparación'
          : estado === 'listo'
            ? todosListos
              ? 'lista para entregar'
              : 'listo'
            : estado
      let detalle: string
      if (itemsAfectados.length === 1) {
        const it = itemsAfectados[0]
        detalle = `${it.productoNombre}`
      } else {
        detalle = `${itemsAfectados.length} items`
      }
      showToast(`${comanda.mesaNombre} • ${detalle} — ${accion}`, 'success')

      // Cuando toda la comanda quedó lista, avisar al mesero para que la
      // retire. Esto cierra el ciclo cocina↔mesero sin requerir que el
      // mesero esté mirando el KDS.
      if (estado === 'listo' && todosListos && comanda.usuarioId) {
        void crearNotificacionApi({
          tipo: 'listo',
          orden_id: comandaId,
          mesa_nombre: comanda.mesaNombre,
          mensaje: `Orden de ${comanda.mesaNombre} lista para retirar.`,
          destinatario_usuario_id: comanda.usuarioId,
        })
      }
    }
  }

  const isNewComanda = (comanda: Comanda) => Date.now() - comanda.creadoAt < 30000
  const isDelayedComanda = (comanda: Comanda) =>
    Date.now() - comanda.creadoAt > 15 * 60 * 1000

  /**
   * Reimprime la copia física de la estación indicada para esta comanda.
   * Útil cuando el ticket original se perdió o el KDS falla.
   */
  const handleReimprimir = (comanda: Comanda, estacion: 'cocina' | 'bar') => {
    const fullComanda = comandas.find((c) => c.id === comanda.id) || comanda
    const { cocina, bar } = splitComandaParaEstaciones(fullComanda, productos, {
      nombreNegocio,
      soloPendientes: false,
    })
    const ticket = estacion === 'cocina' ? cocina : bar
    if (!ticket) {
      showToast('No hay ítems para esta estación', 'error')
      return
    }
    setReimprimirTickets([{ ...ticket, numero_copia: 'REIMPRESIÓN' }])
    setShowReimprimirDialog(true)
  }

  const isRolCocina = usuarioActual?.rol === 'cocina'
  const isRolBar = usuarioActual?.rol === 'bar'
  const isRolEspecifico = isRolCocina || isRolBar

  const comandasRol = isRolCocina ? comandasCocina : comandasBar

  return (
    <div className="min-h-screen bg-background p-3 md:p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2 md:mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
          {isRolCocina ? (
            <>
              <ChefHat className="h-7 w-7 text-amber-500 md:h-8 md:w-8" />
              Cocina
            </>
          ) : isRolBar ? (
            <>
              <Wine className="h-7 w-7 text-amber-500 md:h-8 md:w-8" />
              Bar
            </>
          ) : (
            'KDS'
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowHistorial(true)}
            variant="outline"
            className="gap-2 border-border min-h-[44px]"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Historial</span>
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            variant="outline"
            className="gap-2 border-border min-h-[44px]"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">{isLoading ? 'Actualizando...' : 'Refrescar'}</span>
          </Button>
        </div>
      </div>

      {/* Role-specific single column OR admin two-column */}
      {isRolEspecifico ? (
        <div className="mx-auto max-w-4xl">
          <div className="mb-4">
            <Badge variant="outline" className="px-4 py-2 text-base">
              {comandasRol.length} pendientes
            </Badge>
          </div>
          <div className="space-y-4">
            {comandasRol.length === 0 ? (
              <EmptyState />
            ) : (
              comandasRol.map((comanda) => (
                <ComandaCard
                  key={comanda.id}
                  comanda={comanda}
                  onMarkReady={handleMarkReady}
                  onReimprimir={(c) => handleReimprimir(c, isRolBar ? 'bar' : 'cocina')}
                  isNew={isNewComanda(comanda)}
                  isDelayed={isDelayedComanda(comanda)}
                  isBar={isRolBar}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* Admin view - two columns on lg, one column below */
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* Cocina */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <ChefHat className="h-6 w-6 text-amber-500" />
                Cocina
              </h2>
              <Badge variant="outline">{comandasCocina.length} pendientes</Badge>
            </div>
            <div className="space-y-4">
              {comandasCocina.length === 0 ? (
                <EmptyState small />
              ) : (
                comandasCocina.map((comanda) => (
                  <ComandaCard
                    key={comanda.id}
                    comanda={comanda}
                    onMarkReady={handleMarkReady}
                    onReimprimir={(c) => handleReimprimir(c, 'cocina')}
                    isNew={isNewComanda(comanda)}
                    isDelayed={isDelayedComanda(comanda)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Bar */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Wine className="h-6 w-6 text-amber-500" />
                Bar
              </h2>
              <Badge variant="outline">{comandasBar.length} pendientes</Badge>
            </div>
            <div className="space-y-4">
              {comandasBar.length === 0 ? (
                <EmptyState small />
              ) : (
                comandasBar.map((comanda) => (
                  <ComandaCard
                    key={comanda.id}
                    comanda={comanda}
                    onMarkReady={handleMarkReady}
                    onReimprimir={(c) => handleReimprimir(c, 'bar')}
                    isNew={isNewComanda(comanda)}
                    isDelayed={isDelayedComanda(comanda)}
                    isBar
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <PrintPreviewDialog
        open={showReimprimirDialog}
        onOpenChange={(v) => {
          setShowReimprimirDialog(v)
          if (!v) setReimprimirTickets([])
        }}
        tickets={reimprimirTickets}
        config={printConfig}
        title="Reimprimir ticket de cocina/bar"
        closeLabel="Cancelar"
      />

      <KDSHistorialDialog
        open={showHistorial}
        onOpenChange={setShowHistorial}
        estacion={isRolCocina ? 'cocina' : isRolBar ? 'bar' : null}
      />
    </div>
  )
}

// Empty state helper
function EmptyState({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border',
        small ? 'p-8' : 'p-12'
      )}
    >
      <Check className={cn('text-green-500', small ? 'h-8 w-8' : 'h-12 w-12')} />
      <p className={cn('mt-2 text-muted-foreground', small ? 'text-sm' : 'text-lg')}>
        Sin pedidos pendientes
      </p>
    </div>
  )
}

// Comanda Card
//
// El KDS muestra los ítems de una comanda agrupados por estación. Cada
// ítem se puede mover de estado por separado: típicamente un jugo o una
// cerveza está listo antes que la burger, y queremos avisar al mesero a
// medida que cada producto está. Por eso cada `<li>` tiene sus propios
// botones de "Preparando / Listo / Problema". Además hay un bloque
// "Todos los pendientes →" abajo para mover en bulk cuando hace falta.
function ComandaCard({
  comanda,
  onMarkReady,
  onReimprimir,
  isNew,
  isDelayed,
  isBar = false,
}: {
  comanda: Comanda
  onMarkReady: (id: string, estado: string, itemIds: string[]) => Promise<void>
  onReimprimir?: (comanda: Comanda) => void
  isNew: boolean
  isDelayed: boolean
  isBar?: boolean
}) {
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const handleItemStateChange = async (itemId: string, estado: string) => {
    setUpdatingIds((prev) => {
      const next = new Set(prev)
      next.add(itemId)
      return next
    })
    try {
      await onMarkReady(comanda.id, estado, [itemId])
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  // Bulk: aplica el estado a todos los ítems aún pendientes (no listos,
  // no entregados). Útil cuando cocina termina varios ítems a la vez.
  const handleBulkStateChange = async (estado: string) => {
    const pendientes = comanda.items.filter(
      (item) => item.estado !== 'listo' && item.estado !== 'entregado',
    )
    if (pendientes.length === 0) return
    setBulkUpdating(true)
    try {
      await onMarkReady(
        comanda.id,
        estado,
        pendientes.map((it) => it.id),
      )
    } finally {
      setBulkUpdating(false)
    }
  }

  const itemBadge = (estado: ItemComanda['estado']) => {
    switch (estado) {
      case 'listo':
        return <Badge className="bg-green-600 text-white text-xs">Listo</Badge>
      case 'en_preparacion':
        return <Badge className="bg-amber-500 text-zinc-900 text-xs">Preparando</Badge>
      case 'problema':
        return <Badge className="bg-red-500 text-white text-xs">Problema</Badge>
      case 'entregado':
        return <Badge className="bg-zinc-500 text-white text-xs">Entregado</Badge>
      default:
        return <Badge variant="outline" className="text-xs">Pendiente</Badge>
    }
  }

  const itemsPendientes = comanda.items.filter(
    (item) => item.estado !== 'listo' && item.estado !== 'entregado',
  )

  return (
    <Card
      className={cn(
        'border-2 transition-all',
        isNew && 'animate-pulse border-amber-500 bg-amber-500/10',
        isDelayed && !isNew && 'border-red-500 bg-red-500/10',
        !isNew && !isDelayed && 'border-border bg-card'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            {comanda.mesaNombre}
            {isNew && <Badge className="bg-amber-500 text-zinc-900 text-xs">NUEVO</Badge>}
            {isDelayed && (
              <Badge className="bg-red-500 text-white text-xs">
                <AlertCircle className="mr-1 h-3 w-3" />
                DEMORADO
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {onReimprimir && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => onReimprimir(comanda)}
                title={`Reimprimir ticket de ${isBar ? 'bar' : 'cocina'}`}
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reimprimir</span>
              </Button>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{getElapsedTime(comanda.creadoAt)}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatTime(comanda.creadoAt)}
          {comanda.usuarioNombre ? ` • ${comanda.usuarioNombre}` : ''}
        </p>
      </CardHeader>

      <CardContent>
        <ul className="mb-4 space-y-3">
          {comanda.items.map((item) => {
            const isItemUpdating = updatingIds.has(item.id) || bulkUpdating
            const listo = item.estado === 'listo' || item.estado === 'entregado'
            return (
              <li
                key={item.id}
                className={cn(
                  'rounded-lg p-3 transition-colors',
                  listo
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-muted',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'text-lg font-bold text-foreground',
                      listo && 'line-through opacity-70',
                    )}
                  >
                    {item.cantidad}x {item.productoNombre}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.variante && (
                      <span className="text-xs text-muted-foreground">
                        ({item.variante})
                      </span>
                    )}
                    {itemBadge(item.estado)}
                  </div>
                </div>
                {item.ingredientesEstandar?.length > 0 && (
                  <p className="mt-1 text-sm text-foreground">
                    + {item.ingredientesEstandar.join(', ')}
                  </p>
                )}
                {item.ingredientesEspeciales?.length > 0 && (
                  <p className="mt-1 text-sm text-amber-500">
                    ⭐ Especiales:{' '}
                    {item.ingredientesEspeciales.map((esp) => esp.nombre).join(', ')}
                  </p>
                )}
                {item.notaEspecial && (
                  <p className="mt-1 rounded bg-amber-500/15 p-2 text-sm font-medium text-amber-600">
                    📝 {item.notaEspecial}
                  </p>
                )}
                {item.salsaSeleccionada && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Salsa: {item.salsaSeleccionada}
                  </p>
                )}
                {item.notas && (
                  <p className="mt-1 rounded bg-yellow-500/20 p-2 text-sm font-medium text-yellow-600">
                    Nota: {item.notas}
                  </p>
                )}

                {/* Botones por ítem. Sólo se muestran cuando todavía hay
                    algo que hacer con este ítem; si ya está listo o
                    entregado, mostramos solo el badge. */}
                {!listo && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[40px] text-xs font-semibold"
                      onClick={() => handleItemStateChange(item.id, 'en_preparacion')}
                      disabled={isItemUpdating || item.estado === 'en_preparacion'}
                    >
                      <Zap className="mr-1 h-3 w-3" />
                      Preparando
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 min-h-[40px] text-xs font-bold text-white hover:bg-green-500"
                      onClick={() => handleItemStateChange(item.id, 'listo')}
                      disabled={isItemUpdating}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Listo
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="min-h-[40px] text-xs font-semibold"
                      onClick={() => handleItemStateChange(item.id, 'problema')}
                      disabled={isItemUpdating}
                    >
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Problema
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Bulk para mover todos los pendientes a la vez. Cuando ya no
            quedan pendientes, ocultamos los botones (la comanda está por
            salir del KDS apenas se actualicen los listados). */}
        {itemsPendientes.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-2">
            <p className="mb-2 text-center text-xs uppercase tracking-wide text-muted-foreground">
              Todos los pendientes ({itemsPendientes.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="border-border min-h-[44px] text-xs font-semibold"
                onClick={() => handleBulkStateChange('en_preparacion')}
                disabled={bulkUpdating}
              >
                <Zap className="mr-1 h-3 w-3" />
                Preparando
              </Button>
              <Button
                className="bg-green-600 min-h-[44px] text-sm font-bold text-white hover:bg-green-500"
                onClick={() => handleBulkStateChange('listo')}
                disabled={bulkUpdating}
              >
                <Check className="mr-1 h-4 w-4" />
                Listo
              </Button>
              <Button
                variant="destructive"
                className="min-h-[44px] text-xs font-semibold"
                onClick={() => handleBulkStateChange('problema')}
                disabled={bulkUpdating}
              >
                <AlertCircle className="mr-1 h-3 w-3" />
                Problema
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

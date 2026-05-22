'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatTime, getElapsedTime } from '@/lib/helpers'
import { Check, ChefHat, Wine, Clock, AlertCircle, Zap, RefreshCw } from 'lucide-react'
import { showToast } from '@/components/toast'
import type { Comanda, ItemComanda } from '@/lib/types'

export function KDSPage() {
  const { state, dispatch, updateOrden, recargarOrdenes } = useApp()
  const { comandas, usuarioActual, productos } = state
  const [isLoading, setIsLoading] = useState(false)
  const [, setTick] = useState(0)

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

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

  // Filter comandas that are in kitchen flow
  const comandasActivas = comandas.filter(
    (c) => c.estado === 'en_cocina' || c.estado === 'en_preparacion'
  )

  const CATEGORIAS_BAR = ['bebidas', 'cervezas', 'jugos_bebidas', 'tragos']

  const isBarItem = (item: ItemComanda) => {
    const producto = productos.find((p) => p.id === item.productoId)
    return CATEGORIAS_BAR.includes(producto?.categoria || '')
  }

  const isCocinaItem = (item: ItemComanda) => !isBarItem(item)

  const getComandasForSection = (filterFn: (item: ItemComanda) => boolean) =>
    comandasActivas
      .map((comanda) => ({ ...comanda, items: comanda.items.filter(filterFn) }))
      .filter((comanda) => comanda.items.length > 0)

  const comandasCocina = getComandasForSection(isCocinaItem)
  const comandasBar = getComandasForSection(isBarItem)

  const handleMarkReady = async (comandaId: string, estado: string) => {
    const comanda = comandas.find((c) => c.id === comandaId)
    if (!comanda) return

    if (estado === 'problema') {
      showToast(`Comanda ${comanda.mesaNombre} con problema - notificando al mesero`, 'error')
      dispatch({
        type: 'ADD_NOTIFICACION',
        payload: {
          id: `notif_${Date.now()}`,
          tipo: 'problema',
          ordenId: comandaId,
          mesaNombre: comanda.mesaNombre,
          mensaje: `Problema en orden de ${comanda.mesaNombre}`,
          timestamp: Date.now(),
          vista: false,
        },
      })
    } else {
      await updateOrden(comandaId, { estado })
      const label =
        estado === 'en_preparacion' ? 'En preparacion' : 'Lista para entregar'
      showToast(`${comanda.mesaNombre} - ${label}`, 'success')
    }
  }

  const isNewComanda = (comanda: Comanda) => Date.now() - comanda.creadoAt < 30000
  const isDelayedComanda = (comanda: Comanda) =>
    Date.now() - comanda.creadoAt > 15 * 60 * 1000

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
                  isNew={isNewComanda(comanda)}
                  isDelayed={isDelayedComanda(comanda)}
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
function ComandaCard({
  comanda,
  onMarkReady,
  isNew,
  isDelayed,
  isBar = false,
}: {
  comanda: Comanda
  onMarkReady: (id: string, estado: string) => Promise<void>
  isNew: boolean
  isDelayed: boolean
  isBar?: boolean
}) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleStateChange = async (estado: string) => {
    setIsUpdating(true)
    try {
      await onMarkReady(comanda.id, estado)
    } finally {
      setIsUpdating(false)
    }
  }

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
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{getElapsedTime(comanda.creadoAt)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatTime(comanda.creadoAt)}
          {comanda.usuarioNombre ? ` • ${comanda.usuarioNombre}` : ''}
        </p>
      </CardHeader>

      <CardContent>
        <ul className="mb-4 space-y-2">
          {comanda.items.map((item) => (
            <li key={item.id} className="rounded-lg bg-muted p-3">
              <div className="flex items-start justify-between">
                <span className="text-lg font-bold text-foreground">
                  {item.cantidad}x {item.productoNombre}
                </span>
                {item.variante && (
                  <span className="text-xs text-muted-foreground">({item.variante})</span>
                )}
              </div>
              {item.ingredientesEstandar?.length > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  + {item.ingredientesEstandar.join(', ')}
                </p>
              )}
              {item.ingredientesEspeciales?.length > 0 && (
                <p className="mt-1 text-sm text-amber-500">
                  ⭐ Especiales: {item.ingredientesEspeciales.map(esp => esp.nombre).join(', ')}
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
            </li>
          ))}
        </ul>

        {/* Action buttons — touch-friendly */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="border-border min-h-[56px] text-sm font-semibold"
            onClick={() => handleStateChange('en_preparacion')}
            disabled={isUpdating}
          >
            <Zap className="mr-1 h-4 w-4" />
            Preparando
          </Button>
          <Button
            className="bg-green-600 min-h-[56px] text-base font-bold text-white hover:bg-green-500"
            onClick={() => handleStateChange('listo')}
            disabled={isUpdating}
          >
            <Check className="mr-1 h-5 w-5" />
            Listo
          </Button>
          <Button
            variant="destructive"
            className="min-h-[56px] text-sm font-semibold"
            onClick={() => handleStateChange('problema')}
            disabled={isUpdating}
          >
            <AlertCircle className="mr-1 h-4 w-4" />
            Problema
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

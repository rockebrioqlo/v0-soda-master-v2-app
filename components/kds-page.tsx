'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatTime, getElapsedTime, getRolLabel } from '@/lib/helpers'
import { Check, ChefHat, Wine, Clock, AlertCircle, Zap } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Comanda, ItemComanda } from '@/lib/types'

export function KDSPage() {
  const { state, dispatch, updateOrden, recargarOrdenes } = useApp()
  const { comandas, usuarioActual } = state
  const [isLoading, setIsLoading] = useState(false)
  const [, setTick] = useState(0)

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Manual refresh function
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      await recargarOrdenes()
      showToast('Órdenes actualizadas', 'success')
    } catch (error) {
      showToast('Error al actualizar', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter comandas that are in kitchen
  const comandasEnCocina = comandas.filter(c => c.estado === 'en_cocina')

  // Separate items by type (cocina vs bar)
  const isBarItem = (item: ItemComanda) => {
    const producto = state.productos.find(p => p.id === item.productoId)
    return producto?.categoria === 'bebidas'
  }

  const isCocinaItem = (item: ItemComanda) => {
    return !isBarItem(item)
  }

  // Get comandas for each section
  const getComandasForSection = (filterFn: (item: ItemComanda) => boolean) => {
    return comandasEnCocina
      .map(comanda => ({
        ...comanda,
        items: comanda.items.filter(filterFn)
      }))
      .filter(comanda => comanda.items.length > 0)
  }

  const comandasCocina = getComandasForSection(isCocinaItem)
  const comandasBar = getComandasForSection(isBarItem)

  // Determine which sections to show based on role
  const showCocina = !usuarioActual || usuarioActual.rol === 'administrador' || usuarioActual.rol === 'cocina'
  const showBar = !usuarioActual || usuarioActual.rol === 'administrador' || usuarioActual.rol === 'bar'

  const handleMarkReady = async (comandaId: string, estado: string) => {
    const comanda = comandas.find(c => c.id === comandaId)
    if (!comanda) return

    if (estado === 'problema') {
      // Show modal for problem resolution
      showToast(`Comanda ${comanda.mesaNombre} tiene problema - notificando al mesero`, 'error')
      // Create notification
      dispatch({
        type: 'ADD_NOTIFICACION',
        payload: {
          id: `notif_${Date.now()}`,
          tipo: 'problema',
          ordenId: comandaId,
          mesaNombre: comanda.mesaNombre,
          mensaje: `Problema en orden de ${comanda.mesaNombre}`,
          timestamp: Date.now(),
          vista: false
        }
      })
    } else {
      // Update order status in Neon
      await updateOrden(comandaId, { estado })
      showToast(`Comanda de ${comanda.mesaNombre} - ${estado === 'en_preparacion' ? 'En preparación' : 'Lista'}`, 'success')
    }
  }

  // Check if comanda is new (less than 30 seconds old)
  const isNewComanda = (comanda: Comanda) => {
    return Date.now() - comanda.creadoAt < 30000
  }

  // Check if comanda is taking too long (more than 15 minutes)
  const isDelayed = (comanda: Comanda) => {
    return Date.now() - comanda.creadoAt > 15 * 60 * 1000
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header with refresh button */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          {usuarioActual?.rol === 'cocina' ? (
            <>
              <ChefHat className="h-8 w-8 text-amber-500" />
              Cocina
            </>
          ) : usuarioActual?.rol === 'bar' ? (
            <>
              <Wine className="h-8 w-8 text-amber-500" />
              Bar
            </>
          ) : (
            'Kitchen Display System'
          )}
        </h1>
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="outline"
          className="border-border"
        >
          {isLoading ? 'Actualizando...' : 'Refrescar'}
        </Button>
      </div>

      {/* Role-specific view */}
      {(usuarioActual?.rol === 'cocina' || usuarioActual?.rol === 'bar') ? (
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-center justify-between">
            <Badge variant="outline" className="text-lg px-4 py-2">
              {comandasEnCocina.length} pendientes
            </Badge>
          </div>
          <div className="space-y-4">
            {(usuarioActual.rol === 'cocina' ? comandasCocina : comandasBar).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12">
                <Check className="h-12 w-12 text-green-500" />
                <p className="mt-4 text-lg text-muted-foreground">No hay pedidos pendientes</p>
              </div>
            ) : (
              (usuarioActual.rol === 'cocina' ? comandasCocina : comandasBar).map(comanda => (
                <ComandaCard
                  key={comanda.id}
                  comanda={comanda}
                  onMarkReady={handleMarkReady}
                  isNew={isNewComanda(comanda)}
                  isDelayed={isDelayed(comanda)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* Admin view - two columns */
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cocina Column */}
          {showCocina && (
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
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                    <Check className="h-8 w-8 text-green-500" />
                    <p className="mt-2 text-sm text-muted-foreground">Sin pedidos</p>
                  </div>
                ) : (
                  comandasCocina.map(comanda => (
                    <ComandaCard
                      key={comanda.id}
                      comanda={comanda}
                      onMarkReady={handleMarkReady}
                      isNew={isNewComanda(comanda)}
                      isDelayed={isDelayed(comanda)}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Bar Column */}
          {showBar && (
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
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                    <Check className="h-8 w-8 text-green-500" />
                    <p className="mt-2 text-sm text-muted-foreground">Sin pedidos</p>
                  </div>
                ) : (
                  comandasBar.map(comanda => (
                    <ComandaCard
                      key={comanda.id}
                      comanda={comanda}
                      onMarkReady={handleMarkReady}
                      isNew={isNewComanda(comanda)}
                      isDelayed={isDelayed(comanda)}
                      isBar
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Comanda Card Component
function ComandaCard({
  comanda,
  onMarkReady,
  isNew,
  isDelayed,
  isBar = false
}: {
  comanda: Comanda
  onMarkReady: (id: string, estado: string) => void
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
        isDelayed && 'border-red-500 bg-red-500/10',
        !isNew && !isDelayed && 'border-border bg-card'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            {comanda.mesaNombre}
            {isNew && (
              <Badge className="bg-amber-500 text-zinc-900">NUEVO</Badge>
            )}
            {isDelayed && (
              <Badge className="bg-red-500 text-white">
                <AlertCircle className="mr-1 h-3 w-3" />
                DEMORADO
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{getElapsedTime(comanda.creadoAt)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatTime(comanda.creadoAt)} • Atendido por: {comanda.usuarioNombre}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 space-y-2">
          {comanda.items.map((item) => (
            <li key={item.id} className="rounded-lg bg-muted p-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-lg font-bold text-foreground">
                    {item.cantidad}x {item.productoNombre}
                  </span>
                  {item.variante && (
                    <span className="ml-2 text-sm text-muted-foreground">({item.variante})</span>
                  )}
                </div>
              </div>
              {item.ingredientesEstandar.length > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  + {item.ingredientesEstandar.join(', ')}
                </p>
              )}
              {item.ingredientesEspeciales.length > 0 && (
                <p className="mt-1 text-sm text-amber-500">
                  ⭐ Especiales: {item.ingredientesEspeciales.join(', ')}
                </p>
              )}
              {item.salsaSeleccionada && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Salsa: {item.salsaSeleccionada}
                </p>
              )}
              {item.notas && (
                <p className="mt-1 rounded bg-yellow-500/20 p-2 text-sm font-medium text-yellow-500">
                  📝 {item.notas}
                </p>
              )}
            </li>
          ))}
        </ul>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="border-border text-sm"
            onClick={() => handleStateChange('en_preparacion')}
            disabled={isUpdating}
          >
            <Zap className="mr-1 h-4 w-4" />
            Preparando
          </Button>
          <Button
            className="bg-green-600 text-sm text-white hover:bg-green-500"
            onClick={() => handleStateChange('listo')}
            disabled={isUpdating}
          >
            <Check className="mr-1 h-4 w-4" />
            Listo
          </Button>
          <Button
            variant="destructive"
            className="text-sm"
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

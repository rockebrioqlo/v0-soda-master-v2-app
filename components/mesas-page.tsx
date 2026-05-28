'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getEstadoMesaColor, getEstadoMesaLabel } from '@/lib/helpers'
import { Plus, Users, Edit, Trash2, ShoppingCart, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { showToast } from '@/components/toast'
import { Mesa, EstadoMesa } from '@/lib/types'

export function MesasPage() {
  const {
    state,
    navigateToPOS,
    updateMesa,
    updateOrden,
    crearMesaApi,
    eliminarMesaApi,
  } = useApp()
  const { mesas, comandas, usuarioActual } = state

  const esAdmin =
    !!usuarioActual && ['administrador', 'admin'].includes(usuarioActual.rol)

  const [showDialog, setShowDialog] = useState(false)
  const [editingMesa, setEditingMesa] = useState<Mesa | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    capacidad: '4',
    estado: 'libre' as EstadoMesa
  })

  // Override admin para forzar libre con comanda activa
  const [overrideMesa, setOverrideMesa] = useState<Mesa | null>(null)
  const [overrideMotivo, setOverrideMotivo] = useState('')
  const [overrideTrabajando, setOverrideTrabajando] = useState(false)

  const getComandaActiva = (mesaId: string) => {
    return comandas.find(
      c =>
        c.mesaId === mesaId &&
        !['pagado', 'cancelado', 'perdida'].includes(c.estado) &&
        c.items.length > 0
    )
  }

  // Comanda más reciente de la mesa, sin importar si está pagada/cancelada.
  // Sirve para mostrar el hint "Pagada — esperando liberar" cuando la mesa
  // sigue ocupada después del cobro.
  const getUltimaComanda = (mesaId: string) => {
    return comandas
      .filter((c) => c.mesaId === mesaId)
      .sort((a, b) => b.creadoAt - a.creadoAt)[0]
  }

  const handleOpenNew = () => {
    setEditingMesa(null)
    setFormData({ nombre: '', capacidad: '4', estado: 'libre' })
    setShowDialog(true)
  }

  const handleEdit = (mesa: Mesa) => {
    setEditingMesa(mesa)
    setFormData({
      nombre: mesa.nombre,
      capacidad: mesa.capacidad.toString(),
      estado: mesa.estado
    })
    setShowDialog(true)
  }

  const handleDelete = async (mesaId: string) => {
    const comanda = getComandaActiva(mesaId)
    if (comanda) {
      showToast('No se puede eliminar una mesa con comanda activa', 'error')
      return
    }
    try {
      await eliminarMesaApi(mesaId)
      showToast('Mesa eliminada', 'success')
    } catch (error: any) {
      showToast(error?.message || 'Error al eliminar mesa', 'error')
    }
  }

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      showToast('El nombre es requerido', 'error')
      return
    }

    try {
      if (editingMesa) {
        await updateMesa(editingMesa.id, {
          capacidad: parseInt(formData.capacidad),
          estado: formData.estado,
        })
        showToast('Mesa actualizada', 'success')
      } else {
        await crearMesaApi({
          nombre: formData.nombre,
          capacidad: parseInt(formData.capacidad),
          estado: formData.estado,
        })
        showToast('Mesa creada', 'success')
      }

      setShowDialog(false)
    } catch (error: any) {
      showToast(error?.message || 'Error al guardar mesa', 'error')
    }
  }

  const handleMesaClick = (mesa: Mesa) => {
    if (mesa.estado === 'ocupada') {
      const comanda = getComandaActiva(mesa.id)
      if (comanda) {
        navigateToPOS(mesa.id, comanda.id)
      } else {
        navigateToPOS(mesa.id)
      }
    } else if (mesa.estado === 'libre') {
      // Start new order for this table
      navigateToPOS(mesa.id)
    }
  }

  const handleChangeEstado = async (mesa: Mesa, nuevoEstado: EstadoMesa) => {
    const comanda = getComandaActiva(mesa.id)

    if (mesa.estado === 'ocupada' && nuevoEstado === 'libre' && comanda) {
      if (esAdmin) {
        // Admin puede forzar la liberación: se abre un diálogo de motivo
        // y al confirmar la comanda se cancela y la mesa queda libre.
        setOverrideMesa(mesa)
        setOverrideMotivo('')
        return
      }
      showToast(
        'No se puede liberar: la comanda no ha sido pagada. Pide a un administrador que lo autorice.',
        'error',
      )
      return
    }

    await updateMesa(mesa.id, { estado: nuevoEstado })
    showToast(`Mesa ${mesa.nombre} ahora está ${getEstadoMesaLabel(nuevoEstado).toLowerCase()}`, 'success')
  }

  const handleConfirmOverride = async () => {
    if (!overrideMesa || overrideTrabajando) return
    const motivo = overrideMotivo.trim()
    if (!motivo) {
      showToast('Ingresa el motivo de la liberación forzada', 'error')
      return
    }
    setOverrideTrabajando(true)
    try {
      const comanda = getComandaActiva(overrideMesa.id)
      if (comanda) {
        // La comanda se marca como cancelada con la nota del motivo, para
        // que quede trazabilidad de la pérdida (mesero/admin puede generar
        // una merma desde la pantalla correspondiente si corresponde).
        const nota = `[LIBERACIÓN FORZADA por ${usuarioActual?.nombre || 'admin'}] ${motivo}`
        await updateOrden(comanda.id, { estado: 'cancelado', notas: nota })
      }
      await updateMesa(overrideMesa.id, { estado: 'libre' })
      showToast(`Mesa ${overrideMesa.nombre} liberada (forzada por admin)`, 'success')
      setOverrideMesa(null)
      setOverrideMotivo('')
    } catch (error: any) {
      showToast(error?.message || 'Error al liberar mesa', 'error')
    } finally {
      setOverrideTrabajando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Gestion de Mesas</h1>
        <Button onClick={handleOpenNew} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Mesa
        </Button>
      </div>

        {/* Legend */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Libre</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-muted-foreground">Ocupada</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-500" />
            <span className="text-sm text-muted-foreground">Reservada</span>
          </div>
        </div>

        {/* Mesas Grid */}
        <div className="grid gap-3 grid-cols-2 md:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mesas.map((mesa) => {
            const comandaActiva = getComandaActiva(mesa.id)
            const ultimaComanda = getUltimaComanda(mesa.id)
            // Mesa ocupada SIN comanda activa: la última comanda quedó cerrada
            // (pagada o perro muerto) y la mesa espera liberación manual.
            const pagadaEsperandoLiberar =
              mesa.estado === 'ocupada' &&
              !comandaActiva &&
              ultimaComanda?.estado === 'pagado'
            const perdidaEsperandoLiberar =
              mesa.estado === 'ocupada' &&
              !comandaActiva &&
              ultimaComanda?.estado === 'perdida'
            return (
              <Card
                key={mesa.id}
                className={cn(
                  'cursor-pointer border-2 transition-all hover:scale-[1.02] min-h-[100px]',
                  mesa.estado === 'libre' && 'border-green-500/50 bg-green-500/10',
                  mesa.estado === 'ocupada' &&
                    !pagadaEsperandoLiberar &&
                    !perdidaEsperandoLiberar &&
                    'border-red-500/50 bg-red-500/10',
                  mesa.estado === 'ocupada' && pagadaEsperandoLiberar && 'border-blue-500/50 bg-blue-500/10',
                  mesa.estado === 'ocupada' && perdidaEsperandoLiberar && 'border-rose-700/60 bg-rose-700/10',
                  mesa.estado === 'reservada' && 'border-yellow-500/50 bg-yellow-500/10'
                )}
                onClick={() => handleMesaClick(mesa)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg font-bold text-foreground">{mesa.nombre}</CardTitle>
                    <span className={cn('rounded-full px-2 py-1 text-[10px] font-medium text-white md:text-xs', getEstadoMesaColor(mesa.estado))}>
                      {getEstadoMesaLabel(mesa.estado)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Capacidad: {mesa.capacidad}</span>
                  </div>

                  {comandaActiva && (
                    <div className="mt-2 flex items-center gap-2 text-amber-500">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="text-sm">Comanda activa ({comandaActiva.items.length} items)</span>
                    </div>
                  )}

                  {pagadaEsperandoLiberar && (
                    <div className="mt-2 flex items-center gap-2 text-blue-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Pagada — listo para liberar</span>
                    </div>
                  )}

                  {perdidaEsperandoLiberar && (
                    <div className="mt-2 flex items-center gap-2 text-rose-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">Perro muerto — lista para liberar</span>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2" onClick={e => e.stopPropagation()}>
                    <Select
                      value={mesa.estado}
                      onValueChange={(value) => handleChangeEstado(mesa, value as EstadoMesa)}
                    >
                      <SelectTrigger className="h-8 flex-1 border-border bg-muted text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="libre">Libre</SelectItem>
                        <SelectItem value="ocupada">Ocupada</SelectItem>
                        <SelectItem value="reservada">Reservada</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(mesa)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-400"
                      onClick={() => handleDelete(mesa.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Dialog for New/Edit Mesa */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingMesa ? 'Editar Mesa' : 'Nueva Mesa'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Nombre</label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Mesa 6"
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Capacidad</label>
                <Select
                  value={formData.capacidad}
                  onValueChange={(value) => setFormData({ ...formData, capacidad: value })}
                >
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 6, 8, 10, 12].map((cap) => (
                      <SelectItem key={cap} value={cap.toString()}>
                        {cap} personas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Estado Inicial</label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => setFormData({ ...formData, estado: value as EstadoMesa })}
                >
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="libre">Libre</SelectItem>
                    <SelectItem value="ocupada">Ocupada</SelectItem>
                    <SelectItem value="reservada">Reservada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                {editingMesa ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Override admin: forzar libre con comanda activa */}
        <Dialog
          open={!!overrideMesa}
          onOpenChange={(v) => {
            if (!v && !overrideTrabajando) {
              setOverrideMesa(null)
              setOverrideMotivo('')
            }
          }}
        >
          <DialogContent className="border-red-500/50 bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Liberar mesa sin pago
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {overrideMesa?.nombre} tiene una comanda activa sin pagar. Al continuar:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                <li>La comanda quedará marcada como <strong>cancelada</strong> con tu motivo.</li>
                <li>La mesa pasará a <strong>libre</strong>.</li>
                <li>Esta acción queda registrada en la orden para auditoría.</li>
              </ul>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Motivo (obligatorio)
                </label>
                <Textarea
                  value={overrideMotivo}
                  onChange={(e) => setOverrideMotivo(e.target.value)}
                  placeholder="Ej: cliente se retiró sin pagar, regalo institucional, …"
                  className="border-border bg-muted"
                  rows={3}
                  disabled={overrideTrabajando}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOverrideMesa(null)
                  setOverrideMotivo('')
                }}
                disabled={overrideTrabajando}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmOverride}
                disabled={overrideTrabajando || !overrideMotivo.trim()}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {overrideTrabajando ? 'Liberando…' : 'Confirmar liberación'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
